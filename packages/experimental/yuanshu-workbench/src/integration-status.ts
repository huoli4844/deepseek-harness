/** 元枢后台接入状态：MCP 服务目录、Swagger 接口数量与消息中间件占位。 */
import type { Context } from '@deepseek-ai/cordis'
import type { McpManagedServerStatus, McpManagedServerView } from '@deepseek-ai/dsh-mcp-manager'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** 单次检测结果，checkedAt 为空表示尚未检测过。 */
export interface IntegrationSnapshot {
  readonly knowledge: {
    readonly connected: boolean
    /** MCP 运行时状态：connected / connecting / waiting-authorization / failed 等。 */
    readonly state: string
    readonly tools: number | null
    readonly checkedAt: string | null
    /** 未连通时用于定位的错误码，已连通为 null。 */
    readonly errorCode: string | null
    /** 未连通时的错误详情，可能包含上游脱敏文本。 */
    readonly error: string | null
  }
  readonly api: {
    readonly connected: boolean
    readonly paths: number | null
    readonly operations: number | null
    readonly checkedAt: string | null
    readonly errorCode: string | null
    readonly error: string | null
  }
  readonly message: { readonly connected: boolean }
}

const STATUS_PATH = '/yuanshu-workbench/integration-status'
const TEST_PATH = '/yuanshu-workbench/integration-status/test'
/** 成功快照五分钟内复用：定时同步与弹窗读取都不会更频繁地访问后台。 */
const freshnessMs = 300_000
/** 失败后十五秒即可重试，避免一次瞬时失败把卡片锁红五分钟。 */
const retryMs = 15_000
/** 目录刷新失败且连接自称可用时的重连冷却。 */
const restartCooldownMs = 30_000
/** 错误详情上限：只保留可定位的首段文本，避免把整段上游报错塞进弹窗。 */
const detailLimit = 300
/** Swagger 文档可能较大，单独放宽等待时间。 */
const swaggerTimeoutMs = 20_000
/** 请求体上限：只接受一个 target 字段。 */
const bodyLimit = 8_192
/** Swagger 文档中的 HTTP 方法键，用于统计操作数量。 */
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'])
/** 这些码表示连接代或传输已失效：即使状态自称 connected，也需要重置连接。 */
const restartCodes = new Set(['MCP_SERVER_UNAVAILABLE', 'MCP_CONNECTION_CLOSED', 'MCP_CATALOG'])

/** 等待授权的原因到错误码的映射。 */
const authorizationCodes = {
  missing: 'MCP_AUTH_REQUIRED',
  expired: 'MCP_AUTH_EXPIRED',
  binding: 'MCP_AUTH_BINDING',
  rejected: 'MCP_AUTH_REJECTED',
  scope: 'MCP_AUTH_SCOPE',
} as const

/** 连接主管停止重连的原因到错误码的映射。 */
const failureCodes = {
  'gave-up': 'MCP_GAVE_UP',
  'reconnect-disabled': 'MCP_RECONNECT_DISABLED',
  'unclosed-generation': 'MCP_UNCLOSED',
  load: 'MCP_LOAD',
  cleanup: 'MCP_CLEANUP',
} as const

/** 由 MCP 运行时状态派生的实时视图。 */
interface LiveKnowledge {
  readonly state: string
  readonly toolCount: number | null
  readonly errorCode: string | null
  readonly error: string | null
}

interface KnowledgeState {
  readonly ok: boolean
  readonly tools: number | null
  readonly checkedAt: number
  readonly errorCode?: string
  readonly error?: string
}

interface ApiState {
  readonly ok: boolean
  readonly paths: number | null
  readonly operations: number | null
  readonly checkedAt: number
  readonly errorCode?: string
  readonly error?: string
}

/** 截断错误文本，只保留可展示的一段。 */
function describeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.length > detailLimit ? `${text.slice(0, detailLimit)}…` : text
}

/** 优先取结构化错误的 code，没有则归为目录刷新失败。 */
function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code: unknown = Reflect.get(error, 'code')
    if (typeof code === 'string' && code !== '') return code
  }
  return 'MCP_CATALOG'
}

/** 读取本 MCP 服务的实时状态并派生错误码，供快照与自愈判断共用。 */
function liveKnowledge(scope: Context, server: string): LiveKnowledge {
  const view: McpManagedServerView | undefined = scope.mcpManager.list().find(item => item.name === server)
  const status: McpManagedServerStatus | undefined = view?.status
  if (status === undefined) {
    return { state: 'missing', toolCount: null, errorCode: 'MCP_UNAVAILABLE', error: 'MCP 服务未注册' }
  }
  const attemptError = view?.authorization?.phase === 'failed' ? view.authorization.lastError : undefined
  switch (status.state) {
    case 'connected':
      return { state: status.state, toolCount: status.toolCount, errorCode: null, error: null }
    case 'connecting':
      return { state: status.state, toolCount: null, errorCode: 'MCP_CONNECTING', error: null }
    case 'reconnecting':
      return { state: status.state, toolCount: null, errorCode: 'MCP_RECONNECTING', error: status.lastError }
    case 'waiting-credentials':
      return { state: status.state, toolCount: null, errorCode: 'MCP_CREDENTIALS', error: status.lastError }
    case 'waiting-authorization':
      return {
        state: status.state,
        toolCount: null,
        errorCode: authorizationCodes[status.reason],
        error: status.lastError === '' ? attemptError ?? null : status.lastError,
      }
    case 'closed':
      return { state: status.state, toolCount: null, errorCode: 'MCP_CLOSED', error: status.result.cleanupError ?? null }
    case 'disabled':
      return { state: status.state, toolCount: null, errorCode: 'MCP_DISABLED', error: null }
    case 'failed':
      return {
        state: status.state,
        toolCount: null,
        errorCode: failureCodes[status.reason],
        error: status.reason === 'cleanup'
          ? status.result.cleanupError ?? null
          : status.lastError === '' || status.lastError === undefined ? attemptError ?? null : status.lastError,
      }
  }
}

async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false }) as AsyncIterableIterator<string | Uint8Array>) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > bodyLimit) return undefined
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

/**
 * 注册接入状态读取与测试路由。
 * @param scope - 具备 webServer 与 mcpManager 的宿主上下文。
 * @param options.api - 元枢后台地址，Swagger 文档位于其 /swagger/doc.json。
 * @param options.server - 工作台使用的 MCP 服务名。
 */
export function registerIntegrationStatus(scope: Context, options: {
  readonly api: string
  readonly server: string
}): void {
  let knowledge: KnowledgeState | undefined
  let api: ApiState | undefined
  let lastRestartAt = 0

  const snapshot = (): IntegrationSnapshot => {
    const live = liveKnowledge(scope, options.server)
    const failed = knowledge !== undefined && !knowledge.ok
    const connected = live.state === 'connected' && !failed
    return {
      knowledge: {
        connected,
        state: live.state,
        tools: knowledge?.ok === true ? knowledge.tools : connected ? live.toolCount : null,
        checkedAt: knowledge === undefined ? null : new Date(knowledge.checkedAt).toISOString(),
        errorCode: failed ? knowledge?.errorCode ?? 'MCP_CATALOG' : connected ? null : live.errorCode,
        error: failed ? knowledge?.error ?? null : connected ? null : live.error,
      },
      api: {
        connected: api?.ok === true,
        paths: api?.paths ?? null,
        operations: api?.operations ?? null,
        checkedAt: api === undefined ? null : new Date(api.checkedAt).toISOString(),
        errorCode: api === undefined || api.ok ? null : api.errorCode ?? 'API_UNAVAILABLE',
        error: api === undefined || api.ok ? null : api.error ?? null,
      },
      message: { connected: false },
    }
  }

  /** 状态自称已连接但目录不可用时重置连接代，让下一次检测拿到可用传输。 */
  const restartKnowledge = async (): Promise<void> => {
    const now = Date.now()
    if (now - lastRestartAt < restartCooldownMs) return
    lastRestartAt = now
    try {
      await scope.mcpManager.restart(options.server)
      scope.logger.info('元枢 MCP 连接已重置：目录刷新失败但状态自称已连接')
    } catch (error) {
      scope.logger.warn('元枢 MCP 连接重置失败：%s', describeError(error))
    }
  }

  const testKnowledge = async (): Promise<void> => {
    const at = Date.now()
    try {
      const toolNames = await scope.mcpManager.refreshCatalog(options.server)
      knowledge = { ok: true, tools: toolNames.length, checkedAt: at }
      scope.logger.info('元枢 MCP 服务目录已更新，共 %s 个工具', toolNames.length)
    } catch (error) {
      const code = errorCodeOf(error)
      const detail = describeError(error)
      knowledge = { ok: false, tools: null, checkedAt: at, errorCode: code, error: detail }
      scope.logger.warn('元枢 MCP 服务目录刷新失败（%s）：%s', code, detail)
      if (restartCodes.has(code) && liveKnowledge(scope, options.server).state === 'connected') {
        await restartKnowledge()
      }
    }
  }

  const testApi = async (): Promise<void> => {
    const at = Date.now()
    try {
      const response = await fetch(`${options.api}/swagger/doc.json`, { signal: AbortSignal.timeout(swaggerTimeoutMs) })
      if (!response.ok) {
        api = {
          ok: false, paths: null, operations: null, checkedAt: at,
          errorCode: `HTTP_${String(response.status)}`, error: `swagger ${String(response.status)}`,
        }
        return
      }
      let doc: { paths?: Record<string, Record<string, unknown>> }
      try {
        doc = await response.json() as { paths?: Record<string, Record<string, unknown>> }
      } catch (error) {
        api = { ok: false, paths: null, operations: null, checkedAt: at, errorCode: 'PARSE', error: describeError(error) }
        return
      }
      const paths = Object.entries(doc.paths ?? {})
      const operations = paths.reduce((total, [, item]) =>
        total + Object.keys(item).filter(key => httpMethods.has(key.toLowerCase())).length, 0)
      api = { ok: true, paths: paths.length, operations, checkedAt: at }
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
      api = {
        ok: false, paths: null, operations: null, checkedAt: at,
        errorCode: timedOut ? 'TIMEOUT' : 'NETWORK', error: describeError(error),
      }
    }
  }

  /** 成功结果按五分钟复用，失败结果十五秒后即可重试。 */
  const stale = (at: number | undefined, ok: boolean | undefined): boolean =>
    at === undefined || Date.now() - at >= (ok === false ? retryMs : freshnessMs)

  /** 读取前补齐过期快照：仅当连接实时可用时才刷新目录，Swagger 过期即重新拉取。 */
  const ensureFresh = async (): Promise<void> => {
    const pending: Promise<void>[] = []
    if (liveKnowledge(scope, options.server).state === 'connected' && stale(knowledge?.checkedAt, knowledge?.ok)) {
      pending.push(testKnowledge())
    }
    if (stale(api?.checkedAt, api?.ok)) pending.push(testApi())
    await Promise.all(pending)
  }

  const send = (res: ServerResponse, status: number, payload?: object): void => {
    res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end(payload === undefined ? undefined : JSON.stringify(payload))
  }

  scope.effect(() => scope.webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    auth: 'required',
    async handler(req, res) {
      if (req.method !== 'GET') {
        send(res, 405)
        return
      }
      await ensureFresh()
      send(res, 200, snapshot())
    },
  }), 'yuanshu: integration status')

  scope.effect(() => scope.webServer.register({
    kind: 'exact',
    path: TEST_PATH,
    auth: 'required',
    async handler(req, res) {
      if (req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin') {
        send(res, req.method !== 'POST' ? 405 : 403)
        return
      }
      const body = await readBody(req)
      if (body === undefined) {
        send(res, 413)
        return
      }
      let target: unknown
      try {
        target = (JSON.parse(body) as { target?: unknown }).target
      } catch {
        send(res, 400, { error: 'invalid json' })
        return
      }
      if (target !== 'knowledge' && target !== 'api') {
        send(res, 400, { error: 'invalid target' })
        return
      }
      if (target === 'knowledge') await testKnowledge()
      else await testApi()
      send(res, 200, snapshot())
    },
  }), 'yuanshu: integration status test')
}
