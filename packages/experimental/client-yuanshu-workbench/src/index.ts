/** Host registration for the Shaoshi workbench and its optional YuanShu connection. */
import type { Context } from '@deepseek-ai/cordis'
import type { McpAccountCopy } from '@deepseek-ai/dsh-mcp-account'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEmployee, YuanShuIdentityUnavailable, YuanShuSessionExpired } from './employee.ts'
import { proxyIdentityRequest } from './identity-proxy.ts'
import { PlatformHomeLoader, YuanShuGrantMismatch } from './platform-home.ts'
import z from '@deepseek-ai/schemastery'

/** Stable plugin name shown by the Loader. */
export const name = 'yuanshu-workbench'

/** Optional employee MCP connection for a single-account DSH Host. */
export interface Config {
  /** Employee MCP authorization and request settings, or false to disable the connection. */
  mcp: false | {
    /** MCP endpoint. */
    url: string
    /** Registered OAuth client ID. */
    clientId: string
    /** YuanShu API base URL. */
    apiUrl: string
    /** Deadline for workbench and MCP requests, in milliseconds. */
    requestTimeoutMs: number
  }
}

/** Validation and defaults for the optional employee connection. */
export const Config: z<Config> = z.object({
  mcp: z.union([z.const(false), z.object({
    url: z.string().required(),
    clientId: z.string().required(),
    apiUrl: z.string().required(),
    requestTimeoutMs: z.number().min(1000).max(300_000).default(90_000),
  })]).default(false),
})

const account = { en: 'YuanShu account', zh: '元枢账号' }
const connect = { en: 'Sign in to YuanShu', zh: '登录元枢' }
const copy: McpAccountCopy = {
  title: account,
  connect,
  activation: {
    title: connect,
    body: { en: 'Use your employee account to connect the workbench assistant.', zh: '使用员工账号连接工作台助理。' },
  },
  detail: {
    disconnected: { en: 'YuanShu is disconnected.', zh: '元枢未连接。' },
    waitingBrowser: { en: 'Finish signing in in your browser.', zh: '请在浏览器中完成登录。' },
    authorizing: { en: 'Authorizing YuanShu…', zh: '正在授权元枢…' },
    connecting: { en: 'Connecting to YuanShu…', zh: '正在连接元枢…' },
    connected: { en: 'YuanShu is connected.', zh: '元枢已连接。' },
    rejected: { en: 'Sign in to YuanShu again.', zh: '请重新登录元枢。' },
    scope: { en: 'The YuanShu grant lacks the required permission.', zh: '当前元枢授权缺少所需权限。' },
  },
  signOut: {
    title: { en: 'Sign out of YuanShu?', zh: '退出元枢账号？' },
    body: { en: 'Disconnect YuanShu from this DSH Host.', zh: '断开当前 DSH Host 与元枢的连接。' },
  },
  notice: {
    connected: { en: 'YuanShu connected.', zh: '元枢已连接。' },
    signedOut: { en: 'Signed out of YuanShu.', zh: '已退出元枢账号。' },
  },
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

const PERSONAL_ROUTE = /^\/yuanshu-workbench\/personal\/(calendars|calendar-events|tasks)(?:\/([1-9]\d*))?$/u

async function requestBody(req: IncomingMessage): Promise<Buffer<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += bytes.byteLength
    if (size > 1_048_576) return undefined
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size)
}

function personalMethodAllowed(method: string, hasId: boolean): boolean {
  return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
}

async function proxyPersonalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost')
  const route = PERSONAL_ROUTE.exec(incoming.pathname)
  const method = req.method ?? ''
  if (route === null || !personalMethodAllowed(method, route[2] !== undefined)) {
    res.writeHead(route === null ? 404 : 405, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  const remote = new URL(`${api}/api/v1${incoming.pathname.slice('/yuanshu-workbench'.length)}`)
  remote.search = incoming.search
  const headers: Record<string, string> = { authorization, accept: 'application/json' }
  if (activeTenant !== undefined && activeTenant !== '') headers['X-Active-Tenant'] = activeTenant
  let body: Buffer<ArrayBuffer> | null = null
  if (method === 'POST' || method === 'PUT') {
    const payload = await requestBody(req)
    if (payload === undefined) {
      res.writeHead(413, { 'cache-control': 'no-store', connection: 'close' })
      res.end()
      return
    }
    body = payload
    headers['content-type'] = 'application/json'
  }
  const response = await fetch(remote, {
    method,
    headers,
    body,
    signal,
    redirect: 'error',
  })
  const result = new Uint8Array(await response.arrayBuffer())
  res.writeHead(response.status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(result)
}

/**
 * Register the employee connection when the profile enables it.
 * @param ctx - Workbench plugin context.
 * @param config - Employee MCP endpoint and registered OAuth client ID.
 */
export function apply(ctx: Context, config: Config): void {
  const mcp = config.mcp
  if (mcp === false) return
  let connecting = false
  /** Live explicit-consent authorization: URL handed to the browser, awaiting the callback. */
  let pendingConsent: { url: string } | undefined
  const homeLoader = new PlatformHomeLoader()
  ctx.inject(['webServer', 'mcpManager'], (scope) => {
    scope.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: '__DSH_YUANSHU_HOME__', value: true })
    })
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/yuanshu-workbench/home',
      auth: 'required',
      async handler(req, res) {
        const send = (status: number, payload?: object): void => {
          res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json' })
          res.end(payload === undefined ? undefined : JSON.stringify(payload))
        }
        if (req.method !== 'GET' && req.method !== 'POST') {
          send(405)
          return
        }
        if (req.method === 'POST' && req.headers['sec-fetch-site'] !== 'same-origin') {
          send(403)
          return
        }
        const section = new URL(req.url ?? '/', 'http://localhost').searchParams.get('section') ?? 'assistant'
        if (!['assistant', 'tasks', 'dashboard', 'priorities', 'methods', 'position-operations', 'project-operations', 'calendar'].includes(section)) {
          send(400)
          return
        }
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          send(401)
          return
        }
        const lifetime = new AbortController()
        const close = () => { lifetime.abort() }
        res.once('close', close)
        const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)])
        try {
          const activeTenant = req.headers['x-active-tenant']
          const headers = { authorization, ...(typeof activeTenant === 'string' && activeTenant !== '' ? { 'X-Active-Tenant': activeTenant } : {}) }
          const api = mcp.apiUrl.replace(/\/+$/u, '')
          if (req.method === 'POST') {
            const employee = await loadEmployee(api, headers, signal)
            if (pendingConsent !== undefined) {
              // An explicit-consent window is already open: re-hand out the
              // same authorization URL instead of starting a rival attempt.
              send(403, { authorizationUrl: pendingConsent.url })
              return
            }
            if (connecting) {
              send(409)
              return
            }
            connecting = true
            const attempt = await scope.mcpManager.startAuthorization(name).catch((error: unknown) => { connecting = false; throw error })
            try {
              let submitted = false
              let responded = false
              // The explicit-consent window outlives the HTTP request: after
              // the authorization URL reaches the browser the connection may
              // close, so the watch runs on its own deadline and the callback
              // can still land while no request is attached.
              const watchDeadline = AbortSignal.timeout(Math.max(mcp.requestTimeoutMs, 300_000))
              for await (const servers of scope.mcpManager.watch(watchDeadline)) {
                const view = servers.find(server => server.name === name)?.authorization
                if (view?.id !== attempt.id || view.phase === 'failed' || view.phase === 'cancelled') {
                  if (!responded) send(503)
                  return
                }
                if (view.phase === 'authorized') {
                  if (!responded) send(204)
                  return
                }
                if (submitted || view.phase !== 'waiting-browser' || view.authorizationUrl === undefined) continue
                const request = new URL(view.authorizationUrl)
                const endpoint = new URL(`${api}/api/v1/mcp/oauth/preauthorize`)
                if (request.origin !== endpoint.origin || request.pathname !== '/api/v1/mcp/oauth/authorize') {
                  send(502)
                  return
                }
                const grant = await fetch(endpoint, {
                  method: 'POST',
                  headers: { authorization, 'X-Active-Tenant': employee.tenantId },
                  body: request.searchParams,
                  signal,
                  redirect: 'error',
                })
                if (grant.status === 403) {
                  // consent_required: the tenant has not approved this client
                  // for this grant yet, so preauthorize cannot grant silently.
                  // The consent page's own protocol (authorize + consent=approve
                  // with the employee token) can approve programmatically, so
                  // complete the consent server-side without any browser round
                  // trip; only fall back to the explicit browser consent page
                  // when the backend refuses the programmatic approval.
                  const consent = new URLSearchParams(request.searchParams)
                  consent.set('consent', 'approve')
                  consent.set('tenant', employee.tenantCode)
                  const approve = await fetch(`${api}/api/v1/mcp/oauth/authorize`, {
                    method: 'POST',
                    headers: { authorization, 'X-Active-Tenant': employee.tenantCode, accept: 'application/json' },
                    body: consent,
                    signal,
                    redirect: 'error',
                  }).catch(() => undefined)
                  if (approve !== undefined && approve.ok) {
                    const redirect = field(await approve.json(), 'redirect_uri')
                    if (typeof redirect === 'string') {
                      const callback = new URL(redirect)
                      const expected = new URL(request.searchParams.get('redirect_uri') ?? '')
                      if (callback.origin === expected.origin && callback.pathname === expected.pathname &&
                          !callback.username && !callback.password && !callback.hash &&
                          callback.searchParams.get('state') === request.searchParams.get('state')) {
                        const result = await fetch(callback, { signal, redirect: 'error' })
                        if (result.ok) continue
                      }
                    }
                  }
                  pendingConsent = { url: view.authorizationUrl }
                  responded = true
                  send(403, { authorizationUrl: view.authorizationUrl })
                  continue
                }
                if (!grant.ok) {
                  // Surface the backend's own status (rate limit, validation,
                  // outage…) so the browser can explain what actually failed.
                  send(502, { upstream: grant.status })
                  return
                }
                const redirect = field(await grant.json(), 'redirect_uri')
                if (typeof redirect !== 'string') {
                  send(502)
                  return
                }
                const callback = new URL(redirect)
                const expected = new URL(request.searchParams.get('redirect_uri') ?? '')
                if (callback.origin !== expected.origin || callback.pathname !== expected.pathname ||
                    callback.username || callback.password || callback.hash ||
                    callback.searchParams.get('state') !== request.searchParams.get('state')) {
                  send(502)
                  return
                }
                submitted = true
                const result = await fetch(callback, { signal, redirect: 'error' })
                if (!result.ok) {
                  send(502, { upstream: result.status })
                  return
                }
              }
              if (!responded) send(503)
              return
            } finally {
              pendingConsent = undefined
              try { await scope.mcpManager.cancelAuthorization(name, attempt.id) }
              finally { connecting = false }
            }
          }
          let lastRestartAt = 0
          for await (const servers of scope.mcpManager.watch(signal)) {
            const status = servers.find(server => server.name === name)?.status
            if (status?.state === 'waiting-authorization') {
              send(424)
              return
            }
            if (status?.state === 'connected') {
              const employee = loadEmployee(api, headers, signal)
              const home = await homeLoader.load(scope.mcpManager.projectionReader(name), employee, status.connectedAt, signal, section)
              send(200, home)
              return
            }
            if (status?.state !== 'connecting' && status?.state !== 'reconnecting') {
              // The supervisor stops retrying after repeated reconnect
              // failures ('gave-up') and never retries on its own, which
              // would leave the panel stuck on 503 forever even though the
              // stored grant is usually fine by then. Kick a fresh
              // connection periodically and keep watching instead.
              if (status?.state === 'failed' && ('reason' in status ? status.reason : undefined) !== 'cleanup' &&
                  Date.now() - lastRestartAt >= 15_000) {
                lastRestartAt = Date.now()
                void scope.mcpManager.restart(name).catch(() => undefined)
                continue
              }
              // Surface why the connection is not progressing so the browser
              // can show something more actionable than a bare 503.
              const detail = status === undefined
                ? 'server not registered'
                : `${status.state}${'reason' in status && status.reason !== undefined ? ` (${status.reason})` : ''}${'lastError' in status && status.lastError !== undefined && status.lastError !== '' ? `: ${status.lastError}` : ''}`
              send(503, { detail })
              return
            }
          }
          send(503, { detail: 'connection did not become ready in time' })
          return
        } catch (error) {
          if (error instanceof YuanShuSessionExpired) {
            send(401)
            return
          }
          if (error instanceof YuanShuIdentityUnavailable) {
            send(502, error.upstream === undefined ? undefined : { upstream: error.upstream })
            return
          }
          if (error instanceof YuanShuGrantMismatch) {
            send(424)
            return
          }
          if (!lifetime.signal.aborted) {
            scope.logger.warn('YuanShu workbench home unavailable', error instanceof Error ? error.name : 'unknown error')
            send(503)
          }
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu: employee home')
    // OEM branding: the platform's public OEM config and icon, proxied
    // same-origin so the client shell can brand itself without CORS setup.
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/yuanshu-workbench/oem-configs',
      auth: 'anonymous',
      async handler(req, res) {
        const send = (status: number, payload?: object): void => {
          res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json' })
          res.end(payload === undefined ? undefined : JSON.stringify(payload))
        }
        if (req.method !== 'GET') {
          send(405)
          return
        }
        try {
          const api = mcp.apiUrl.replace(/\/+$/u, '')
          const response = await fetch(`${api}/api/v1/oem-configs/public`, { signal: AbortSignal.timeout(Math.min(mcp.requestTimeoutMs, 15_000)) })
          if (!response.ok) {
            send(502)
            return
          }
          const data = field(await response.json(), 'data')
          if (typeof data !== 'object' || data === null) {
            send(502)
            return
          }
          send(200, data)
        } catch {
          send(502)
        }
      },
    }), 'yuanshu: oem configs')
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/yuanshu-workbench/oem-configs/icon',
      auth: 'anonymous',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' })
          res.end()
          return
        }
        try {
          const api = mcp.apiUrl.replace(/\/+$/u, '')
          const response = await fetch(`${api}/api/v1/oem-configs/public/icon`, { signal: AbortSignal.timeout(Math.min(mcp.requestTimeoutMs, 15_000)) })
          if (!response.ok) {
            res.writeHead(502)
            res.end()
            return
          }
          const payload = Buffer.from(await response.arrayBuffer())
          res.writeHead(200, {
            'cache-control': 'public, max-age=300',
            'content-length': String(payload.byteLength),
            'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
          })
          res.end(payload)
        } catch {
          res.writeHead(502)
          res.end()
        }
      },
    }), 'yuanshu: oem icon')

    // 身份 / 个人资料 / 工时：只读代理，供左下角用户卡片与经营总览使用。
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/yuanshu-workbench/identity',
      auth: 'required',
      async handler(req, res) {
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          res.writeHead(401, { 'cache-control': 'no-store' })
          res.end()
          return
        }
        const lifetime = new AbortController()
        const close = () => { lifetime.abort() }
        res.once('close', close)
        try {
          await proxyIdentityRequest(
            req,
            res,
            mcp.apiUrl.replace(/\/+$/u, ''),
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
          )
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu: identity API')

    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/yuanshu-workbench/personal',
      auth: 'required',
      async handler(req, res) {
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          res.writeHead(401, { 'cache-control': 'no-store' })
          res.end()
          return
        }
        if (req.method !== 'GET' && req.headers['sec-fetch-site'] !== 'same-origin') {
          res.writeHead(403, { 'cache-control': 'no-store' })
          res.end()
          return
        }
        const lifetime = new AbortController()
        const close = () => { lifetime.abort() }
        res.once('close', close)
        try {
          await proxyPersonalRequest(
            req,
            res,
            mcp.apiUrl.replace(/\/+$/u, ''),
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
          )
        } catch (error) {
          if (!lifetime.signal.aborted) {
            scope.logger.warn('YuanShu personal workspace unavailable', error instanceof Error ? error.name : 'unknown error')
            if (!res.headersSent) {
              res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: 'YuanShu personal workspace unavailable' }))
            }
          }
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu: personal workspace API')
  })
  ctx.inject(['mcpManager', 'mcpAccounts'], (scope) => {
    scope.mcpManager.register(name, {
      transport: 'streamable-http',
      url: mcp.url,
      toolLoading: 'on-demand',
      startupTimeoutMs: mcp.requestTimeoutMs,
      toolCallTimeoutMs: mcp.requestTimeoutMs,
      oauth: {
        credentialKey: 'mcp-client/yuanshu-workbench',
        clientId: mcp.clientId,
        // The deployed YuanShu preauthorize endpoint validates the requested
        // scope against the full registered grant set: read-only requests are
        // rejected with invalid_request, so request the complete scope pair.
        scope: 'enterprise:read enterprise:execute',
      },
    })
    scope.effect(() => scope.mcpAccounts.register({
      server: name,
      packageName: '@deepseek-ai/dsh-client-yuanshu-workbench',
      copy,
    }), 'yuanshu: employee account')
  })
}
