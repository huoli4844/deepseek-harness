/** Native DSH main-panel and sidebar contribution; no document injection. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { Workbench, WorkbenchIcon } from './Workbench.tsx'
import { createWorkbenchStore } from './model.ts'
import { en, zh } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shaoshi role dashboards and shared demo workspace. */
    'yuanshu.workbench': keyof typeof en
  }
}

/** Services needed to register, localize, and leave the workbench. */
export const inject = ['slots', 'locale', 'layout']

/**
 * Mount the optional browser workspace through the existing DSH slots.
 * @param ctx - Client context with layout, slots, and locale services.
 */
export function apply(ctx: Context): void {
  const id = 'yuanshu-workbench' as MainPanelId
  ctx.effect(() => ctx.locale.register('yuanshu.workbench', { en, zh }), 'yuanshu: locale')
  const t = ctx.locale.bind('yuanshu.workbench')
  const store = createWorkbenchStore()
  ctx.effect(function* () {
    yield ctx.slots.inject('main', () => {
      const dispose = ctx.slots.register(
        {
          name: 'main',
          key: id,
          locale: 'yuanshu.workbench',
          store,
          inject: () => ({
            onReturn: () => {
              ctx.layout.selectPanel(null)
            },
          }),
        },
        Workbench,
      )
      ctx.layout.selectPanel(id)
      return dispose
    })
    yield ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id,
          order: 15,
          locale: 'yuanshu.workbench',
          label: () => t('panel'),
        },
        WorkbenchIcon,
      ),
    )
  })
}
