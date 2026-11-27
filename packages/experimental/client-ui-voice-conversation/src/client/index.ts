/** 浏览器侧入口：安装连续语音对话的插槽贡献。 */
import type { Context } from '@deepseek-ai/cordis'
import { mountVoiceConversation } from './mount.ts'

export { inject } from './mount.ts'

/**
 * 激活连续语音对话。
 * @param ctx - 客户端运行时。
 * @returns 挂载完成后完成。
 */
export async function apply(ctx: Context): Promise<void> {
  await mountVoiceConversation(ctx)
}
