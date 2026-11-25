/** 在原生和嵌入式对话共用的输入区接入日报，不负责会话创建或权限校验。 */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ComposerBlocks } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { BusinessFormsContainer } from './BusinessFormsContainer.tsx'
import { hasEnterpriseLogin } from './source.ts'

/** 仅为已打开的、登录企业账号的主会话启用日报租约与弹窗。 */
export function ConversationBusinessForms({ sessionId, useSession, t, blocks, onNewChat }:
  PropsRuntime<'conversation.input.overlay'> & PropsLocale<'yuanshu.workbench'> & {
    blocks?: ComposerBlocks | undefined
    onNewChat: (signal: AbortSignal) => Promise<void>
  }) {
  const active = useSession(session => session.openState === 'open' && session.subagent === null && !session.removed)
  if (!active || !hasEnterpriseLogin()) return null
  return <BusinessFormsContainer key={sessionId} session={sessionId} active={active} t={t} blocks={blocks} onNewChat={onNewChat} />
}
