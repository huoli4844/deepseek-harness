import { apply as applyResources } from '@deepseek-ai/dsh-client-resources/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'

const Empty = () => null

function localeStub(): {
  register: (namespace: string, values: { zh: Record<string, string>; en: Record<string, string> }) => () => void
  bind: (namespace: string) => (key: string) => string
} {
  const dictionaries = new Map<string, Record<string, string>>()
  return {
    register(namespace, values) {
      dictionaries.set(namespace, values.zh)
      return () => { dictionaries.delete(namespace) }
    },
    bind(namespace) {
      return key => dictionaries.get(namespace)?.[key] ?? key
    },
  }
}

describe('yuanshu browser plugin registration', () => {
  it('registers the workbench main view, sidebar entry, and conversation Q&A tab', async () => {
    const ctx = new Context()
    new TestRemote(ctx)
    new SlotRegistry(ctx)
    applyResources(ctx)
    ctx.provide('locale', localeStub() as never)
    const owner = ctx.slots.register({
      name: 'root',
      children: {
        main: { kind: 'keyed', scope: 'root' },
        'sidebar.panellist': { kind: 'list', scope: 'root' },
        'conversation.view': { kind: 'list', scope: 'session' },
      },
    } as never, Empty)

    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    try {
      const main = ctx.slots.entries('main')
      expect(main).toHaveLength(1)
      expect(main[0]!.options.key).toBe('yuanshu')

      const panel = ctx.slots.entries('sidebar.panellist')
      expect(panel).toHaveLength(1)
      expect(panel[0]!.options).toMatchObject({ id: 'yuanshu', order: 30 })
      expect(resolveSlotLabel(panel[0]!.options.label)).toBe('元枢')

      const view = ctx.slots.entries('conversation.view')
      expect(view.map(entry => entry.options.id)).toEqual(['yuanshu-chat'])
      expect(resolveSlotLabel(view[0]!.options.label)).toBe('元枢问答')
    } finally {
      await fiber.dispose()
      owner()
      expect(ctx.slots.entries('main')).toHaveLength(0)
      expect(ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
      await ctx.fiber.dispose()
    }
  })
})
