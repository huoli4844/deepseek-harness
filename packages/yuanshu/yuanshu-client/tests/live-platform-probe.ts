/** Official SDK against the complete loopback API, including real user login. */
import assert from 'node:assert/strict'
import { YuanShuMcp } from '../src/mcp.ts'
import type { YuanShuMcpGrant } from '../src/mcp.ts'

async function main(): Promise<void> {
  const base = process.env.MCP_PLATFORM_URL
  const username = process.env.MCP_PLATFORM_USERNAME
  const password = process.env.MCP_PLATFORM_PASSWORD
  const tenantCode = process.env.MCP_PLATFORM_TENANT_CODE
  const tenantId = process.env.MCP_PLATFORM_TENANT_ID
  assert(base && username && password && tenantCode && tenantId, 'Explicit isolated platform and synthetic account required')
  const origin = new URL(base)
  assert(['127.0.0.1', 'localhost'].includes(origin.hostname) && username.startsWith('mcp-'), 'Loopback synthetic accounts only')
  const resource = new URL('/api/v1/client/mcp', origin).href
  const loginResponse = await fetch(new URL('/api/v1/login', origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, tenant_code: tenantCode }),
  })
  assert.equal(loginResponse.status, 200)
  const login = await loginResponse.json() as { data: { access_token: string; requires_totp?: boolean } }
  assert.equal(typeof login.data.access_token, 'string')
  assert(!login.data.requires_totp, 'Use a synthetic non-MFA account for this unattended probe')
  const rejected = await fetch(resource, { headers: { Authorization: `Bearer ${login.data.access_token}` } })
  assert.equal(rejected.status, 401, 'Platform login JWT must not be an MCP access token')
  await rejected.body?.cancel()
  let grant: YuanShuMcpGrant | undefined
  const methods: string[] = []
  const client = new YuanShuMcp({
    resource, issuer: origin.origin, clientId: 'dsh-yuanshu', redirectUri: 'http://localhost:3065/yuanshu-mcp/callback', timeoutMs: 10_000,
    credentials: { read: async () => grant, write: async (value) => { grant = value } },
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        try {
          const request = JSON.parse(init.body) as { method?: string; params?: { _meta?: Record<string, unknown> } }
          if (request.method !== undefined) {
            methods.push(request.method)
            assert.equal(new Headers(init.headers).get('Mcp-Method'), request.method)
            assert.equal(request.params?._meta?.['io.modelcontextprotocol/protocolVersion'], '2026-07-28')
          }
        } catch (error) { if (!(error instanceof SyntaxError)) throw error }
      }
      const response = await fetch(input, init)
      assert.equal(response.headers.get('Mcp-Session-Id'), null)
      return response
    },
  })
  try {
    await client.authorize(login.data.access_token, tenantId, 'enterprise:read enterprise:execute')
    const tools = await client.tools()
    assert(tools.some(tool => tool.name === 'workbench_records'))
    const page = await client.call('workbench_describe', {})
    assert.equal(page.isError, undefined)
    const records = await client.call('workbench_records', {})
    assert.notEqual(records.isError, true)
    assert(JSON.stringify(records.structuredContent).includes('Q-2026-0818-006'), 'Manufacturing fixture must return an actual business record')
    await client.resources()
    await client.resourceTemplates()
    const originalRefresh = grant?.refreshToken
    assert(originalRefresh)
    await client.onUnauthorized()
    assert(grant?.refreshToken && grant.refreshToken !== originalRefresh, 'Refresh token must rotate')
    const currentToken = await client.token()
    assert(currentToken)
    assert.notEqual((await client.call('workbench_describe', {})).isError, true)
    await client.revoke()
    const revoked = await fetch(resource, { headers: { Authorization: `Bearer ${currentToken}` } })
    assert.equal(revoked.status, 401)
    await revoked.body?.cancel()
    assert.equal(grant, undefined)
    assert(methods.includes('server/discover') && methods.includes('tools/call') && !methods.includes('initialize'))
    process.stdout.write(`DSH_MCP_LIVE_PLATFORM_PASS ${JSON.stringify({ login: true, pkce: true, loginJwtRejected: true, refreshRotation: true, revocation: true, tools: tools.length, methods: [...new Set(methods)], business: 'isolated manufacturing' })}\n`)
  } finally { await client.close() }
}

void main().catch((error: unknown) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1 })
