/** 插槽注入面：把插件持有的会话控制器交给按钮与状态条。 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { VoiceConversationController } from './orchestrator.ts'

/** 注入到插槽组件的能力面。 */
export interface VoiceConversationInjected {
  /**
   * 取得（必要时创建）该会话的控制器；同一会话始终返回同一实例。
   * @param sessionId - 当前插槽所属会话。
   */
  readonly controllerOf: (sessionId: SessionId) => VoiceConversationController
}
