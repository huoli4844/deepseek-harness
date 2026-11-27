/**
 * 常开麦克风采集：一次授权、持续监听，按 VAD 自动切分单句话并编码为 WAV。
 *
 * 边界：只负责浏览器音频 I/O（getUserMedia / AudioContext / MediaRecorder），
 * 不调用识别服务、不提交消息、不朗读。断句规则下沉到 vad.ts，编码到 wav.ts。
 */
import { DEFAULT_VAD, VoiceActivityDetector, type VadOptions } from './vad.ts'
import { encodeWave } from './wav.ts'

/** 采集失败的类型；由调用方映射成本地化文案。 */
export type CaptureFailureKind = 'unavailable' | 'permission' | 'deviceMissing' | 'interrupted'

/** 采集失败；message 保持类型名，避免把英文句子散落到 UI。 */
export class CaptureFailure extends Error {
  constructor(readonly kind: CaptureFailureKind) {
    super(kind)
    this.name = 'CaptureFailure'
  }
}

/** 采集回调；所有回调都在采集生命周期内同步触发。 */
export interface CaptureHandlers {
  /** 一句话结束，交出可提交识别的 WAV 字节。 */
  onSegment(wav: Uint8Array): void
  /** 用户开口/停顿的位置变化，用于朗读打断。 */
  onSpeechChange?(speaking: boolean): void
  /** 麦克风不可用或中途断开。 */
  onError?(failure: CaptureFailure): void
}

/** 采集参数；只为测试和调参暴露。 */
export interface ContinuousCaptureOptions {
  readonly vad?: VadOptions
  /** 音量采样间隔。 */
  readonly frameMs?: number
  /** 单句最长时长，超时强制断句，避免一直说下去。 */
  readonly maxUtteranceMs?: number
  /** 短于该时长的声音视为咳嗽等噪声。 */
  readonly minUtteranceMs?: number
}

const DEFAULT_FRAME_MS = 100
const DEFAULT_MAX_UTTERANCE_MS = 15_000
const DEFAULT_MIN_UTTERANCE_MS = 250

/** 一个会话内共享的常开麦克风采集器。 */
export class ContinuousCapture {
  private stream: MediaStream | undefined
  private context: AudioContext | undefined
  private analyser: AnalyserNode | undefined
  private samples = new Float32Array(1024)
  private timer: ReturnType<typeof setInterval> | undefined
  private recorder: MediaRecorder | undefined
  private chunks: Blob[] = []
  private startedAt = 0
  private finishing = false
  private stopped = false
  private readonly vad: VoiceActivityDetector
  private readonly frameMs: number
  private readonly maxUtteranceMs: number
  private readonly minUtteranceMs: number

  constructor(private readonly handlers: CaptureHandlers, options: ContinuousCaptureOptions = {}) {
    this.vad = new VoiceActivityDetector(options.vad ?? DEFAULT_VAD)
    this.frameMs = options.frameMs ?? DEFAULT_FRAME_MS
    this.maxUtteranceMs = options.maxUtteranceMs ?? DEFAULT_MAX_UTTERANCE_MS
    this.minUtteranceMs = options.minUtteranceMs ?? DEFAULT_MIN_UTTERANCE_MS
  }

  /**
   * 申请麦克风并开始持续监听。
   * @returns 权限与音频图就绪后完成；失败抛出 CaptureFailure。
   */
  async start(): Promise<void> {
    const devices = (navigator as { mediaDevices?: MediaDevices }).mediaDevices
    if (devices === undefined || typeof MediaRecorder === 'undefined') throw new CaptureFailure('unavailable')
    let stream: MediaStream
    try {
      stream = await devices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') throw new CaptureFailure('permission')
        if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') throw new CaptureFailure('deviceMissing')
      }
      throw new CaptureFailure('unavailable')
    }
    if (this.stopped) {
      stream.getTracks().forEach((track) => { track.stop() })
      throw new CaptureFailure('interrupted')
    }
    this.stream = stream
    try {
      this.context = new AudioContext()
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = this.samples.length
      this.context.createMediaStreamSource(stream).connect(this.analyser)
    } catch {
      await this.stop()
      throw new CaptureFailure('unavailable')
    }
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => { this.fail('interrupted') })
    }
    this.timer = setInterval(() => { this.tick() }, this.frameMs)
  }

  /** 停止监听并释放麦克风；未结束的句子直接丢弃。 */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    const recorder = this.recorder
    this.recorder = undefined
    this.startedAt = 0
    this.chunks = []
    if (recorder !== undefined && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* 释放阶段忽略停止异常 */ }
    }
    this.stream?.getTracks().forEach((track) => { track.stop() })
    this.stream = undefined
    this.analyser = undefined
    const context = this.context
    this.context = undefined
    this.vad.reset()
    if (context !== undefined && context.state !== 'closed') {
      try { await context.close() } catch { /* 关闭失败不影响释放麦克风 */ }
    }
  }

  /** 推进一帧音量判定，并在需要时开闭一句话。 */
  private tick(): void {
    const analyser = this.analyser
    if (analyser === undefined || this.stopped) return
    analyser.getFloatTimeDomainData(this.samples)
    let sum = 0
    for (const sample of this.samples) sum += sample * sample
    const level = Math.sqrt(sum / this.samples.length)
    const transition = this.vad.push(level)
    if (transition === 'start') {
      this.handlers.onSpeechChange?.(true)
      this.beginUtterance()
    } else if (transition === 'end') {
      this.handlers.onSpeechChange?.(false)
      void this.endUtterance()
    }
    if (this.recorder !== undefined && Date.now() - this.startedAt >= this.maxUtteranceMs) {
      this.vad.reset()
      this.handlers.onSpeechChange?.(false)
      void this.endUtterance()
    }
  }

  /** 开始录一句话；同一时刻只允许一段。 */
  private beginUtterance(): void {
    if (this.recorder !== undefined || this.finishing || this.stream === undefined) return
    try {
      this.chunks = []
      const recorder = new MediaRecorder(this.stream)
      recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data) }
      recorder.onerror = () => { this.fail('interrupted') }
      recorder.start()
      this.recorder = recorder
      this.startedAt = Date.now()
    } catch {
      this.fail('unavailable')
    }
  }

  /** 结束当前句并解码重采样为 16 kHz WAV；过短或解码失败时静默丢弃。 */
  private async endUtterance(): Promise<void> {
    const recorder = this.recorder
    const context = this.context
    if (recorder === undefined || context === undefined || this.finishing) return
    const duration = Date.now() - this.startedAt
    this.finishing = true
    this.recorder = undefined
    this.startedAt = 0
    try {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => { resolve() }
        recorder.onerror = () => { resolve() }
        recorder.stop()
      })
      if (this.stopped || duration < this.minUtteranceMs) return
      const blob = new Blob(this.chunks, { type: recorder.mimeType })
      this.chunks = []
      if (blob.size === 0) return
      const decoded = await context.decodeAudioData(await blob.arrayBuffer())
      if (this.isStopped()) return
      const frames = Math.max(1, Math.floor(Math.min(decoded.duration, this.maxUtteranceMs / 1000) * 16000))
      const offline = new OfflineAudioContext(1, frames, 16000)
      const source = offline.createBufferSource()
      source.buffer = decoded
      source.connect(offline.destination)
      source.start()
      const resampled = await offline.startRendering()
      if (this.isStopped()) return
      this.handlers.onSegment(encodeWave(resampled.getChannelData(0)))
    } catch {
      // 单句编解码失败不终止整场对话，交给下一句继续。
    } finally {
      this.finishing = false
    }
  }

  /** 读取停止标记；方法调用用于打断 TypeScript 对字段的跨 await 收窄。 */
  private isStopped(): boolean {
    return this.stopped
  }

  /** 报告一次失败并主动释放资源。 */
  private fail(kind: CaptureFailureKind): void {
    if (this.stopped) return
    const failure = new CaptureFailure(kind)
    void this.stop()
    try { this.handlers.onError?.(failure) } catch { /* 回调异常不掩盖原始失败 */ }
  }
}
