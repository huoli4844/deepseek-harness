/** 把文件直接加入当前对话输入框：构造一次合成 drop，复用附件接收与上传链路。 */

/** 对话输入框卡片的稳定标记；由 ui-conversation 的 InputBar 输出。 */
export const COMPOSER_CARD_SELECTOR = '[data-composer-card]'

/** 添加结果：成功、当前没有打开的对话，或运行环境不支持合成拖拽。 */
export type AttachOutcome = 'attached' | 'no-conversation' | 'unsupported'

/**
 * 把文件作为附件放进当前对话输入框。
 * 附件接收方（ui-attachment）监听文档级 drop 并按 `data-composer-card` 定位输入框，
 * 这里用真实 File 构造 DataTransfer 触发同一入口，避免复制上传与附件草稿逻辑。
 * @param files - 要添加的文件；空列表视为失败。
 * @returns 添加结果，供调用方给出提示。
 */
export function attachFilesToConversation(files: readonly File[]): AttachOutcome {
  if (files.length === 0) return 'unsupported'
  if (typeof DataTransfer === 'undefined' || typeof DragEvent === 'undefined') return 'unsupported'
  // 页面可能同时挂载多个输入框，优先选当前可见的那个。
  const cards = Array.from(document.querySelectorAll<HTMLElement>(COMPOSER_CARD_SELECTOR))
  const card = cards.find(element => element.getClientRects().length > 0) ?? cards[0] ?? null
  if (card === null) return 'no-conversation'
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    card.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }))
  }
  return 'attached'
}
