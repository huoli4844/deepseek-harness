/**
 * 纯逻辑的语音活动检测（VAD）。
 *
 * 边界：只消费音量采样值，不接触麦克风、计时器或 DOM；
 * 断句时长由调用方按采样间隔换算成帧数。这样可以在单测里直接驱动。
 */

/** 一帧音量（RMS）的判定参数。 */
export interface VadOptions {
  /** RMS 达到该值视为“有声音”。 */
  readonly threshold: number
  /** 连续多少帧有声音才确认开口，过滤瞬时噪声。 */
  readonly onsetFrames: number
  /** 连续多少帧静音才确认说完，留出自然停顿。 */
  readonly silenceFrames: number
}

/** VAD 的状态变化事件。 */
export type VadTransition = 'start' | 'end'

/** 默认参数：阈值为安静房间与正常说话之间的经验值。 */
export const DEFAULT_VAD: VadOptions = { threshold: 0.02, onsetFrames: 2, silenceFrames: 7 }

/** 一帧有声音、一帧静音的累积状态机。 */
export class VoiceActivityDetector {
  private speaking = false
  private loud = 0
  private quiet = 0

  constructor(private readonly options: VadOptions = DEFAULT_VAD) {}

  /** 当前是否处于“说话中”。 */
  get active(): boolean {
    return this.speaking
  }

  /** 丢弃累积状态；重新开启麦克风时调用。 */
  reset(): void {
    this.speaking = false
    this.loud = 0
    this.quiet = 0
  }

  /**
   * 推进一帧。
   * @param level - 该帧的 RMS 音量。
   * @returns 状态切换事件，未切换时为 undefined。
   */
  push(level: number): VadTransition | undefined {
    if (level >= this.options.threshold) {
      this.quiet = 0
      this.loud += 1
      if (this.speaking) return undefined
      if (this.loud < this.options.onsetFrames) return undefined
      this.speaking = true
      this.loud = 0
      return 'start'
    }
    this.loud = 0
    if (!this.speaking) return undefined
    this.quiet += 1
    if (this.quiet < this.options.silenceFrames) return undefined
    this.speaking = false
    this.quiet = 0
    return 'end'
  }
}
