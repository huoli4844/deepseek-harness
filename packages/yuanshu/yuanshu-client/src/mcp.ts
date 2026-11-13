/** User-scoped enterprise MCP access using the official protocol client. */
import { HarnessError } from '@deepseek-ai/dsh-error'
import { Client, StreamableHTTPClientTransport, discoverOAuthProtectedResourceMetadata, discoverAuthorizationServerMetadata, extractWWWAuthenticateParams } from '@modelcontextprotocol/client'
import type { AuthProvider, InputRequiredResult, CallToolResult, Tool, Resource, ResourceTemplateType } from '@modelcontextprotocol/client'

/** A user-actionable authorization or protocol failure; callers query unknown business outcomes. */
export class YuanShuMcpError extends HarnessError {
  constructor(message: string, code: string = 'YUANSHU_MCP_AUTH_INVALID', readonly status: number = 401, options?: ErrorOptions) {
    super(message, code, options)
  }
}

/** A rotating user grant. Console login tokens are never accepted as MCP tokens. */
export interface YuanShuMcpGrant {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresAt: number
  readonly issuer: string
  readonly resource: string
  readonly clientId: string
}

/** Persist a grant only in storage scoped to the current signed-in user and tenant. */
export interface YuanShuMcpCredentials {
  read(): Promise<YuanShuMcpGrant | undefined>
  write(grant: YuanShuMcpGrant | undefined): Promise<void>
  /** Serialize a refresh against the newest persisted grant across processes. */
  rotate?(update: (current: YuanShuMcpGrant | undefined) => Promise<YuanShuMcpGrant | undefined>): Promise<void>
}

/** Explicit OAuth endpoints and budgets for one platform resource. */
export interface YuanShuMcpOptions {
  readonly resource: string
  readonly issuer: string
  readonly clientId: string
  readonly redirectUri: string
  readonly credentials: YuanShuMcpCredentials
  readonly fetch?: typeof globalThis.fetch
  readonly timeoutMs: number
  /** Maximum pages accepted from an enterprise catalog. */
  readonly maxCatalogPages?: number
}

function secureUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new YuanShuMcpError('MCP OAuth requires HTTPS or a loopback development endpoint')
  }
  return url
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new YuanShuMcpError('Invalid MCP OAuth response')
  return value as Record<string, unknown>
}

/**
 * Owns one user's official MCP client and OAuth refresh transaction. It never
 * retries unknown business outcomes or switches enterprise execution to HTTP.
 * The SDK may retry once after an authentication rejection before admission.
 */
export class YuanShuMcp implements AuthProvider {
  private readonly fetcher: typeof globalThis.fetch
  private readonly client: Client
  private connection: Promise<void> | undefined
  private refreshing: Promise<void> | undefined
  private lastToken: string | undefined
  private metadata: Record<string, unknown> | undefined
  private readonly catalogListeners = new Set<(error: Error | null) => void>()

  constructor(private readonly options: YuanShuMcpOptions) {
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 2_147_483_647) throw new YuanShuMcpError('MCP timeout must be a bounded positive integer', 'YUANSHU_MCP_CONFIG_INVALID', 400)
    if (options.maxCatalogPages !== undefined && (!Number.isSafeInteger(options.maxCatalogPages) || options.maxCatalogPages < 1 || options.maxCatalogPages > 1024)) throw new YuanShuMcpError('Invalid MCP catalog page budget', 'YUANSHU_MCP_CONFIG_INVALID', 400)
    secureUrl(options.resource); secureUrl(options.issuer); secureUrl(options.redirectUri)
    this.fetcher = options.fetch ?? globalThis.fetch
    this.client = new Client({ name: 'dsh-yuanshu', version: '1.0.0' }, {
      capabilities: { elicitation: { form: {} } }, versionNegotiation: { mode: { pin: '2026-07-28' } },
      // Approval is a durable platform operation. A resource must never gain
      // ambient client tools through an automatically fulfilled input request.
      inputRequired: { autoFulfill: false },
      listMaxPages: options.maxCatalogPages ?? 64,
      listChanged: {
        tools: { autoRefresh: false, debounceMs: 0, onChanged: (error) => {
          for (const listener of this.catalogListeners) listener(error)
        } },
        resources: { autoRefresh: false, debounceMs: 0, onChanged: (error) => {
          for (const listener of this.catalogListeners) listener(error)
        } },
      },
    })
  }

  /** Return the validated user's current access token for every protocol request. */
  async token(): Promise<string | undefined> {
    let grant = await this.options.credentials.read()
    if (grant === undefined) return undefined
    this.validateGrant(grant)
    if (grant.expiresAt <= Date.now() + 15_000) {
      await this.onUnauthorized()
      grant = await this.options.credentials.read()
    }
    this.lastToken = grant?.accessToken
    return this.lastToken
  }

  /** Rotate refresh credentials once; concurrent requests share the transaction. */
  onUnauthorized(): Promise<void> {
    return this.refreshing ??= this.refresh().finally(() => { this.refreshing = undefined })
  }

  private validateGrant(grant: YuanShuMcpGrant): void {
    if (grant.issuer !== this.options.issuer || grant.resource !== this.options.resource || grant.clientId !== this.options.clientId) throw new YuanShuMcpError('MCP grant belongs to another issuer, resource or client')
  }

  private async json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetcher(secureUrl(url), { ...init, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs) })
    if (!response.ok) throw new YuanShuMcpError(`MCP authorization request failed (${response.status})`, 'YUANSHU_MCP_AUTH_REJECTED', response.status)
    return object(await response.json())
  }

  /**
   * Discover resource and authorization metadata; absent PKCE support fails closed.
   * @returns Authorization server metadata after resource, issuer and PKCE checks.
   */
  async discoverAuthorization(): Promise<Record<string, unknown>> {
    const resourceUrl = secureUrl(this.options.resource)
    const discoveryFetch: typeof globalThis.fetch = (input, init) => this.fetcher(
      secureUrl(input instanceof Request ? input.url : String(input)), {
        ...init, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs),
      })
    // The unauthenticated GET only obtains the resource's challenge; the SDK
    // owns RFC 9728 path/root and RFC 8414/OIDC metadata fallback order.
    const challenge = await discoveryFetch(resourceUrl, { method: 'GET' })
    const resourceMetadataUrl = challenge.status === 401 ? extractWWWAuthenticateParams(challenge).resourceMetadataUrl : undefined
    await challenge.body?.cancel()
    if (resourceMetadataUrl !== undefined && secureUrl(String(resourceMetadataUrl)).origin !== resourceUrl.origin) throw new YuanShuMcpError('MCP resource metadata origin mismatch')
    const protectedMetadata = await discoverOAuthProtectedResourceMetadata(resourceUrl, { protocolVersion: '2026-07-28', ...resourceMetadataUrl === undefined ? {} : { resourceMetadataUrl } }, discoveryFetch)
    const issuers = protectedMetadata.authorization_servers
    if (protectedMetadata.resource !== this.options.resource || !Array.isArray(issuers) || !issuers.includes(this.options.issuer)) throw new YuanShuMcpError('MCP protected resource or issuer mismatch')
    const issuer = secureUrl(this.options.issuer)
    const discovered = await discoverAuthorizationServerMetadata(issuer, { fetchFn: discoveryFetch, protocolVersion: '2026-07-28' })
    if (discovered === undefined) throw new YuanShuMcpError('MCP authorization server metadata unavailable')
    const metadata = object(discovered)
    if (metadata.issuer !== this.options.issuer || !Array.isArray(metadata.code_challenge_methods_supported) || !metadata.code_challenge_methods_supported.includes('S256')) throw new YuanShuMcpError('MCP issuer must advertise S256 PKCE')
    for (const name of ['authorization_endpoint', 'token_endpoint']) {
      const value = metadata[name]
      if (typeof value !== 'string' || secureUrl(value).origin !== issuer.origin) throw new YuanShuMcpError('MCP OAuth endpoint origin mismatch')
    }
    if (metadata.revocation_endpoint !== undefined && (typeof metadata.revocation_endpoint !== 'string' || secureUrl(metadata.revocation_endpoint).origin !== issuer.origin)) throw new YuanShuMcpError('MCP OAuth revocation endpoint origin mismatch')
    this.metadata = metadata
    return metadata
  }

  /**
   * Authorize after explicit user consent using the current platform login.
   * @param consoleToken - current user's platform access token, only for consent.
   * @param tenant - selected platform tenant; the platform revalidates membership.
   * @param scope - consented read or read-and-execute scope.
   * @returns completion after the audience-bound grant is stored.
   */
  async authorize(consoleToken: string, tenant: string, scope: 'enterprise:read' | 'enterprise:read enterprise:execute'): Promise<void> {
    const metadata = await this.discoverAuthorization()
    const random = (): string => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('')
    const verifier = random(), state = random()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    const challenge = btoa(String.fromCharCode(...digest)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
    const form = new URLSearchParams({ response_type: 'code', client_id: this.options.clientId, redirect_uri: this.options.redirectUri,
      resource: this.options.resource, tenant, scope, state, code_challenge: challenge, code_challenge_method: 'S256', consent: 'approve' })
    const result = await this.json(String(metadata.authorization_endpoint), {
      method: 'POST', headers: { Authorization: `Bearer ${consoleToken}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    })
    if (typeof result.redirect_uri !== 'string') throw new YuanShuMcpError('MCP authorization response missing redirect')
    const redirect = new URL(result.redirect_uri)
    const expected = new URL(this.options.redirectUri)
    if (redirect.origin !== expected.origin || redirect.pathname !== expected.pathname || redirect.searchParams.get('state') !== state || redirect.searchParams.get('iss') !== this.options.issuer) throw new YuanShuMcpError('MCP authorization response issuer, state or redirect mismatch')
    const code = redirect.searchParams.get('code')
    if (code === null) throw new YuanShuMcpError('MCP authorization code missing')
    await this.options.credentials.write(await this.exchange(new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: this.options.redirectUri })))
  }

  private async exchange(form: URLSearchParams): Promise<YuanShuMcpGrant> {
    const metadata = this.metadata ?? await this.discoverAuthorization()
    form.set('client_id', this.options.clientId); form.set('resource', this.options.resource)
    const result = await this.json(String(metadata.token_endpoint), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
    if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' || result.token_type !== 'Bearer' || typeof result.expires_in !== 'number' || result.expires_in <= 0) throw new YuanShuMcpError('Invalid MCP token response')
    return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000,
      issuer: this.options.issuer, resource: this.options.resource, clientId: this.options.clientId }
  }

  private async refresh(): Promise<void> {
    const rotate = async (grant: YuanShuMcpGrant | undefined): Promise<YuanShuMcpGrant | undefined> => {
      if (grant === undefined) throw new YuanShuMcpError('MCP user authorization required')
      this.validateGrant(grant)
      if (this.lastToken !== undefined && grant.accessToken !== this.lastToken && grant.expiresAt > Date.now() + 15_000) return grant
      return this.exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: grant.refreshToken }))
    }
    let failure: unknown
    const guarded = async (grant: YuanShuMcpGrant | undefined): Promise<YuanShuMcpGrant | undefined> => {
      try { return await rotate(grant) }
      catch (error) { failure = error; return undefined }
    }
    if (this.options.credentials.rotate !== undefined) await this.options.credentials.rotate(guarded)
    else await this.options.credentials.write(await guarded(await this.options.credentials.read()))
    if (failure !== undefined) throw failure instanceof Error ? failure : new YuanShuMcpError('MCP token refresh failed')
  }

  private connect(): Promise<void> {
    return this.connection ??= this.client.connect(new StreamableHTTPClientTransport(new URL(this.options.resource), {
      authProvider: this, fetch: this.fetcher,
    }), { timeout: this.options.timeoutMs }).catch((error: unknown) => { this.connection = undefined; throw error })
  }

  /**
   * Discover all pages under the current grant; server TTL and scope govern SDK caching.
   * @returns All authorized tools within the configured page budget.
   */
  async tools(): Promise<Tool[]> {
    await this.connect()
    return (await this.client.listTools()).tools
  }

  /**
   * Return authorized resource descriptors under the same page budget as tools.
   * @returns All authorized resource descriptors within the configured page budget.
   */
  async resources(): Promise<Resource[]> {
    await this.connect()
    return (await this.client.listResources()).resources
  }

  /**
   * Discover authorized parameterized resource families under the current grant.
   * @returns Authorized URI templates within the configured page budget.
   */
  async resourceTemplates(): Promise<ResourceTemplateType[]> {
    await this.connect()
    return (await this.client.listResourceTemplates()).resourceTemplates
  }

  /**
   * Observe standard catalog invalidations; returned disposer owns this listener.
   * @param listener - invoked after invalidation, including subscription failure.
   * @returns removal function; callers rediscover within their task scope.
   */
  onCatalogChanged(listener: (error: Error | null) => void): () => void {
    this.catalogListeners.add(listener)
    return () => { this.catalogListeners.delete(listener) }
  }

  /**
   * Invoke once. Preserve an execution handle from structuredContent in the
   * session's existing tool/result event; unknown outcomes require a Run query.
   * @param name - authorized discovered tool name.
   * @param args - arguments validated again by the platform.
   * @param signal - request cancellation, independent of business Run cancellation.
   * @returns the original structured business result or an explicit input-required response.
   */
  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CallToolResult> {
    await this.connect()
    return this.client.callTool({ name, arguments: args }, { timeout: this.options.timeoutMs, ...signal === undefined ? {} : { signal } })
  }

  /**
   * Manual MRTR for a human-operated form. The SDK performs wire validation;
   * supplemental answers grant no business permission and are never auto-filled.
   * @param name - Discovered tool name.
   * @param args - Original business arguments, including the stable idempotency key.
   * @param continuation - Original state and explicitly entered primitive answers.
   * @returns Complete business result or the next standard input-required form.
   */
  async callWithInput(name: string, args: Record<string, unknown>, continuation: { requestState?: string; inputResponses?: Record<string, { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, string | number | boolean | string[]> }> } = {}): Promise<CallToolResult | InputRequiredResult> {
    await this.connect()
    return this.client.request({ method: 'tools/call', params: { name, arguments: args, ...continuation } }, { timeout: this.options.timeoutMs, allowInputRequired: true })
  }

  /**
   * Read an authorized resource without interpreting its text as client authority.
   * @param uri - Discovered URI, reauthorized by the platform when read.
   * @returns The official SDK resource response, including content and cache metadata.
   */
  async resource(uri: string): Promise<unknown> {
    await this.connect()
    return this.client.readResource({ uri }, { timeout: this.options.timeoutMs })
  }

  /** Revoke the whole platform grant and remove the user's local credentials. */
  async revoke(): Promise<void> {
    const grant = await this.options.credentials.read()
    if (grant !== undefined) {
      this.validateGrant(grant)
      const metadata = this.metadata ?? await this.discoverAuthorization()
      if (typeof metadata.revocation_endpoint !== 'string') throw new YuanShuMcpError('The authorization server does not advertise token revocation; revoke this grant in the platform account settings', 'YUANSHU_MCP_REVOCATION_UNAVAILABLE', 400)
      await this.fetcher(metadata.revocation_endpoint, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: grant.refreshToken, client_id: this.options.clientId }), signal: AbortSignal.timeout(this.options.timeoutMs) }).then((response) => { if (!response.ok) throw new YuanShuMcpError('MCP revocation failed') })
    }
    await this.options.credentials.write(undefined)
    await this.close()
  }

  /** Close the transport; accepted platform Runs remain queryable after reconnect. */
  async close(): Promise<void> {
    await this.client.close()
    this.connection = undefined
  }
}
