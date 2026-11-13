/** Cross-repository probe; launched by the Go protocol test with disposable credentials. */
import assert from 'node:assert/strict'
import { isInputRequiredResult } from '@modelcontextprotocol/client'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const resource = process.env.MCP_PROBE_URL
  const token = process.env.MCP_PROBE_TOKEN
  assert(resource && token, 'Go protocol test must provide disposable transport credentials')
  let grant: YuanShuMcpGrant | undefined = { accessToken: token, refreshToken: 'unused', expiresAt: Date.now() + 300_000,
    issuer: 'http://localhost:8081', resource, clientId: 'dsh' }
  const calls: Array<{ id: unknown; method: unknown; meta: unknown; header: string | null }> = []
  const probe = new YuanShuMcp({ resource, issuer: 'http://localhost:8081', clientId: 'dsh', redirectUri: 'http://localhost:3000/callback', timeoutMs: 5000,
    credentials: { read: async () => grant, write: async (value) => { grant = value } },
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as { id?: unknown; method?: unknown; params?: { _meta?: unknown } }
        calls.push({ id: body.id, method: body.method, meta: body.params?._meta, header: new Headers(init.headers).get('Mcp-Method') })
      }
      const response = await fetch(input, init)
      assert.equal(response.headers.get('Mcp-Session-Id'), null)
      return response
    },
  })
  try {
    const tools = await probe.tools()
    assert(tools.some(tool => tool.name === 'protocol_fixture'))
    const result = await probe.call('protocol_fixture', {})
    assert.deepEqual(result.structuredContent, { schema_version: '1', outcome: 'returned', data: { user_id: 1, tenant_id: 1, revision: 0, fixture: 'protocol-only' } })
    const pending = await probe.callWithInput('protocol_input', {})
    assert.equal(pending.resultType, 'input_required')
    if (!isInputRequiredResult(pending)) throw new Error('Expected explicit input request')
    assert(pending.inputRequests?.business_input)
    assert(pending.requestState)
    const continued = await probe.callWithInput('protocol_input', {}, { requestState: pending.requestState, inputResponses: { business_input: { action: 'accept', content: { decision: 'approved' } } } })
    assert.notEqual(continued.resultType, 'input_required')
    if (isInputRequiredResult(continued)) throw new Error('Continuation did not settle')
    assert.deepEqual(continued.structuredContent, { schema_version: '1', outcome: 'returned', data: { user_id: 1, decision: 'approved' } })
    const evidence = await probe.resource('yuanshu://fixture/evidence')
    assert.match(JSON.stringify(evidence), /actor=1 tenant=1/u)
    assert.equal(calls[0]?.method, 'server/discover')
    assert(!calls.some(call => call.method === 'initialize'))
    assert(calls.every(call => call.meta !== undefined && call.header === call.method))
    assert.equal(new Set(calls.map(call => call.id)).size, calls.length)
    process.stdout.write(`DSH_MCP_PROTOCOL_PASS ${JSON.stringify({ methods: calls.map(call => call.method), version: '2026-07-28', evidence: 'protocol-only' })}\n`)
  } finally { await probe.close() }
}

void main().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1 })
