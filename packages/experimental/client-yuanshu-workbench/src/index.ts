/** Host registration for the Shaoshi workbench and its optional YuanShu connection. */
import type { Context } from '@deepseek-ai/cordis'
import type { McpAccountCopy } from '@deepseek-ai/dsh-mcp-account'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { loadEmployee, YuanShuIdentityUnavailable, YuanShuSessionExpired } from './employee.ts'
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

/**
 * Register the employee connection when the profile enables it.
 * @param ctx - Workbench plugin context.
 * @param config - Employee MCP endpoint and registered OAuth client ID.
 */
export function apply(ctx: Context, config: Config): void {
  const mcp = config.mcp
  if (mcp === false) return
  let connecting = false
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
            if (connecting) {
              send(409)
              return
            }
            connecting = true
            const attempt = await scope.mcpManager.startAuthorization(name).catch((error: unknown) => { connecting = false; throw error })
            try {
              let submitted = false
              for await (const servers of scope.mcpManager.watch(signal)) {
                const view = servers.find(server => server.name === name)?.authorization
                if (view?.id !== attempt.id || view.phase === 'failed' || view.phase === 'cancelled') {
                  send(503)
                  return
                }
                if (view.phase === 'authorized') {
                  send(204)
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
                  send(403)
                  return
                }
                if (!grant.ok) {
                  send(502)
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
                  send(502)
                  return
                }
              }
              send(503)
              return
            } finally {
              try { await scope.mcpManager.cancelAuthorization(name, attempt.id) }
              finally { connecting = false }
            }
          }
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
              send(503)
              return
            }
          }
          send(503)
          return
        } catch (error) {
          if (error instanceof YuanShuSessionExpired) {
            send(401)
            return
          }
          if (error instanceof YuanShuIdentityUnavailable) {
            send(502)
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
        scope: 'enterprise:read',
      },
    })
    scope.effect(() => scope.mcpAccounts.register({
      server: name,
      packageName: '@deepseek-ai/dsh-client-yuanshu-workbench',
      copy,
    }), 'yuanshu: employee account')
  })
}
