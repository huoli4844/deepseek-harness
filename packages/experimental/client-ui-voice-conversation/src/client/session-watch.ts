/**
 * 会话回合读取：从已保留会话的事件窗口取出最后一条助手文本。
 *
 * 边界：只读事件窗口，不发送消息、不改会话状态；回合是否结束由面板把
 * SessionSnapshot.running 同步给状态机，这里只负责取文本。
 */
import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'

/**
 * 倒序寻找最后一条带文本的助手消息。
 * @param entries - 连续事件窗口。
 * @returns 文本与消息序号；没有助手文本时返回 undefined。
 */
export function lastAssistantMessage(
  entries: readonly SessionEventLikeEntry[],
): { readonly text: string; readonly seq: number } | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]
    if (entry === undefined || entry.type !== 'event') continue
    const event = entry.event
    if (event.type !== 'assistant/message') continue
    let text = ''
    for (const block of event.data.message.content) if (block.type === 'text') text += block.text
    if (text.trim() !== '') return { text, seq: event.seq }
  }
  return undefined
}
