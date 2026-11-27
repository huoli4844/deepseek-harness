/** 连续对话状态机：识别 → 发送 → 朗读 → 打断的完整闭环。 */
import { describe, expect, it } from 'vitest'
import {
  VoiceConversationController,
  type VoiceCaptureHandlers,
  type VoiceConversationDeps,
} from '../src/client/orchestrator.ts'

/** 让已排队的微任务与 Promise 完成。 */
async function flush(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

interface Harness {
  readonly controller: VoiceConversationController
  readonly handlers: VoiceCaptureHandlers
  readonly sent: string[]
  readonly spoken: string[]
  readonly cancelled: () => number
  readonly capture: { started: number; stopped: number }
}

interface HarnessOptions {
  locked?: boolean
  transcript?: string
  assistantText?: string
  failTranscribe?: boolean
  holdSpeech?: boolean
  failPrepare?: boolean
}

/** 构造带假采集、假识别、假朗读与可控回合信号的控制器。 */
function createHarness(options: HarnessOptions = {}): Harness {
  const sent: string[] = []
  const spoken: string[] = []
  const capture = { started: 0, stopped: 0 }
  let cancelled = 0
  let releaseSpeak: (() => void) | undefined
  let handlers: VoiceCaptureHandlers | undefined
  const deps: VoiceConversationDeps = {
    async prepare() {
      if (options.failPrepare === true) throw new Error('prepare failed')
    },
    createCapture(next) {
      handlers = next
      return {
        async start() { capture.started += 1 },
        async stop() { capture.stopped += 1 },
      }
    },
    async transcribe() {
      if (options.failTranscribe === true) throw new Error('transcribe failed')
      return options.transcript ?? '你好'
    },
    createSpeaker: () => ({
      available: true,
      async speak(text) {
        spoken.push(text)
        if (options.holdSpeech === true) await new Promise<void>((resolve) => { releaseSpeak = resolve })
      },
      cancel() {
        cancelled += 1
        const release = releaseSpeak
        releaseSpeak = undefined
        release?.()
      },
    }),
    readAssistantText: () => options.assistantText ?? '这是回答',
  }
  const controller = new VoiceConversationController(deps)
  controller.setComposer({
    locked: options.locked ?? false,
    send(text) { sent.push(text); return true },
  })
  return {
    controller,
    get handlers() { return handlers as VoiceCaptureHandlers },
    sent,
    spoken,
    cancelled: () => cancelled,
    capture,
  }
}

describe('VoiceConversationController', () => {
  it('开启后进入监听，并在断句后自动发送', async () => {
    const harness = createHarness()
    await harness.controller.start()
    expect(harness.controller.getSnapshot().phase).toBe('listening')
    harness.handlers.onSegment(new Uint8Array([1, 2]))
    await flush()
    expect(harness.sent).toEqual(['你好'])
    expect(harness.controller.getSnapshot().phase).toBe('thinking')
    await harness.controller.stop()
  })

  it('回合结束后朗读回答并回到监听', async () => {
    const harness = createHarness()
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    harness.controller.setSessionRunning(true)
    harness.controller.setSessionRunning(false)
    await flush()
    expect(harness.spoken).toEqual(['这是回答'])
    expect(harness.controller.getSnapshot().phase).toBe('listening')
    await harness.controller.stop()
  })

  it('没有观察到运行中时，空闲信号不会触发朗读', async () => {
    const harness = createHarness()
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    harness.controller.setSessionRunning(false)
    await flush()
    expect(harness.spoken).toEqual([])
    expect(harness.controller.getSnapshot().phase).toBe('thinking')
    await harness.controller.stop()
  })

  it('朗读中用户开口会打断朗读', async () => {
    const harness = createHarness({ holdSpeech: true })
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    harness.controller.setSessionRunning(true)
    harness.controller.setSessionRunning(false)
    await flush()
    expect(harness.controller.getSnapshot().phase).toBe('speaking')
    harness.handlers.onSpeechChange(true)
    expect(harness.controller.getSnapshot().phase).toBe('listening')
    expect(harness.cancelled()).toBeGreaterThan(0)
    await harness.controller.stop()
  })

  it('输入框被占用时不发送，只保留识别文本', async () => {
    const harness = createHarness({ locked: true })
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    expect(harness.sent).toEqual([])
    expect(harness.controller.getSnapshot()).toMatchObject({ phase: 'listening', transcript: '你好' })
    await harness.controller.stop()
  })

  it('空识别结果回到监听且不发送', async () => {
    const harness = createHarness({ transcript: '   ' })
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    expect(harness.sent).toEqual([])
    expect(harness.controller.getSnapshot()).toMatchObject({ phase: 'listening', transcript: '' })
    await harness.controller.stop()
  })

  it('识别失败进入错误态', async () => {
    const harness = createHarness({ failTranscribe: true })
    await harness.controller.start()
    harness.handlers.onSegment(new Uint8Array([1]))
    await flush()
    expect(harness.controller.getSnapshot()).toMatchObject({ phase: 'error', failure: 'transcribe' })
    await harness.controller.stop()
  })

  it('停止后释放采集并回到空闲', async () => {
    const harness = createHarness()
    await harness.controller.start()
    await harness.controller.stop()
    expect(harness.controller.getSnapshot().phase).toBe('idle')
    expect(harness.capture.stopped).toBeGreaterThan(0)
  })

  it('麦克风权限失败进入错误态', async () => {
    const harness = createHarness()
    await harness.controller.start()
    harness.handlers.onError('permission')
    expect(harness.controller.getSnapshot()).toMatchObject({ phase: 'error', failure: 'permission' })
    await harness.controller.stop()
  })

  it('模型准备失败时进入错误态且不占用麦克风', async () => {
    const harness = createHarness({ failPrepare: true })
    await harness.controller.start()
    expect(harness.controller.getSnapshot()).toMatchObject({ phase: 'error', failure: 'prepare' })
    expect(harness.capture.started).toBe(0)
    await harness.controller.stop()
  })
})
