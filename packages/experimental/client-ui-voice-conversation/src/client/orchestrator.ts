/**
 * 连续语音对话状态机：监听 → 识别 → 发送 → 等待回答 → 朗读 → 回到监听。
 *
 * 边界：不直接碰浏览器 API、不订阅 Cordis 服务，全部外部能力经 deps 注入，
 * 因此可以在单测里用假采集、假识别、假朗读驱动。UI 只读取视图快照。
 */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { IDLE_VIEW, type VoiceConversationFailure, type VoiceConversationView } from './model.ts'

/** 采集端口：由 capture.ts 适配。 */
export interface VoiceCapturePort {
  start(): Promise<void>
  stop(): Promise<void>
}

/** 采集回调；与 capture.ts 的同名回调保持一致。 */
export interface VoiceCaptureHandlers {
  onSegment(wav: Uint8Array): void
  onSpeechChange(speaking: boolean): void
  onError(kind: 'permission' | 'unavailable' | 'deviceMissing' | 'interrupted'): void
}

/** 朗读端口：由 tts.ts 适配。 */
export interface VoiceSpeakerPort {
  readonly available: boolean
  speak(text: string): Promise<void>
  cancel(): void
}

/** 输入框写入端口：由面板把插槽提供的 inputActions 适配成最小面。 */
export interface ComposerSink {
  /** 当前是否不允许发送（提交中或模型仍在回答）。 */
  readonly locked: boolean
  /** 写入并提交一句话；返回是否成功。 */
  send(text: string): boolean
}

/** 状态机依赖；测试时全部替换为假实现。 */
export interface VoiceConversationDeps {
  /** 确保本地识别模型就绪；未就绪时在内部完成下载与加载。 */
  prepare(signal: AbortSignal): Promise<void>
  createCapture(handlers: VoiceCaptureHandlers): VoiceCapturePort
  /** 把 WAV 字节识别为文本；失败时抛错。 */
  transcribe(wav: Uint8Array, signal: AbortSignal): Promise<string>
  createSpeaker(): VoiceSpeakerPort
  /** 读取当前会话最后一条助手文本，用于回合结束后朗读。 */
  readAssistantText(): string
}

/** 每个会话一个的连续对话控制器。 */
export class VoiceConversationController implements ObservableSnapshot<VoiceConversationView> {
  private view: VoiceConversationView = IDLE_VIEW
  private readonly listeners = new Set<() => void>()
  private composer: ComposerSink | undefined
  private capture: VoiceCapturePort | undefined
  private speaker: VoiceSpeakerPort | undefined
  private aborter: AbortController | undefined
  private sawRunning = false
  private thinkingTimer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private disposed = false

  constructor(private readonly deps: VoiceConversationDeps) {}

  /** @returns 当前视图快照（引用稳定）。 */
  getSnapshot(): VoiceConversationView {
    return this.view
  }

  /**
   * 订阅视图变化。
   * @param listener - 失效回调。
   * @returns 取消订阅。
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** 每次渲染同步最新的输入框能力；停止或卸载时传 undefined。 */
  setComposer(sink: ComposerSink | undefined): void {
    this.composer = sink
  }

  /** 开启连续对话：申请麦克风并进入监听。 */
  async start(): Promise<void> {
    if (this.disposed || this.view.phase !== 'idle') return
    await this.release()
    this.generation += 1
    const generation = this.generation
    const aborter = new AbortController()
    this.aborter = aborter
    this.setView({ phase: 'preparing', transcript: this.view.transcript })
    try {
      await this.deps.prepare(aborter.signal)
    } catch {
      if (generation !== this.generation) return
      this.fail('prepare')
      await this.release()
      return
    }
    if (generation !== this.generation) return
    this.aborter = undefined
    this.speaker = this.deps.createSpeaker()
    const input = this.deps.createCapture({
      onSegment: (wav) => { void this.onSegment(wav) },
      onSpeechChange: (speaking) => { this.onSpeechChange(speaking) },
      onError: (kind) => { this.fail(captureFailure(kind)) },
    })
    this.capture = input
    this.setView({ phase: 'listening', transcript: this.view.transcript })
    try {
      await input.start()
    } catch (error) {
      this.fail(captureFailureOf(error))
      await this.release()
    }
  }

  /** 结束连续对话并释放麦克风与朗读。 */
  async stop(): Promise<void> {
    await this.release()
    this.setView({ phase: 'idle', transcript: '' })
  }

  /** 插件卸载时调用；不再接受新的开始请求。 */
  dispose(): void {
    this.disposed = true
    void this.release()
  }

  /** 一句话结束：识别 → 写入并发送 → 等待回答。 */
  private async onSegment(wav: Uint8Array): Promise<void> {
    if (this.view.phase !== 'listening') return
    const generation = this.generation
    this.setView({ phase: 'transcribing', transcript: this.view.transcript })
    const aborter = new AbortController()
    this.aborter = aborter
    let text: string
    try {
      text = await this.deps.transcribe(wav, aborter.signal)
    } catch {
      if (generation !== this.generation) return
      this.fail('transcribe')
      return
    }
    if (generation !== this.generation) return
    this.aborter = undefined
    const trimmed = text.trim()
    if (trimmed === '') {
      this.setView({ phase: 'listening', transcript: '' })
      return
    }
    const composer = this.composer
    if (composer === undefined || composer.locked) {
      // 模型还在回答时不插话：保留文本，回到监听等下一句。
      this.setView({ phase: 'listening', transcript: trimmed })
      return
    }
    this.setView({ phase: 'sending', transcript: trimmed })
    if (!composer.send(trimmed)) {
      this.fail('send')
      return
    }
    this.sawRunning = false
    this.setView({ phase: 'thinking', transcript: trimmed })
    this.armThinkingWatch()
  }

  /**
   * 由面板把会话的“正在运行”状态同步进来；从运行回到空闲即视为本回合结束。
   * @param running - 当前会话是否仍在生成。
   */
  setSessionRunning(running: boolean): void {
    if (running) {
      this.sawRunning = true
      this.clearThinkingWatch()
      return
    }
    if (!this.sawRunning) return
    this.sawRunning = false
    if (this.view.phase === 'thinking') void this.completeTurn()
  }

  /** 兜底：提交后两秒仍未观察到运行中，也认为回合已结束，避免一直停在等待态。 */
  private armThinkingWatch(): void {
    this.clearThinkingWatch()
    this.thinkingTimer = setTimeout(() => {
      this.thinkingTimer = undefined
      if (this.view.phase === 'thinking' && !this.sawRunning) void this.completeTurn()
    }, 2_000)
  }

  /** 清除兜底计时器。 */
  private clearThinkingWatch(): void {
    if (this.thinkingTimer === undefined) return
    clearTimeout(this.thinkingTimer)
    this.thinkingTimer = undefined
  }

  /** 用户开口：朗读中则立即停止朗读，交回监听。 */
  private onSpeechChange(speaking: boolean): void {
    if (!speaking || this.view.phase !== 'speaking') return
    this.speaker?.cancel()
    this.setView({ phase: 'listening', transcript: this.view.transcript })
  }

  /** 回合结束：朗读本回合回答，完成后回到监听。 */
  private async completeTurn(): Promise<void> {
    if (this.view.phase !== 'thinking') return
    this.clearThinkingWatch()
    const generation = this.generation
    const speaker = this.speaker
    const text = this.deps.readAssistantText()
    if (speaker === undefined || !speaker.available || text.trim() === '') {
      this.setView({ phase: 'listening', transcript: this.view.transcript })
      return
    }
    this.setView({ phase: 'speaking', transcript: this.view.transcript })
    await speaker.speak(text)
    if (generation !== this.generation || this.currentPhase() !== 'speaking') return
    this.setView({ phase: 'listening', transcript: this.view.transcript })
  }

  /** 读取当前阶段；方法调用用于打断 TypeScript 对 `this.view` 的属性收窄。 */
  private currentPhase(): VoiceConversationView['phase'] {
    return this.view.phase
  }

  /** 进入错误态；由用户停止后重新开始。 */
  private fail(failure: VoiceConversationFailure): void {
    this.setView({ phase: 'error', transcript: this.view.transcript, failure })
  }

  /** 释放采集、朗读、计时器与在途识别。 */
  private async release(): Promise<void> {
    this.generation += 1
    this.clearThinkingWatch()
    this.sawRunning = false
    this.aborter?.abort()
    this.aborter = undefined
    this.speaker?.cancel()
    this.speaker = undefined
    const capture = this.capture
    this.capture = undefined
    if (capture !== undefined) await capture.stop()
  }

  /** 发布新视图；相同引用时不通知。 */
  private setView(view: VoiceConversationView): void {
    if (view.phase === this.view.phase && view.transcript === this.view.transcript && view.failure === this.view.failure) return
    this.view = view
    for (const listener of [...this.listeners]) listener()
  }
}

/** 采集失败类型 → 需要本地化的失败原因。 */
function captureFailure(kind: 'permission' | 'unavailable' | 'deviceMissing' | 'interrupted'): VoiceConversationFailure {
  if (kind === 'permission') return 'permission'
  if (kind === 'interrupted') return 'interrupted'
  return 'unavailable'
}

/** 采集启动异常 → 失败原因；识别采集类错误的 kind 字段。 */
function captureFailureOf(error: unknown): VoiceConversationFailure {
  const kind = (error as { kind?: string } | null)?.kind
  if (kind === 'permission') return 'permission'
  if (kind === 'interrupted') return 'interrupted'
  if (kind === 'unavailable' || kind === 'deviceMissing') return 'unavailable'
  return 'unavailable'
}
