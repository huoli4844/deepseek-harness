/** Real HTTP/official SDK probe of the original PostgreSQL execution ledger. */
import assert from 'node:assert/strict'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const resource = process.env.MCP_PROBE_URL
  assert(resource)
  const actors = JSON.parse(process.env.MCP_PROBE_ACTORS ?? '[]') as Array<{ token: string; executionID: string; actor: string; tenant: string }>
  assert.equal(actors.length, 8)
  for (const actor of actors) {
    const grant: YuanShuMcpGrant = { accessToken: actor.token, refreshToken: 'unused', expiresAt: Date.now() + 300_000, issuer: 'http://localhost:18091', resource, clientId: 'dsh' }
    const client: YuanShuMcp = new YuanShuMcp({ resource, issuer: grant.issuer, clientId: 'dsh', redirectUri: 'http://localhost:3000/callback', timeoutMs: 5000, credentials: { read: async () => grant, write: async () => {} } })
    try {
      const tools = await client.tools()
      assert(tools.some(tool => tool.name === 'execution_get'))
      for (const target of actors) {
        const result = await client.call('execution_get', { executionID: target.executionID, user_id: target.actor, tenant_id: target.tenant })
        const body = result.structuredContent as {
          outcome?: string
          data?: { run?: { execution_id: string; actor_id: string; tenant_id: string; status: string } }
        }
        if (actor === target) {
          assert.equal(body.data?.run?.execution_id, actor.executionID)
          assert.equal(body.data?.run?.actor_id, actor.actor)
          assert.equal(body.data?.run?.tenant_id, actor.tenant)
          if (body.data?.run?.status === 'FAILED') { assert.equal(result.isError, true); assert.equal(body.outcome, 'failed') }
        } else {
          assert.equal(result.isError, true)
          assert(!JSON.stringify(body).includes(target.executionID))
          const denied = await client.call('execution_cancel', { executionID: target.executionID, idempotency_key: `cancel-${target.executionID}` })
          assert.equal(denied.isError, true)
        }
      }
      const cancelled = await client.call('execution_cancel', { executionID: actor.executionID, idempotency_key: `cancel-${actor.executionID}` })
      const replayed = await client.call('execution_cancel', { executionID: actor.executionID, idempotency_key: `cancel-${actor.executionID}` })
      const get = (value: unknown): unknown => (value as { data?: { execution?: { status?: string } } })?.data?.execution?.status
      assert.equal(get(cancelled.structuredContent), get(replayed.structuredContent))
      assert(['CANCELLED', 'CANCELED', 'FAILED'].includes(String(get(cancelled.structuredContent))))
    } finally { await client.close() }
  }
  process.stdout.write('DSH_MCP_POSTGRES_PASS actors=8 tenants=2 reads=64 cross_actor_cancel_denials=56 original_run_count=8; seeded-ledger-only\n')
}
void main().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1 })
