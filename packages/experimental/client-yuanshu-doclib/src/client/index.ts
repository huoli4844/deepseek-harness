/** 资料库客户端入口：注册主面板与左侧栏入口，不注入会话或文档。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createElement } from 'react'
import { IconFolderOpenRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { DoclibWorkbench } from './DoclibWorkbench.tsx'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 资料库主面板与左侧栏入口文案。 */
    'yuanshu.doclib': keyof typeof en
  }
}

/** 宿主会话服务与 workspaceFiles Remote 支撑个人资料页签，其余服务支撑面板注册。 */
export const inject = ['slots', 'locale', 'layout', 'sessions', 'remote', 'remote.workspaceFiles']

/** 左侧栏资料库图标。 */
function DoclibIcon(props: SidebarPanelIconOwnerProps) {
  return createElement(IconFolderOpenRegular, { size: props.size })
}

/**
 * 挂载资料库主面板与左侧栏入口。
 * @param ctx - 客户端上下文，携带 slots、locale、layout、sessions 与 remote。
 */
export function apply(ctx: Context): void {
  const id = 'yuanshu-doclib' as MainPanelId
  ctx.effect(() => ctx.locale.register('yuanshu.doclib', { en, zh }), 'doclib: locale')
  const t = ctx.locale.bind('yuanshu.doclib')
  ctx.effect(function* () {
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: id,
      locale: 'yuanshu.doclib',
      inject: () => ({
        t,
        sessions: ctx.sessions,
        remote: ctx.remote,
      }),
    }, DoclibWorkbench))
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id,
      order: 16,
      locale: 'yuanshu.doclib',
      label: () => t('doclib.panel'),
    }, DoclibIcon))
  })
}
