/** Real platform knowledge synthesis; credentials come only from the environment. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const base = process.env.MCP_PLATFORM_URL
  const password = process.env.MCP_PLATFORM_PASSWORD
  assert(base && password, 'Explicit loopback platform and synthetic password required')
  const origin = new URL(base)
  assert(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname) && !origin.username && !origin.password)
  const response = await fetch(new URL('/api/v1/login', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_code: 'mcp-pg-fixture-0', username: 'mcp-pg-fixture-0', password }),
  })
  assert.equal(response.status, 200)
  const login = await response.json() as { data: { access_token: string } }
  assert(typeof login.data.access_token === 'string')
  let grant: YuanShuMcpGrant | undefined
  const client = new YuanShuMcp({
    resource: new URL('/api/v1/client/mcp', origin).href, issuer: origin.origin, clientId: 'dsh-yuanshu',
    redirectUri: 'http://localhost:3065/yuanshu-mcp/callback', timeoutMs: 30_000,
    credentials: { read: async () => grant, write: async (value) => { grant = value } },
  })
  try {
    await client.authorize(login.data.access_token, '910001', 'enterprise:read enterprise:execute')
    const question = `来料检验规范 Q-001 规定每批抽样几件、尺寸公差不得超过多少毫米？尺寸超差后应怎么办？请引用原文证据。本次独立核验编号：${randomUUID()}。`
    const result = await client.call('knowledge_ask', { question, collection_ids: [991002], limit: 5 })
    assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent))
    const content = result.structuredContent as { data: {
      answer_mode: string
      answer: string
      citations: unknown[]
      synthesis_error?: string
      refused: boolean
      session_id: string
      turn_id: string
      answer_trace_id: string
      answer_artifact_reused: boolean
      citation_validation: { valid: boolean }
      diagnostics: { model_name: string }
    } }
    assert(content.data)
    assert.equal(content.data.refused, false)
    assert.equal(content.data.answer_mode, 'llm', `actual synthesis mode=${content.data.answer_mode}; reason=${content.data.synthesis_error ?? 'none'}`)
    assert.equal(content.data.answer_artifact_reused, false, 'A cached answer does not establish a real model invocation')
    assert.equal(content.data.citation_validation.valid, true)
    assert(content.data.diagnostics.model_name)
    assert(content.data.answer_trace_id)
    assert.match(content.data.answer, /0[.]2/u)
    assert.match(content.data.answer, /3|三/u)
    assert.match(content.data.answer, /整改|审批/u)
    assert(JSON.stringify(content.data.citations).includes('mcp-quality-q001-section3-991002'))
    const document = await client.resource('yuanshu://knowledge/991002')
    assert(JSON.stringify(document).includes('不得超过0.2毫米'))
    const turns = await client.call('knowledge_session_turns', { session_id: content.data.session_id })
    assert.notEqual(turns.isError, true)
    assert(JSON.stringify(turns.structuredContent).includes(content.data.turn_id))
    process.stdout.write(`DSH_MCP_KNOWLEDGE_LIVE_PASS mode=llm cached=false independent_golden=true cited_source=true persisted_turn=true session=${content.data.session_id}\n`)
  } finally { await client.revoke(); await client.close() }
}

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
