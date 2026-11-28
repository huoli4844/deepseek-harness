/** Plugin activation owns its entry, launch selection, and teardown. */
import { Context, type Fiber } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'

// 资料库的构建产物依赖浏览器模块加载器，注册测试用轻量替身隔离它。
vi.mock('@deepseek-ai/dsh-yuanshu-doclib/client', () => ({
  DoclibWorkbench: () => null,
  en: {},
  zh: {},
}))
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'

const owners = new Set<Fiber>()

function FixtureFrame({ renderSlot }: PropsRenderSlots<'main' | 'sidebar.panellist'>) {
  return [
    renderSlot('main', {}, { entryKey: 'conversation' }),
    renderSlot('sidebar.panellist', { size: 16, active: false }),
  ]
}
afterEach(async () => {
  for (const owner of owners) await owner.dispose()
  owners.clear()
})

it('opens the registered workbench on load and removes only its entries on unload', async () => {
  const root = new Context()
  let context: Context | undefined
  const owner = root.plugin((ctx: Context) => {
    context = ctx
  })
  owners.add(owner)
  await owner.await()
  if (context === undefined) throw new Error('the plugin fixture did not activate')
  const ctx = context
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  slots.register(
    {
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
      },
    },
    FixtureFrame,
  )
  slots.register({
    name: 'main', key: 'conversation',
    children: {
      'conversation.input.overlay': { kind: 'list', scope: 'session' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
    },
  } as never, (() => null) as never)
  const selectPanel = vi.fn((id: MainPanelId | null) => {
    if (id !== null) expect(slots.entries('main').some(entry => entry.options.key === id)).toBe(true)
  })
  ctx.provide('layout', { selectPanel } as never)
  ctx.provide('uiWorkspace', {} as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('workspaces', {} as never)
  ctx.provide('remote', {} as never)
  ctx.provide('remote.pluginManager', {} as never)
  ctx.provide('remote.agentPresets', {} as never)
  ctx.provide('remote.skills', {} as never)
  ctx.provide('remote.workspaceFiles', {} as never)
  ctx.provide('remote.session', {} as never)
  ctx.provide('remote.workspace', {} as never)
  const plugin = ctx.plugin({ inject, apply })
  await plugin.await()
  expect(selectPanel).toHaveBeenCalledExactlyOnceWith('yuanshu-workbench')
  expect(slots.entries('main')).toHaveLength(2)
  expect(slots.entries('sidebar.panellist')).toHaveLength(1)
  expect(slots.entries('conversation.input.overlay').map(entry => entry.options.id)).toContain('yuanshu-daily-report')
  expect(slots.entries('conversation.input.dock').map(entry => entry.options.id)).toContain('yuanshu-assistant-workspace')
  const label = slots.entries('sidebar.panellist')[0]?.options.label
  locale.setLocale('zh')
  expect(resolveSlotLabel(label)).toBe('元枢工作台')
  locale.setLocale('en')
  expect(resolveSlotLabel(label)).toBe('YuanShu workbench')
  await plugin.dispose()
  expect(slots.entries('main').map(entry => entry.options.key)).toEqual(['conversation'])
  expect(slots.entries('sidebar.panellist')).toHaveLength(0)
  expect(slots.entries('conversation.input.overlay')).toHaveLength(0)
  expect(slots.entries('conversation.input.dock')).toHaveLength(0)
})
