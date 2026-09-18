/** `yuanshu-chat` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'yuanshu-chat'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  /** Tab label shown in the conversation header */
  'viewTab': '元枢问答',
  /** Placeholder text in the input field */
  'inputPlaceholder': '输入你的问题...',
  /** Send button label */
  'send': '发送',
  /** Thinking indicator */
  'thinking': '正在思考...',
  /** Error message when API call fails */
  'requestFailed': '问答失败，请稍后重试',
  /** Empty state message */
  'emptyState': '开始一段新的对话吧',
  /** Citation label */
  'citations': '参考资料',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<YuanShuChatKey, string> = {
  'viewTab': 'YuanShu QA',
  'inputPlaceholder': 'Type your question...',
  'send': 'Send',
  'thinking': 'Thinking...',
  'requestFailed': 'Q&A failed, please try again later',
  'emptyState': 'Start a new conversation',
  'citations': 'References',
}

/** Key domain of the `yuanshu-chat` namespace (zh is the source of truth). */
export type YuanShuChatKey = keyof typeof zh
