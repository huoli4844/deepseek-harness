import { describe, expect, it } from 'vitest'
import { YuanShuMcp, type YuanShuMcpGrant } from '../src/mcp.ts'

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
  it('carries the explicitly selected tenant through console admission and OAuth consent', async () => {
    let saved: YuanShuMcpGrant | undefined
    const redirectUri = 'http://localhost:3000/callback'
    const client = new YuanShuMcp({ resource, issuer, clientId: 'dsh', redirectUri, timeoutMs: 1000,
      credentials: { read: async () => saved, write: async (grant) => { saved = grant } },
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.includes('oauth-protected-resource')) return json({ resource, authorization_servers: [issuer] })
        if (url.includes('oauth-authorization-server')) return json(metadata)
        if (url === metadata.authorization_endpoint) {
          const headers = new Headers(init?.headers)
          const form = init?.body
          if (!(form instanceof URLSearchParams)) throw new Error('Expected an OAuth form')
          if (headers.get('X-Active-Tenant') !== form.get('tenant')) return new Response(null, { status: 403 })
          expect(headers.get('Authorization')).toBe('Bearer console-test')
          expect(form.get('tenant')).toBe('17')
          expect(form.get('scope')).toBe('enterprise:read enterprise:execute')
          const redirect = new URL(redirectUri)
          redirect.searchParams.set('state', form.get('state')!)
          redirect.searchParams.set('iss', issuer)
          redirect.searchParams.set('code', 'one-time-code')
          return json({ redirect_uri: redirect.href })
        }
        if (url === metadata.token_endpoint) {
          expect(new Headers(init?.headers).has('Authorization')).toBe(false)
          expect(new Headers(init?.headers).has('X-Active-Tenant')).toBe(false)
          return json({ access_token: 'mcp-access', refresh_token: 'mcp-refresh', token_type: 'Bearer', expires_in: 300 })
        }
        return missing()
      },
    })
    try {
      await client.authorize('console-test', '17', 'enterprise:read enterprise:execute')
      expect(saved).toMatchObject({ accessToken: 'mcp-access', issuer, resource, clientId: 'dsh' })
    } finally { await client.close() }
  })

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
