/** Explicit route rollback against a full disposable platform and normal login. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as pause } from 'node:timers/promises'
import { YuanShuClient } from '../src/index.ts'
import { YuanShuMcp, type YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const base = process.env.MCP_PLATFORM_URL
  const password = process.env.MCP_PLATFORM_PASSWORD
  assert(base && password, 'An explicit disposable platform and synthetic password are required')
  const origin = new URL(base)
  assert(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && !origin.username && !origin.password)
  const response = await fetch(new URL('/api/v1/login', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_code: 'mcp-pg-fixture-0', username: 'mcp-pg-fixture-0', password }),
  })
  assert.equal(response.status, 200)
  const login = await response.json() as { data: { access_token: string } }
  let grant: YuanShuMcpGrant | undefined
  const options = {
    resource: new URL('/api/v1/client/mcp', origin).href, issuer: origin.origin, clientId: 'dsh-yuanshu',
    redirectUri: 'http://localhost:3065/yuanshu-mcp/callback', timeoutMs: 30_000,
    credentials: { read: async () => grant, write: async (value: YuanShuMcpGrant | undefined) => { grant = value } },
  }
  const mcp = new YuanShuMcp(options)
  const config = { baseURL: origin.origin, token: login.data.access_token, tenantId: '910001' }
  const selectedMCP = new YuanShuClient({ ...config, enterprise: mcp })
  const selectedHTTP = new YuanShuClient(config)
  const id = (value: { readonly execution: unknown }): string => {
    const execution = value.execution as { execution_id: string }
    assert.equal(typeof execution.execution_id, 'string')
    return execution.execution_id
  }
  const original = async (executionID: string): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      const result = await mcp.call('execution_get', { executionID })
      assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent))
      const run = (result.structuredContent as { data: { run: Record<string, unknown> } }).data.run
      if (run.status === 'SUCCEEDED') return run
      assert(!['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(String(run.status)), JSON.stringify(run))
      await pause(100)
    }
    assert.fail('Original execution did not finish within the frozen acceptance budget')
  }
  const onlyRun = async (key: string): Promise<string> => {
    const result = await mcp.call('executions_list', { asset_id: 991001, idempotency_key: key })
    assert.notEqual(result.isError, true)
    const rows = (result.structuredContent as { data: { list: Array<{ execution_id: string }> } }).data.list
    assert.equal(rows.length, 1, 'Cross-route retries created duplicate platform executions')
    return rows[0]!.execution_id
  }
  try {
    await mcp.authorize(login.data.access_token, '910001', 'enterprise:read enterprise:execute')
    const key = 'migration-mcp-' + randomUUID()
    const input = { inputData: { values: [7, 8], delay: 2 }, idempotencyKey: key }
    const first = id(await selectedMCP.submitClientExecution('algorithms', 991001, input))
    const completed = await original(first)
    assert.equal(id(await selectedHTTP.submitClientExecution('algorithms', 991001, input)), first)
    assert.equal(await onlyRun(key), first)
    assert.deepEqual((await original(first)).output_snapshot, completed.output_snapshot)

    const reverseKey = 'migration-http-' + randomUUID()
    const reverse = { inputData: { values: [9, 10], delay: 2 }, idempotencyKey: reverseKey }
    const legacyFirst = id(await selectedHTTP.submitClientExecution('algorithms', 991001, reverse))
    assert.equal(id(await selectedMCP.submitClientExecution('algorithms', 991001, reverse)), legacyFirst)
    await original(legacyFirst)
    assert.equal(await onlyRun(reverseKey), legacyFirst)

    let writes = 0
    let automaticHTTP = 0
    const dropping: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers)
      const result = await fetch(input, init)
      if (headers.get('Mcp-Name') === 'algorithm_991001_execute') {
        writes++
        await result.arrayBuffer()
        throw new TypeError('Acceptance: response lost after durable admission')
      }
      return result
    }
    const droppingMCP = new YuanShuMcp({ ...options, fetch: dropping })
    try {
      const noFallback = new YuanShuClient({
        ...config, enterprise: droppingMCP,
        fetch: async (input, init) => { automaticHTTP++; return fetch(input, init) },
      })
      const lostKey = 'migration-lost-' + randomUUID()
      const lost = { inputData: { values: [11, 12], delay: 2 }, idempotencyKey: lostKey }
      await assert.rejects(noFallback.submitClientExecution('algorithms', 991001, lost))
      assert.equal(writes, 1)
      assert.equal(automaticHTTP, 0, 'An uncertain MCP result automatically fell back to HTTP')
      const persisted = await onlyRun(lostKey)
      assert.equal(id(await selectedHTTP.submitClientExecution('algorithms', 991001, lost)), persisted)
      await original(persisted)
      assert.equal(await onlyRun(lostKey), persisted)
    } finally { await droppingMCP.close() }
    process.stdout.write('DSH_MCP_MIGRATION_LIVE_PASS normal_login=true real_routes=true mcp_to_http=true http_to_mcp=true lost_response_writes=1 automatic_http=0 duplicate_runs=0 terminal_verified=true\n')
  } finally { await mcp.revoke(); await mcp.close() }
}

void main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n')
  process.exitCode = 1
})
