/** 技能市场客户端入口：注册主面板与左侧栏图标。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { createElement } from 'react'
import { IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { SkillsMarket } from './SkillsMarket.tsx'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 技能市场面板与侧栏入口文案。 */
    'yuanshu.skills': keyof typeof en
  }
}

/** 只需要槽位、文案与面板选择服务。 */
export const inject = ['slots', 'locale', 'layout']

/** 左侧栏技能市场图标。 */
function SkillsIcon(props: SidebarPanelIconOwnerProps) {
  return createElement(IconLayersOutlineRegular, { size: props.size })
}

/**
 * 挂载技能市场主面板与侧栏入口。
 * @param ctx - 客户端上下文。
 */
export function apply(ctx: Context): void {
  const id = 'yuanshu-skills' as MainPanelId
  ctx.effect(() => ctx.locale.register('yuanshu.skills', { en, zh }), 'yuanshu-skills: locale')
  const t = ctx.locale.bind('yuanshu.skills')
  ctx.effect(function* () {
    yield ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: id,
      locale: 'yuanshu.skills',
    }, SkillsMarket))
    yield ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id,
      order: 17,
      locale: 'yuanshu.skills',
      label: () => t('skills.panel'),
    }, SkillsIcon))
  })
}
