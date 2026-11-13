import { describe, expect, it } from 'vitest'
import { YuanShuMcp } from '../src/mcp.ts'

const resource = 'https://platform.example/api/v1/client/mcp'
const issuer = 'https://platform.example/identity'
const metadata = { issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, revocation_endpoint: `${issuer}/revoke`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'] }

function fixture(handler: (url: string) => Response) {
  const calls: string[] = []
  const client = new YuanShuMcp({ resource, issuer, clientId: 'dsh', redirectUri: 'http://localhost:3000/callback', timeoutMs: 1000,
    credentials: { read: async () => undefined, write: async () => {} },
    fetch: async (input) => { const url = input instanceof Request ? input.url : input.toString(); calls.push(url); return handler(url) },
  })
  return { client, calls }
}
const json = (value: unknown) => Response.json(value)
const missing = () => new Response(null, { status: 404 })

describe('MCP authorization metadata', () => {
  it('uses a resource challenge and OIDC discovery without sending credentials', async () => {
    const f = fixture((url) => {
      if (url === resource) return new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://platform.example/metadata"' } })
      if (url === 'https://platform.example/metadata') return json({ resource, authorization_servers: [issuer] })
      if (url === 'https://platform.example/.well-known/openid-configuration/identity') return json({ ...metadata, jwks_uri: `${issuer}/jwks`, subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] })
      return missing()
    })
    try {
      await expect(f.client.discoverAuthorization()).resolves.toMatchObject({ issuer, authorization_endpoint: metadata.authorization_endpoint, token_endpoint: metadata.token_endpoint, code_challenge_methods_supported: ['S256'] })
      expect(f.calls).toContain('https://platform.example/metadata')
      expect(f.calls).toContain('https://platform.example/.well-known/openid-configuration/identity')
    } finally { await f.client.close() }
  })

  it('falls back from path metadata to the resource origin root', async () => {
    const f = fixture((url) => {
      if (url === 'https://platform.example/.well-known/oauth-protected-resource') return json({ resource, authorization_servers: [issuer] })
      if (url === 'https://platform.example/.well-known/oauth-authorization-server/identity') return json(metadata)
      return missing()
    })
    try {
      await expect(f.client.discoverAuthorization()).resolves.toMatchObject(metadata)
      expect(f.calls.indexOf('https://platform.example/.well-known/oauth-protected-resource/api/v1/client/mcp')).toBeLessThan(f.calls.indexOf('https://platform.example/.well-known/oauth-protected-resource'))
    } finally { await f.client.close() }
  })

  it('rejects a mismatched issuer and untrusted metadata URL', async () => {
    const wrongIssuer = fixture(url => url.includes('oauth-protected-resource') ? json({ resource, authorization_servers: [issuer] }) : url.includes('oauth-authorization-server') ? json({ ...metadata, issuer: 'https://attacker.example' }) : missing())
    try { await expect(wrongIssuer.client.discoverAuthorization()).rejects.toThrow() }
    finally { await wrongIssuer.client.close() }
    const wrongOrigin = fixture(() => new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://attacker.example/metadata"' } }))
    try { await expect(wrongOrigin.client.discoverAuthorization()).rejects.toThrow('origin mismatch'); expect(wrongOrigin.calls).toEqual([resource]) }
    finally { await wrongOrigin.client.close() }
  })
})
