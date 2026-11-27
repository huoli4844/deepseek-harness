/** 纯逻辑 VAD 的断句行为。 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_VAD, VoiceActivityDetector } from '../src/client/vad.ts'

/** 依次喂入同一音量若干帧，返回出现的事件序列。 */
function feed(detector: VoiceActivityDetector, level: number, frames: number): (string | undefined)[] {
  return Array.from({ length: frames }, () => detector.push(level))
}

describe('VoiceActivityDetector', () => {
  it('连续高能量达到开口帧数后只报告一次开口', () => {
    const detector = new VoiceActivityDetector(DEFAULT_VAD)
    const events = feed(detector, 0.2, DEFAULT_VAD.onsetFrames + 3)
    expect(events.filter(event => event === 'start')).toHaveLength(1)
    expect(detector.active).toBe(true)
  })

  it('瞬时噪声不会触发开口', () => {
    const detector = new VoiceActivityDetector(DEFAULT_VAD)
    expect(detector.push(0.2)).toBeUndefined()
    expect(detector.push(0)).toBeUndefined()
    expect(detector.active).toBe(false)
  })

  it('持续静音达到静音帧数后报告结束', () => {
    const detector = new VoiceActivityDetector(DEFAULT_VAD)
    feed(detector, 0.2, DEFAULT_VAD.onsetFrames)
    const events = feed(detector, 0, DEFAULT_VAD.silenceFrames)
    expect(events.filter(event => event === 'end')).toHaveLength(1)
    expect(detector.active).toBe(false)
  })

  it('说话中的短暂停顿不结束这句话', () => {
    const detector = new VoiceActivityDetector(DEFAULT_VAD)
    feed(detector, 0.2, DEFAULT_VAD.onsetFrames)
    const events = feed(detector, 0, DEFAULT_VAD.silenceFrames - 1)
    expect(events).not.toContain('end')
    expect(detector.active).toBe(true)
    feed(detector, 0.2, 1)
    expect(detector.active).toBe(true)
  })

  it('reset 清除累积状态', () => {
    const detector = new VoiceActivityDetector(DEFAULT_VAD)
    feed(detector, 0.2, DEFAULT_VAD.onsetFrames)
    detector.reset()
    expect(detector.active).toBe(false)
  })
})
