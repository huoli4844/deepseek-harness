/** Host registration for the Shaoshi workbench and its optional YuanShu connection. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { McpAccountCopy } from '@deepseek-ai/dsh-mcp-account'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-tools'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import { fileURLToPath } from 'node:url'
import { registerBusinessSkill } from './plugins/yuanshu-equipment-intake/capability-skill.ts'
import { applyDailyReport } from './daily-report-runtime.ts'
import { loadEmployee, YuanShuIdentityUnavailable, YuanShuSessionExpired } from './employee.ts'
import { EmployeeAccessStore } from './employee-access.ts'
import { registerEmployeeAccess } from './employee-access-route.ts'
import { loadHolidayYear } from './holiday-calendar.ts'
import { registerIntegrationStatus } from './integration-status.ts'
import { proxyIdentityRequest } from './identity-proxy.ts'
import { proxyContractList } from './contract-proxy.ts'
import { organizationProxyRoute, ORGANIZATION_ROUTES as ORGANIZATION_PROXY_ROUTES } from './organization-proxy.ts'
import { shaoshiMasterMethodAllowed } from './master-data-proxy.ts'
import { projectProxyRoute } from './project-proxy.ts'
import { PlatformHomeLoader, YuanShuGrantMismatch } from './platform-home.ts'
import { registerMcpCapabilities } from './mcp-capabilities.ts'
import { registerTodoRoutes } from './todos/routes.ts'
import { TodoStore } from './todos/store.ts'
import { registerTodoTools } from './todos/tools.ts'
import { registerPersonalPageRoutes } from './personal-pages/routes.ts'
import { PersonalPageStore } from './personal-pages/store.ts'
import { registerDataQueryRoute } from './data-query-proxy.ts'
import { registerSkillStoreRoutes } from './skill-store/routes.ts'
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
    /** Deadline for MCP connection startup and initial tool discovery, in milliseconds. */
    startupTimeoutMs: number
    /** Deadline for workbench API and MCP tool requests, in milliseconds. */
    requestTimeoutMs: number
  }
  /** YuanShu business-data API configuration. */
  data: {
    /** Business API base URL. */
    apiUrl: string
  }
}

/** Validation and defaults for the optional employee connection. */
export const Config: z<Config> = z.object({
  mcp: z.union([z.const(false), z.object({
    url: z.string().required(),
    clientId: z.string().required(),
    apiUrl: z.string().required(),
    startupTimeoutMs: z.number().min(1000).max(300_000).default(30_000),
    requestTimeoutMs: z.number().min(1000).max(300_000).default(90_000),
  })]).default(false),
  data: z.object({
    apiUrl: z.string().default('https://8-148-158-251.sslip.io'),
  }).default({}),
})

const account = { en: 'YuanShu account', zh: '元枢账号' }
const connect = { en: 'Sign in to YuanShu', zh: '登录元枢' }
/** 工作台会话使用的专用 Agent preset；只有它的会话能看到元枢 MCP 工具。 */
const WORKBENCH_AGENT_PRESET = 'yuanshu'
/** 元枢 MCP 工具的全局命名空间前缀。 */
const YUANSHU_TOOL_PREFIX = `mcp__${name}__`
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
/** 主数据代理放行的资源集合，只保留云端仍在服务的少仕主数据。 */
const MASTER_RESOURCES = 'customers|suppliers|supplier-categories|materials|material-categories|equipments|onboarding-tasks|user-positions'
const SHAOSHI_MASTER_ROUTE = new RegExp(`^/yuanshu-workbench/(${MASTER_RESOURCES})(?:/([1-9]\\d*))?$`, 'u')

/** 设备台账与人员入职登记注册在独立应用命名空间下，用户任职沿用线上顶层路径，其余主数据沿用少仕应用。 */
function masterUpstreamPath(resource: string, id: string | undefined): string {
  if (resource === 'user-positions') return `/api/v1/user-positions${id === undefined ? '' : `/${id}`}`
  if (resource === 'equipments') return `/api/v1/apps/shaoshi/mes/equipments${id === undefined ? '' : `/${id}`}`
  if (resource === 'onboarding-tasks') return '/api/v1/apps/shaoshi/hr/onboarding-tasks'
  return `/api/v1/apps/shaoshi/${resource}${id === undefined ? '' : `/${id}`}`
}

async function requestBody(req: IncomingMessage): Promise<Buffer<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false }) as AsyncIterableIterator<string | Uint8Array>) {
    const bytes = Buffer.from(chunk)
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

async function proxyShaoshiMasterRequest(
  req: IncomingMessage,
  res: ServerResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost')
  const route = SHAOSHI_MASTER_ROUTE.exec(incoming.pathname)
  const method = req.method ?? ''
  if (incoming.pathname === '/yuanshu-workbench/contracts') {
    const headers: Record<string, string> = { authorization, accept: 'application/json' }
    if (activeTenant) headers['X-Active-Tenant'] = activeTenant
    await proxyContractList(req, res, api, headers, signal)
    return
  }
  const project = projectProxyRoute(incoming.pathname)
  const upstreamPath = project?.path ?? (route === null ? undefined : masterUpstreamPath(route[1] ?? '', route[2]))
  const allowed = project?.methods.includes(method)
    ?? (route !== null && shaoshiMasterMethodAllowed(route[1] ?? '', method, route[2] !== undefined))
  if (upstreamPath === undefined || !allowed) {
    res.writeHead(upstreamPath === undefined ? 404 : 405, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  const remote = new URL(`${api}${upstreamPath}`)
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
  const response = await fetch(remote, { method, headers, body, signal, redirect: 'error' })
  const result = new Uint8Array(await response.arrayBuffer())
  res.writeHead(response.status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(result)
}

/** 成员写请求体上限，与后台一致：防止异常超大负载。 */
const ORGANIZATION_WRITE_BODY_LIMIT = 64 * 1024

/**
 * 转发组织架构树、成员列表查询与成员编辑、删除请求到本地后台。
 * 路由决策由 organizationProxyRoute 给出；写请求要求同源 sec-fetch-site。
 */
async function proxyOrganizationRequest(
  req: IncomingMessage,
  res: ServerResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost')
  const forwardHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { authorization, accept: 'application/json' }
    if (activeTenant !== undefined && activeTenant !== '') headers['X-Active-Tenant'] = activeTenant
    return headers
  }
  const respond = async (response: Response): Promise<void> => {
    const result = new Uint8Array(await response.arrayBuffer())
    res.writeHead(response.status, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    })
    res.end(result)
  }
  const decision = organizationProxyRoute(incoming.pathname, req.method ?? 'GET')
  if (decision === undefined) {
    res.writeHead(404, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  if (decision.type === 'method') {
    res.writeHead(405, { allow: decision.allow, 'cache-control': 'no-store' })
    res.end()
    return
  }
  if (decision.type === 'write' && req.headers['sec-fetch-site'] !== 'same-origin') {
    res.writeHead(403, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  const remote = new URL(`${api}${decision.remote}`)
  remote.search = incoming.search
  const headers = forwardHeaders()
  const method = req.method ?? 'GET'
  if (method === 'PUT' || method === 'POST') {
    const body = await requestBody(req)
    if (body === undefined || body.byteLength > ORGANIZATION_WRITE_BODY_LIMIT) {
      res.writeHead(400, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    headers['content-type'] = 'application/json'
    await respond(await fetch(remote, { method, headers, body, signal, redirect: 'error' }))
    return
  }
  await respond(await fetch(remote, { method, headers, signal, redirect: 'error' }))
}

/**
 * 对非工作台会话屏蔽元枢 MCP 工具。
 *
 * 全局 MCP 注册只为登录与 OAuth 账号面板服务：默认对话不应看到或加载这些工具；
 * 工作台会话通过专用 preset 创建，保持工具可用。
 * @param ctx - Workbench plugin context.
 */
function isolateYuanShuTools(ctx: Context): void {
  ctx.inject(['tools', 'agents', 'agentPresets'], (scope) => {
    const masks = new Map<Agent, () => void>()
    const refresh = (): void => {
      for (const [agent, dispose] of masks) {
        if (scope.agentPresets.composedPreset(agent.ctx) === WORKBENCH_AGENT_PRESET) {
          dispose()
          masks.delete(agent)
        }
      }
      for (const agent of scope.agents.list()) {
        if (masks.has(agent) || scope.agentPresets.composedPreset(agent.ctx) === WORKBENCH_AGENT_PRESET) continue
        const key = scopeOf(agent.ctx)
        if (key === undefined) continue
        const deny = scope.tools.definitions(key)
          .map(tool => tool.name)
          .filter(toolName => toolName.startsWith(YUANSHU_TOOL_PREFIX))
        if (deny.length === 0) continue
        try {
          masks.set(agent, agent.ctx.tools.restrict({ deny }))
        } catch (error) {
          scope.logger.warn(`yuanshu: could not hide YuanShu tools from a session: ${String(error)}`)
        }
      }
    }
    scope.on('agent/created', () => { refresh() }, { global: true })
    scope.on('tools/change', refresh, { global: true })
    scope.on('agent/disposed', ({ agent }) => {
      const dispose = masks.get(agent)
      if (dispose === undefined) return
      dispose()
      masks.delete(agent)
    })
    scope.effect(() => () => {
      for (const dispose of masks.values()) dispose()
      masks.clear()
    }, 'yuanshu: MCP tool masks')
    refresh()
  })
}

/**
 * Register the employee connection when the profile enables it.
 * @param ctx - Workbench plugin context.
 * @param config - Employee MCP endpoint and registered OAuth client ID.
 */
export function apply(ctx: Context, config: Config): void {
  let checkCapabilities: ((req: IncomingMessage, res: ServerResponse) => void) | undefined
  const access = config.mcp === false ? undefined : new EmployeeAccessStore(config.mcp.apiUrl.replace(/\/+$/u, ''))
  if (config.mcp !== false) applyDailyReport(ctx, config.data.apiUrl,
    fileURLToPath(new URL('../skills/yuanshu-work-report/SKILL.md', import.meta.url)),
    {
      create: fileURLToPath(new URL('../skills/yuanshu-business-record-create/SKILL.md', import.meta.url)),
      capabilities: fileURLToPath(new URL('../skills/yuanshu-business-capabilities/SKILL.md', import.meta.url)),
    },
    (req, res) => { checkCapabilities?.(req, res) }, access)
  // 本地待办：对话工具写入本机清单，「我的任务」页读取并做桌面提醒。
  ctx.inject(['webServer'], (scope) => {
    registerTodoRoutes(scope, new TodoStore())
    scope.logger.info('yuanshu: local todo routes registered')
    // 个人页配置：按账号落在本机固定目录，浏览器清空数据不丢失。
    registerPersonalPageRoutes(scope, new PersonalPageStore())
    scope.logger.info('yuanshu: personal page routes registered')
    // 个人页数据卡片：按只读数据目录代理后台查询。
    registerDataQueryRoute(scope, config.data.apiUrl.replace(/\/+$/u, ''))
    scope.logger.info('yuanshu: data query routes registered')
    // 技能包：从元枢后台读取清单，支持下载、本机安装与上传。
    registerSkillStoreRoutes(scope, {
      api: config.data.apiUrl.replace(/\/+$/u, ''),
      bundledSkillsRoot: fileURLToPath(new URL('../skills', import.meta.url)),
    })
    scope.logger.info('yuanshu: skill store routes registered')
  })
  ctx.inject(['tools'], (scope) => {
    registerTodoTools(scope, new TodoStore())
    scope.logger.info('yuanshu: local todo tools registered')
  })
  const mcp = config.mcp
  if (mcp === false) return
  ctx.inject(['skills'], (scope) => {
    registerBusinessSkill(scope, {
      name: 'yuanshu-todo',
      description: '从对话整理待办与时间节点，确认后写入本机待办清单，并在「我的任务」页按时间提醒。',
      path: fileURLToPath(new URL('../skills/yuanshu-todo/SKILL.md', import.meta.url)),
      rank: 585,
      guidance: '员工要整理待办、安排接下来要做的事或设置提醒时，先调用 yuanshu_todo_list 查看已有条目，按时间顺序复述清单并请本人确认；确认后逐条调用 yuanshu_todo_add，时间用带 +08:00 偏移的 ISO 8601，没有时间就不传。员工说做完了调用 yuanshu_todo_complete，要求取消调用 yuanshu_todo_remove。',
    })
    registerBusinessSkill(scope, {
      name: 'yuanshu-custom-page-create',
      description: '引导员工确认名称并发布个人动态页面，从我的个人页按名称切换。',
      path: fileURLToPath(new URL('../skills/yuanshu-custom-page-create/SKILL.md', import.meta.url)),
      rank: 580,
      guidance: '收到创建个人页面意图时调用 personal_pages_open_draft，页面内容由 widgets 自由组装：'
        + '固定卡片（工时/人员概览）或 data-query 数据卡（path 来自 yuanshu_api_search 检索的只读接口）。'
        + '请员工在对话弹窗内核对卡片数据、预览及发布。',
    })
    registerBusinessSkill(scope, {
      name: 'yuanshu-api-query',
      description: '按业务问题检索公司只读数据目录，实时查询当前员工有权限查看的业务数据。',
      path: fileURLToPath(new URL('../skills/yuanshu-api-query/SKILL.md', import.meta.url)),
      rank: 575,
      guidance: '员工要查公司业务数据且工作台没有对应固定页面时，先把问题拆成业务对象与筛选条件，调用 yuanshu_api_search 检索目录；'
        + '命中多个时按业务对象与模块选择最接近的一条，必要时向员工确认。再调用 yuanshu_api_query，path 原样使用检索结果，参数只用目录声明的名称，缺少必填条件先询问员工。'
        + '只读查询，不修改、不导出；查不到对应能力时如实说明无法查询，不编造数据。结果被裁剪时告知还有更多数据并请员工补充条件。',
    })
  })
  const dataApi = config.data.apiUrl.replace(/\/+$/u, '')
  let connecting = false
  /** Live explicit-consent authorization: URL handed to the browser, awaiting the callback. */
  let pendingConsent: { url: string } | undefined
  const homeLoader = new PlatformHomeLoader()
  if (access) {
    ctx.effect(() => () => { access.dispose() }, 'yuanshu: dispose employee access')
    ctx.inject(['webServer'], (scope) => { registerEmployeeAccess(scope, access) })
  }
  ctx.inject(['webServer', 'mcpManager'], (scope) => {
    checkCapabilities = registerMcpCapabilities(scope, name, mcp.apiUrl.replace(/\/+$/u, ''))
    scope.effect(() => () => { checkCapabilities = undefined }, 'yuanshu: clear capability callback')
    registerIntegrationStatus(scope, { api: mcp.apiUrl.replace(/\/+$/u, ''), server: name })
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
                : `${status.state}${'reason' in status ? ` (${status.reason})` : ''}${'lastError' in status && status.lastError !== '' ? `: ${status.lastError}` : ''}`
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
            dataApi,
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
          )
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu: identity API')

    // 节假日：宿主侧代理公开数据源并按年缓存，浏览器不直连第三方；
    // 失败时由 loadHolidayYear 回退磁盘缓存或报 502，客户端降级为仅周末=休。
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/yuanshu-workbench/holidays',
      auth: 'required',
      async handler(req, res) {
        const send = (status: number, payload?: object): void => {
          res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json' })
          res.end(payload === undefined ? undefined : JSON.stringify(payload))
        }
        if (req.method !== 'GET') {
          send(405)
          return
        }
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          send(401)
          return
        }
        const year = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('year'))
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
          send(400)
          return
        }
        try {
          send(200, { data: await loadHolidayYear(year, scope.logger) })
        } catch {
          send(502)
        }
      },
    }), 'yuanshu: holiday calendar')

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
            dataApi,
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
          checkCapabilities?.(req, res)
          res.off('close', close)
        }
      },
    }), 'yuanshu: personal workspace API')

    // 权限定义目录：个人资料按后台权限树展示，并标注本人是否已获得该权限。
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: '/yuanshu-workbench/permission-catalog',
      auth: 'required',
      async handler(req, res) {
        if (req.method !== 'GET') {
          res.writeHead(405, { 'cache-control': 'no-store' })
          res.end()
          return
        }
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
          const headers: Record<string, string> = { authorization, accept: 'application/json' }
          const tenant = req.headers['x-active-tenant']
          if (typeof tenant === 'string' && tenant !== '') headers['X-Active-Tenant'] = tenant
          const response = await fetch(`${dataApi}/api/v1/permissions/tree`, {
            headers,
            redirect: 'error',
            signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
          })
          const payload = new Uint8Array(await response.arrayBuffer())
          res.writeHead(response.status, {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            'x-content-type-options': 'nosniff',
          })
          res.end(payload)
        } catch {
          if (!lifetime.signal.aborted && !res.headersSent) {
            res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'YuanShu permission catalog unavailable' }))
          }
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu: permission catalog API')

    for (const [resource, unavailable] of [
      ['customers', 'YuanShu customer API unavailable'],
      ['suppliers', 'YuanShu supplier API unavailable'],
      ['supplier-categories', 'YuanShu supplier categories API unavailable'],
      ['materials', 'YuanShu material API unavailable'],
      ['material-categories', 'YuanShu material categories API unavailable'],
      ['equipments', 'YuanShu equipment API unavailable'],
      ['onboarding-tasks', 'YuanShu onboarding tasks API unavailable'],
      ['contracts', 'YuanShu contract API unavailable'],
      ['meeting-rooms', 'YuanShu meeting room API unavailable'],
      ['meeting-room-bookings', 'YuanShu meeting room booking API unavailable'],
      ['user-positions', 'YuanShu user position API unavailable'],
      ['projects', 'YuanShu project API unavailable'],
      ['weekly-reports', 'YuanShu weekly report API unavailable'],
      ['daily-reports', 'YuanShu daily report API unavailable'],
    ] as const) {
      scope.effect(() => scope.webServer.register({
        kind: 'prefix',
        path: `/yuanshu-workbench/${resource}`,
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
          const startedAt = Date.now()
          try {
            await proxyShaoshiMasterRequest(
              req,
              res,
              dataApi,
              authorization,
              typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
              AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
            )
            scope.logger.info('元枢档案请求', {
              resource, method: req.method, upstream: new URL(dataApi).origin,
              status: res.statusCode, durationMs: Date.now() - startedAt,
            })
          } catch (error) {
            if (!lifetime.signal.aborted && !res.headersSent) {
              scope.logger.warn(unavailable, error instanceof Error ? error.name : 'unknown error')
              res.writeHead(502, {
                'cache-control': 'no-store',
                'content-type': 'application/json',
              })
              res.end(JSON.stringify({ error: unavailable }))
            }
          } finally {
            checkCapabilities?.(req, res)
            res.off('close', close)
          }
        },
      }), `yuanshu: ${resource} API`)
    }
    for (const path of Object.keys(ORGANIZATION_PROXY_ROUTES)) {
      const unavailable = 'YuanShu organization API unavailable'
      scope.effect(() => scope.webServer.register({
        kind: 'exact',
        path,
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
            await proxyOrganizationRequest(
              req,
              res,
              dataApi,
              authorization,
              typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
              AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
            )
          } catch (error) {
            if (!lifetime.signal.aborted && !res.headersSent) {
              scope.logger.warn(unavailable, error instanceof Error ? error.name : 'unknown error')
              res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
              res.end(JSON.stringify({ error: unavailable }))
            }
          } finally {
            checkCapabilities?.(req, res)
            res.off('close', close)
          }
        },
      }), `yuanshu: organization ${path}`)
    }
    // 成员编辑与删除：按 ID 前缀注册，PUT/DELETE 转发到本地后台 /api/v1/users/{id}。
    // 注意路由表匹配规则是 startsWith(`${prefix}/`)，前缀不能带尾部斜杠。
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/yuanshu-workbench/organization/users',
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
          await proxyOrganizationRequest(
            req,
            res,
            dataApi,
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(mcp.requestTimeoutMs)]),
          )
        } catch (error) {
          if (!lifetime.signal.aborted && !res.headersSent) {
            scope.logger.warn('YuanShu organization write API unavailable', error instanceof Error ? error.name : 'unknown error')
            res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'YuanShu organization write API unavailable' }))
          }
        } finally {
          checkCapabilities?.(req, res)
          res.off('close', close)
        }
      },
    }), 'yuanshu: organization user writes')
  })
  ctx.inject(['mcpManager', 'mcpAccounts'], (scope) => {
    scope.mcpManager.register(name, {
      transport: 'streamable-http',
      url: mcp.url,
      toolLoading: 'on-demand',
      startupTimeoutMs: mcp.startupTimeoutMs,
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
      packageName: '@deepseek-ai/dsh-yuanshu-workbench',
      copy,
    }), 'yuanshu: employee account')
  })
  // 元枢 MCP 只对工作台 preset 的会话开放；默认对话在此被屏蔽。
  isolateYuanShuTools(ctx)
}
