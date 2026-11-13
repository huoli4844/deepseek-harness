/** Disposable PostgreSQL/Docker acceptance: publication, lost response and load. */
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'
import type { CallToolResult, Tool } from '@modelcontextprotocol/client'

const pause = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
function data(result: CallToolResult): Record<string, unknown> {
  const value = result.structuredContent as { data: Record<string, unknown> }
  assert(value?.data, JSON.stringify(result))
  return value.data
}
function revision(tool: Tool | undefined): number {
  const property = tool?.inputSchema.properties?.revision_id
  assert(property !== null && typeof property === 'object' && 'const' in property && typeof property.const === 'number')
  return property.const
}
async function main(): Promise<void> {
  const resource = process.env.MCP_PROBE_URL
  assert(resource)
  const actors = JSON.parse(process.env.MCP_PROBE_ACTORS ?? '[]') as Array<{ token: string; executionID: string }>
  assert.equal(actors.length, 8)
  const open = (index: number, fetcher?: typeof globalThis.fetch): YuanShuMcp => {
    const grant: YuanShuMcpGrant = { accessToken: actors[index]!.token, refreshToken: 'unused', expiresAt: Date.now() + 300_000, issuer: 'http://localhost:18091', resource, clientId: 'dsh' }
    return new YuanShuMcp({ resource, issuer: grant.issuer, clientId: 'dsh', redirectUri: 'http://localhost:3000/callback', timeoutMs: 15_000, credentials: { read: async () => grant, write: async () => {} }, ...fetcher === undefined ? {} : { fetch: fetcher } })
  }
  const control = async (operation: string): Promise<unknown> => {
    const response = await fetch(`${resource}/_fixture/${operation}`, { method: 'POST', headers: { Authorization: `Bearer ${actors[0]!.token}` } })
    if (!response.ok) assert.fail(await response.text())
    return response.json()
  }
  const clients = actors.map((_, i) => open(i))
  const owner = clients[0]!
  const name = 'algorithm_991001_execute'
  const getRun = async (id: string): Promise<Record<string, unknown>> => data(await owner.call('execution_get', { executionID: id })).run as Record<string, unknown>
  const waitRun = async (id: string, terminal = true): Promise<Record<string, unknown>> => {
    for (let i = 0; i < 450; i++) {
      const run = await getRun(id)
      const finished = ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(String(run.status))
      if (terminal ? finished : run.status === 'QUEUED' || run.status === 'RUNNING' || finished) return run
      await pause(100)
    }
    assert.fail(`Run ${id} did not reach requested state`)
  }
  try {
    await Promise.all(clients.map(client => client.tools()))
    assert((await owner.tools()).length > 2, 'server page size is 2; official client must consume all pages')
    const oldRevision = revision((await owner.tools()).find(tool => tool.name === name))
    const before = data(await owner.call(name, { input_data: { values: [1, 2, 3], delay: 10 }, revision_id: oldRevision, idempotency_key: 'mcp-publish-inflight' })).execution as { execution_id: string }
    assert(['QUEUED', 'RUNNING'].includes(String((await waitRun(before.execution_id, false)).status)), 'publication must race an active platform Run')
    let changed = false
    const unsubscribe = owner.onCatalogChanged((error) => { if (error === null) changed = true })
    await control('publish')
    for (let i = 0; i < 100 && !changed; i++) await pause(50)
    unsubscribe()
    assert(changed, 'live publication did not invalidate the DSH catalog')
    const newRevision = revision((await owner.tools()).find(tool => tool.name === name))
    assert.notEqual(newRevision, oldRevision)
    const pinned = await waitRun(before.execution_id)
    assert.equal(pinned.status, 'SUCCEEDED')
    assert.equal(pinned.asset_revision_id, oldRevision)
    assert.deepEqual(pinned.output_snapshot, { count: 3, sum: 6 })
    const args = { input_data: { values: [1, 2, 3], delay: 0.1 }, revision_id: newRevision, idempotency_key: 'mcp-response-lost' }
    let writes = 0
    const dropping: typeof globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      const response = await fetch(input, init)
      if (headers.get('Mcp-Name') === name) {
        writes++
        await response.arrayBuffer()
        throw new TypeError('acceptance fault: response lost after durable admission')
      }
      return response
    }
    const lossy = open(0, dropping)
    try { await assert.rejects(lossy.call(name, args)) } finally { await lossy.close() }
    assert.equal(writes, 1, 'unknown write was retried')
    const recovered = data(await owner.call('executions_list', { asset_id: 991001, idempotency_key: args.idempotency_key }))
    assert(Array.isArray(recovered.list), JSON.stringify(recovered))
    assert.equal(recovered.list.length, 1)
    const recoveredRow: unknown = recovered.list[0]
    assert(recoveredRow !== null && typeof recoveredRow === 'object' && 'execution_id' in recoveredRow)
    const recoveredID = String(recoveredRow.execution_id)
    const completed = await waitRun(recoveredID)
    assert.equal(completed.status, 'SUCCEEDED')
    assert.deepEqual(completed.output_snapshot, { count: 3, sum: 106 })
    for (const other of clients.slice(1)) {
      const hidden = data(await other.call('executions_list', { asset_id: 991001, idempotency_key: args.idempotency_key }))
      assert.deepEqual(hidden.list, [])
    }
    const legacyKey = 'mcp-legacy-same-ledger'
    const legacyResponse = await fetch(`${resource}/_fixture/legacy`, { method: 'POST', headers: { Authorization: `Bearer ${actors[0]!.token}`, 'Idempotency-Key': legacyKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ input_data: { values: [4, 5], delay: 0 }, revision_id: newRevision, idempotency_key: legacyKey }) })
    const legacyBody = await legacyResponse.text()
    assert(legacyResponse.ok, legacyBody)
    const legacyEnvelope = JSON.parse(legacyBody) as { data?: { execution?: { execution_id?: string } } }
    const legacyID = legacyEnvelope.data?.execution?.execution_id
    assert(legacyID)
    const mcpSameKey = data(await owner.call(name, {
      input_data: { values: [4, 5], delay: 0 }, revision_id: newRevision, idempotency_key: legacyKey,
    })).execution as { execution_id: string }
    assert.equal(mcpSameKey.execution_id, legacyID)
    const crossTransport = data(await owner.call('executions_list', { asset_id: 991001, idempotency_key: legacyKey }))
    assert(Array.isArray(crossTransport.list) && crossTransport.list.length === 1)
    const cancelled = data(await owner.call(name, { input_data: { values: [1], delay: 10 }, revision_id: newRevision, idempotency_key: 'mcp-real-cancel' })).execution as { execution_id: string }
    assert(['QUEUED', 'RUNNING'].includes(String((await waitRun(cancelled.execution_id, false)).status)), 'cancellation must target active business execution')
    await owner.call('execution_cancel', { executionID: cancelled.execution_id, idempotency_key: 'mcp-real-cancel-command' })
    assert.equal((await waitRun(cancelled.execution_id)).status, 'CANCELLED')
    const timings: number[] = []
    for (let batch = 0; batch < 5; batch++) {
      await Promise.all(clients.flatMap((client, index) => Array.from({ length: 4 }, async () => {
        const started = performance.now()
        await client.call('execution_get', { executionID: actors[index]!.executionID })
        timings.push(performance.now() - started)
      })))
    }
    timings.sort((a, b) => a - b)
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!
    assert(p95 < 2000, `read p95=${p95}`)
    // A real PostgreSQL table lock holds 32 original business reads in flight.
    await control('lock')
    let pending: Promise<CallToolResult>[] = []
    try {
      pending = clients.flatMap((client, index) => Array.from({ length: 4 }, () => client.call('execution_get', { executionID: actors[index]!.executionID })))
      await pause(300)
      const overflow = await fetch(resource, { method: 'POST', headers: { Authorization: `Bearer ${actors[0]!.token}`, 'Mcp-Method': 'server/discover', 'Content-Type': 'application/json' }, body: '{}' })
      await overflow.body?.cancel()
      assert.equal(overflow.status, 429)
      assert.equal(overflow.headers.get('Retry-After'), '1')
    } finally { await control('unlock') }
    const recoveryStarted = performance.now()
    await Promise.all(pending)
    const recoveredMs = performance.now() - recoveryStarted
    assert(recoveredMs < 10_000)
    // Abort a blocked read and verify it releases admission; accepted work stays.
    await control('lock')
    const abort = new AbortController()
    const request = owner.call('execution_get', { executionID: recoveredID }, abort.signal)
    const rejected = assert.rejects(request)
    await pause(100)
    abort.abort()
    await rejected
    await control('unlock')
    assert.equal((await getRun(recoveredID)).status, 'SUCCEEDED')
    const counts = await control('count') as Array<{ idempotency_key: string; count: number }>
    // Separate DAG runs each execute their own algorithm node without a submission key.
    const keyed = counts.filter(row => row.idempotency_key !== '')
    assert(keyed.length > 0 && keyed.every(row => row.count === 1), JSON.stringify(counts))
    process.stdout.write(`DSH_MCP_FAULT_PASS ${JSON.stringify({ users: 8, inflightPerUser: 4, readSamples: timings.length, readP95Ms: Number(p95.toFixed(2)), recoveryMs: Number(recoveredMs.toFixed(2)), overflow: 429, duplicateRuns: 0, lostResponseWrites: writes, requestAbort: true, businessCancel: 'CANCELLED', crossTransportIdempotency: legacyID, livePublication: true, oldRevision, newRevision, pinnedResult: pinned.output_snapshot })}\n`)
  } finally { await control('unlock'); await Promise.all(clients.map(client => client.close())) }
}
void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
