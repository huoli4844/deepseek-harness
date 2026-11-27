/** 连续语音对话的领域模型：阶段、失败原因与共享快照。 */

/** 连续对话的运行时阶段；面板与按钮只读取该枚举。 */
export type VoiceConversationPhase =
  /** 未开启，麦克风未占用。 */
  | 'idle'
  /** 正在准备本地语音识别模型，尚未占用麦克风。 */
  | 'preparing'
  /** 常开麦克风，等待用户开口。 */
  | 'listening'
  /** 已断句，正在调用识别服务。 */
  | 'transcribing'
  /** 识别文本已写入输入框并提交。 */
  | 'sending'
  /** 等待本回合回答结束。 */
  | 'thinking'
  /** 正在朗读回答，用户开口可打断。 */
  | 'speaking'
  /** 发生可恢复失败，等待用户停止或重启。 */
  | 'error'

/** 需要本地化的失败原因；展示文案由 locales 持有。 */
export type VoiceConversationFailure =
  | 'permission'
  | 'unavailable'
  | 'prepare'
  | 'transcribe'
  | 'send'
  | 'interrupted'

/** 面板与按钮共享的只读快照。 */
export interface VoiceConversationView {
  readonly phase: VoiceConversationPhase
  /** 最近一次识别文本，用于面板回显；空串表示还没有识别结果。 */
  readonly transcript: string
  /** 失败原因，仅 `phase === 'error'` 时存在。 */
  readonly failure?: VoiceConversationFailure
}

/** 初始快照常量；避免每次创建控制器时重新构造。 */
export const IDLE_VIEW: VoiceConversationView = { phase: 'idle', transcript: '' }
