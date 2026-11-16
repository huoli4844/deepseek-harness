/** Launched by the Go ontology test with a disposable OAuth user grant. */
import assert from 'node:assert/strict'
import { YuanShuMcp } from '../src/mcp.ts'
import { YuanShuClient } from '../src/index.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const resource = process.env.MCP_ONTOLOGY_URL
  const issuer = process.env.MCP_ONTOLOGY_ISSUER
  const token = process.env.MCP_ONTOLOGY_TOKEN
  assert(resource && issuer && token, 'The Go test must provide disposable ontology credentials')
  let grant: YuanShuMcpGrant | undefined = { accessToken: token, refreshToken: 'unused', expiresAt: Date.now() + 300_000, resource, issuer, clientId: 'ontology-test' }
  const client = new YuanShuMcp({ timeoutMs: 10_000, resource, issuer, clientId: 'ontology-test', redirectUri: 'http://localhost:3000/ontology-test-callback', credentials: { read: async () => grant, write: async (value) => { grant = value } } })
  try {
    const adapter = new YuanShuClient({ baseURL: issuer, enterprise: client })
    const spaces = await adapter.listOntologySpaces()
    assert(JSON.stringify(spaces).includes('采购本体空间'))
    const collections = await adapter.listOntologyCollections(3)
    assert(JSON.stringify(collections).includes('采购集合') && !JSON.stringify(collections).includes('foreign-collection'))
    const releases = await adapter.listOntologyReleases(10, 3)
    assert(JSON.stringify(releases).includes('ontology-test-hash'))
    const tools = await client.tools()
    const context = tools.find(tool => tool.name === 'ontology_context')
    const evidence = tools.find(tool => tool.name === 'ontology_evidence')
    assert(context?.outputSchema && evidence?.outputSchema)
    assert(JSON.stringify(evidence.inputSchema).includes('consumer_id'))
    assert(!JSON.stringify(evidence.inputSchema).includes('evidence_id'))
    const definition = await client.call('ontology_context', { release_id: 7, session_id: 'ontology-probe', conversation_id: 'ontology-probe' })
    assert.notEqual(definition.isError, true, JSON.stringify(definition.structuredContent))
    const encoded = JSON.stringify(definition.structuredContent)
    assert(encoded.includes('订单编号') && encoded.includes('filter_operators') && encoded.includes('supports_aggregate'))
    assert(!encoded.includes('sourceMapping') && !encoded.includes('private'))
    const report = await client.call('ontology_evidence', { release_id: 7, limit: 1, session_id: 'ontology-probe', conversation_id: 'ontology-probe' })
    assert.notEqual(report.isError, true, JSON.stringify(report.structuredContent))
    const audit = JSON.stringify(report.structuredContent)
    assert(audit.includes('visible-trace') && !audit.includes('foreign-trace'))
    assert(audit.includes('"ready":false'))
    const obsolete = await client.call('ontology_evidence', { release_id: 7, evidence_id: 'obsolete' })
    assert.equal(obsolete.isError, true)
    process.stdout.write('DSH_MCP_ONTOLOGY_PASS original_handlers=true real_sqlite=true spaces=true collections=true releases=true context=true evidence=true obsolete_rejected=true\n')
  } finally { await client.close() }
}

void main().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1 })
