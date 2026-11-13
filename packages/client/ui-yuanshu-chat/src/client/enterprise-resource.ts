/** Platform-described enterprise pages and reads through the standard resource owner. */
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

/** A discovered tool descriptor; schemas are supplied by the authenticated platform. */
export interface EnterpriseTool {
  readonly name: string
  readonly description?: string
  readonly inputSchema: Readonly<Record<string, unknown>>
}
/** One declared section, with a server-owned tool reference. */
export interface EnterpriseSection { readonly id: string; readonly title: string; readonly tool: string }
/** Workbench content owned by the active tenant application. */
export interface EnterprisePage {
  readonly application: { readonly code: string; readonly name: string }
  readonly sections: readonly EnterpriseSection[]
}
/** Values available through the enterprise resource protocol. */
export type EnterpriseResourceValue =
  | { readonly kind: 'catalog'; readonly page: EnterprisePage; readonly tools: readonly EnterpriseTool[] }
  | { readonly kind: 'identity'; readonly tenants: readonly { readonly code: string; readonly name?: string; readonly id?: number }[] }
  | { readonly kind: 'result'; readonly result: unknown }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    /** Authenticated platform content and original Run reads. */
    'yuanshu-enterprise': EnterpriseResourceValue
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Enterprise read failed; the user may authorize or refresh explicitly. */
    'yuanshu/read-failed': Record<string, never>
  }
}

/**
 * Register explicit gateway reads in the framework resource lifecycle.
 * @param read - Authenticated, cancellable gateway reader.
 * @returns Resource provider; abort ends reads and emits no later frame.
 */
export function enterpriseResourceProvider(read: (path: string, signal: AbortSignal) => Promise<unknown>): ResourceProvider<'yuanshu-enterprise'> {
  return { protocol: 'yuanshu-enterprise', async *open(address, { signal }) {
    try {
      const url = new URL(address)
      if (signal.aborted) return
      let value: EnterpriseResourceValue
      if (url.pathname === '/identity') {
        const tenants = await read('/tenants', signal)
        // YuanShu returns the current tenant together with the visible tenant
        // list. Keep accepting the old bare-array shape for older gateways.
        const tenantList: readonly unknown[] | undefined = Array.isArray(tenants)
          ? tenants
          : tenants !== null && typeof tenants === 'object' && 'list' in tenants && Array.isArray(tenants.list)
            ? tenants.list
            : undefined
        if (tenantList === undefined) throw new Error('Invalid tenant catalog')
        value = { kind: 'identity', tenants: tenantList.flatMap((raw): { code: string; name?: string; id?: number }[] => {
          if (raw === null || typeof raw !== 'object' || !('code' in raw) || typeof raw.code !== 'string') return []
          return [{ code: raw.code, ...'name' in raw && typeof raw.name === 'string' ? { name: raw.name } : {}, ...'id' in raw && typeof raw.id === 'number' ? { id: raw.id } : {} }]
        }) }
      } else if (url.pathname === '/catalog') {
        const [page, tools] = await Promise.all([read('/mcp/workbench', signal), read('/mcp/tools', signal)])
        if (page === null || typeof page !== 'object' || !('application' in page) || page.application === null || typeof page.application !== 'object' || !('code' in page.application) || typeof page.application.code !== 'string' || !('name' in page.application) || typeof page.application.name !== 'string' || !('sections' in page) || !Array.isArray(page.sections) || !Array.isArray(tools)) throw new Error('Invalid platform workbench descriptor')
        const sections = page.sections.flatMap((raw: unknown): EnterpriseSection[] => raw !== null && typeof raw === 'object' && 'id' in raw && typeof raw.id === 'string' && 'title' in raw && typeof raw.title === 'string' && 'tool' in raw && typeof raw.tool === 'string' ? [{ id: raw.id, title: raw.title, tool: raw.tool }] : [])
        value = { kind: 'catalog', page: { application: { code: page.application.code, name: page.application.name }, sections }, tools: tools.flatMap((raw: unknown): EnterpriseTool[] => raw !== null && typeof raw === 'object' && 'name' in raw && typeof raw.name === 'string' && 'inputSchema' in raw && raw.inputSchema !== null && typeof raw.inputSchema === 'object' && !Array.isArray(raw.inputSchema) ? [{ name: raw.name, inputSchema: raw.inputSchema as Record<string, unknown>, ...'description' in raw && typeof raw.description === 'string' ? { description: raw.description } : {} }] : []) }
      } else {
        const tool = url.searchParams.get('tool'), args = url.searchParams.get('args')
        if (tool === null || args === null) throw new Error('Invalid original Run resource')
        value = { kind: 'result', result: await read(`/mcp/read?name=${encodeURIComponent(tool)}&arguments=${encodeURIComponent(args)}`, signal) }
      }
      signal.throwIfAborted()
      yield { ok: true, value }
    } catch {
      if (!signal.aborted) yield { ok: false, error: new RemoteError('yuanshu/read-failed', 'Enterprise content unavailable; check login, tenant and delegated authorization.', {}) }
    }
  } }
}
