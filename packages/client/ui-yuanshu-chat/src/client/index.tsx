import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ChatPanel } from './ChatPanel.tsx'
import { NS, en, zh, type YuanShuChatKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'yuanshu-chat': YuanShuChatKey
  }
}

export type { ChatPanelProps } from './ChatPanel.tsx'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  const yuanshuClient = new YuanShuClient({ baseURL: 'http://localhost:8081' })

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yuanshu-chat: dictionaries')

  ctx.slots.register({
    name: 'conversation.view',
    id: 'yuanshu-chat',
    order: 100,
    locale: NS,
  }, props => <ChatPanel {...props} yuanshuClient={yuanshuClient} t={key => key} />)
}
