import { createHash } from 'node:crypto'
import { credentialKey, type CredentialKey } from '@deepseek-ai/dsh-credentials'
import type { YuanShuMcpGrant } from '@deepseek-ai/dsh-yuanshu-client'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { YuanShuMcp, YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { YuanShuDagInvokeRequest, YuanShuExecuteRequest, YuanShuExecutionRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { AskKnowledgeQuestionRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { GatewayRequestError, allowedMethods, errorBody, errorStatus } from './routes.ts'

export const name = 'yuanshu-gateway'
export const inject = ['webServer', 'credentials']

/** Gateway endpoint and optional server-side credentials. */
export interface Config {
  /** Base URL of the YuanShu API. */
  readonly baseURL: string
  /** Optional default bearer token used only when a request has no authorization header. */
  readonly token?: string
  /** Same-origin path prefix registered by the gateway. */
  readonly prefix?: string
  /** Route enterprise operations through MCP; legacy-http is an explicit rollback choice. */
  readonly enterpriseTransport?: 'mcp' | 'legacy-http'
  /** Registered MCP public client id. */
  readonly mcpClientId?: string
  /** Exact callback URI registered with the platform. */
  readonly mcpRedirectUri?: string
  /** MCP issuer; omission resolves from baseURL at plugin activation. */
  readonly mcpIssuer?: string
  /** Protected MCP resource URL; omission resolves from baseURL at plugin activation. */
  readonly mcpResource?: string
  /** Budget for protocol and OAuth requests. */
  readonly mcpTimeoutMs?: number
}
export const Config: z<Config> = z.object({ baseURL: z.string().required(), token: z.string(), prefix: z.string().default('/yuanshu-api'), enterpriseTransport: z.union(['mcp', 'legacy-http']).default('mcp'), mcpClientId: z.string().default('dsh-yuanshu'), mcpRedirectUri: z.string().default('http://localhost:3000/yuanshu-mcp/callback'), mcpIssuer: z.string(), mcpResource: z.string(), mcpTimeoutMs: z.number().min(1).default(30_000) })

/**
 * Gateway routes exposed on the prefix path.
 *
 * Worker API:
 *   /capabilities           GET  → list all YuanShu capabilities
 *   /tenants                GET  → tenant context (`current` plus `list`)
 *   /user/me                GET  → current YuanShu account profile
 *   /login                  POST → authenticate (sets token on client)
 *   /execute                POST → execute worker (sync)
 *   /execute-stream         POST → execute worker (SSE stream)
 *
 * Capability execution:
 *   /skills/:id/execute         POST → run a published skill (sync)
 *   /skills/:id/executions      POST → submit a skill execution (async)
 *   /algorithms/:id/execute     POST → run a published algorithm (sync)
 *   /algorithms/:id/executions  POST/GET → submit or list algorithm executions
 *   /dag/definitions/:id/invoke POST → invoke a published DAG app
 *   /dag/history                GET  → list DAG runs (optional dag_definition_id)
 *   /dag/history/:id            GET  → read a DAG run detail
 *
 * Knowledge Q&A:
 *   /qa/ask                 POST → ask knowledge question (sync)
 *   /qa/ask/stream          POST → ask knowledge question (SSE stream)
 *   /qa/sessions            GET  → list Q&A sessions
 *   /qa/readiness           GET  → check QA readiness of collections
 *   /knowledges             GET  → list knowledge collections
 *   /knowledges/:id         GET  → get knowledge document by ID
 *
 * Workbench profile & home:
 *   /workbench/profile      GET → role-scoped workbench profile
 *   /workbench/home         GET → aggregated workbench home
 *
 * Workbench catalogs:
 *   /ontology/overview      GET → ontology platform summary
 *   /ontology/spaces        GET → list ontology spaces
 *   /ontology/collections   GET → list ontology collections
 *   /ontology/releases      GET → list ontology releases
 *   /scenarios              GET → list agent definitions (scenarios)
 */
async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const value: unknown = chunk
    if (typeof value !== 'string' && !(value instanceof Uint8Array)) throw new GatewayRequestError('Invalid request body')
    const buffer = Buffer.from(value)
    size += buffer.length
    if (size > 1024 * 1024) throw new GatewayRequestError('request body too large', 413)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

function bindClientAbort(req: IncomingMessage, res: ServerResponse): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abort = (): void => { controller.abort() }
  const onResponseClose = (): void => {
    if (!res.writableEnded) abort()
  }
  req.once('aborted', abort)
  res.once('close', onResponseClose)
  return {
    signal: controller.signal,
    dispose: () => {
      req.off('aborted', abort)
      res.off('close', onResponseClose)
    },
  }
}

/**
 * Parse a query string from the URL into a Record.
 */
function parseQuery(url: string): Record<string, string> {
  const parsed = new URL(url, 'http://localhost')
  const params: Record<string, string> = {}
  parsed.searchParams.forEach((value, key) => { params[key] = value })
  return params
}

/** 读取对象型请求体；缺省视为空对象，其他 JSON 形状直接拒绝。 */
function requireObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new GatewayRequestError('request body must be a JSON object')
  }
  return value as Record<string, unknown>
}

/** 幂等键优先取请求头，其次取请求体，兼容两种客户端实现。 */
function idempotencyKey(record: Record<string, unknown>, header: string | string[] | undefined): string | undefined {
  const fromHeader = typeof header === 'string' && header.length > 0 ? header : undefined
  const fromBody = record.idempotency_key
  if (fromHeader !== undefined) return fromHeader
  if (fromBody === undefined) return undefined
  if (typeof fromBody !== 'string') throw new GatewayRequestError('idempotency_key must be a string')
  return fromBody
}

/** 把网关请求体转换成客户端的异步执行提交参数。 */
function executionRequest(value: unknown, header: string | string[] | undefined): YuanShuExecutionRequest {
  const record = requireObject(value)
  const artifactIds = record.input_artifact_ids
  if (artifactIds !== undefined &&
    (!Array.isArray(artifactIds) || artifactIds.some(id => typeof id !== 'string'))) {
    throw new GatewayRequestError('input_artifact_ids must be an array of strings')
  }
  const key = idempotencyKey(record, header)
  return {
    ...(record.input_data === undefined ? {} : { inputData: record.input_data }),
    ...(artifactIds === undefined ? {} : { inputArtifactIds: artifactIds as string[] }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  }
}

/** 把网关请求体转换成 DAG 调用参数。字段名与元枢契约保持一致。 */
function dagInvokeRequest(value: unknown, header: string | string[] | undefined): YuanShuDagInvokeRequest {
  const record = requireObject(value)
  const conversationId = record.conversation_id
  const conversationVars = record.conversationVars
  const traceId = record.trace_id
  if (conversationId !== undefined && typeof conversationId !== 'string') {
    throw new GatewayRequestError('conversation_id must be a string')
  }
  if (traceId !== undefined && typeof traceId !== 'string') {
    throw new GatewayRequestError('trace_id must be a string')
  }
  if (conversationVars !== undefined && (typeof conversationVars !== 'object' || conversationVars === null || Array.isArray(conversationVars))) {
    throw new GatewayRequestError('conversationVars must be a JSON object')
  }
  const key = idempotencyKey(record, header)
  return {
    ...(record.input === undefined ? {} : { input: record.input }),
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(conversationVars === undefined ? {} : { conversationVars: conversationVars as Record<string, unknown> }),
    ...(traceId === undefined ? {} : { traceId }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  }
}

/** 从路径中取出单个路径参数，并做 URL 解码。 */
function pathParam(path: string, pattern: RegExp): string {
  const matched = pattern.exec(path)
  const raw = matched?.[1]
  if (raw === undefined) throw new GatewayRequestError('invalid route parameter')
  return decodeURIComponent(raw)
}

/** Resolve the YuanShu auth token: request header first, then explicit config. */
function resolveToken(config: Config): string | undefined {
  // 不再回落到 `YUANSHU_TOKEN` 或 `~/.dsh/yuanshu-token`。网关必须让每个
  // 请求以自己的凭据执行；静默使用实例级 token 会把普通用户的调用变成
  // 另一个 principal，且无法在审计里区分真实操作人。
  return config.token
}

export function apply(ctx: Context, config: Config): void {
  const enterpriseMode = config.enterpriseTransport ?? 'mcp'
  const mcpIssuer = config.mcpIssuer ?? config.baseURL.replace(/\/+$/u, '')
  const mcpResource = config.mcpResource ?? `${config.baseURL.replace(/\/+$/u, '')}/api/v1/client/mcp`
  const mcpClientId = config.mcpClientId ?? 'dsh-yuanshu'
  const mcpRedirectUri = config.mcpRedirectUri ?? 'http://localhost:3000/yuanshu-mcp/callback'
  if (enterpriseMode === 'mcp' && config.token !== undefined) throw new GatewayRequestError('MCP user mode forbids instance-level bearer credentials')
  const token = enterpriseMode === 'legacy-http' ? resolveToken(config) : undefined
  const prefix = config.prefix ?? '/yuanshu-api'
  const clients = new Map<CredentialKey, { client: YuanShuMcp; users: number; closing?: Promise<void> }>()
  let disposed = false
  const close = (entry: { client: YuanShuMcp; closing?: Promise<void> }): Promise<void> => entry.closing ??= entry.client.close()
  ctx.effect(() => async () => {
    disposed = true
    const pending = [...clients.values()]
    clients.clear()
    await Promise.all(pending.map(close))
  }, 'yuanshu-gateway: MCP clients')
  const route: WebRoute = { kind: 'prefix', path: prefix, handler: async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname
    // Remove prefix and leading slash
    const relative = pathname.startsWith(prefix)
      ? pathname.slice(prefix.length) || '/'
      : pathname

    const allowed = allowedMethods(relative)
    if (allowed === undefined) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }
    if (!allowed.includes((req.method ?? 'GET').toUpperCase())) {
      res.writeHead(405, { 'Content-Type': 'application/json', Allow: allowed.join(', ') })
      res.end(JSON.stringify({ error: 'method not allowed' }))
      return
    }

    const auth = req.headers.authorization
    const tenant = headerValue(req.headers['x-active-tenant']) ?? headerValue(req.headers['x-tenant-id'])
    const effectiveToken = typeof auth === 'string'
      ? auth.replace(/^Bearer\s+/u, '')
      : token
    const key = credentialKey('yuanshu-gateway', `user-${createHash('sha256').update(JSON.stringify([mcpIssuer, mcpResource, effectiveToken ?? '', tenant ?? ''])).digest('hex')}`)
    const credentials = {
      read: async (): Promise<YuanShuMcpGrant | undefined> => {
        const record = await ctx.credentials.readRecord(key)
        return record?.kind === 'grant' && record.payload !== null ? readGrant(record.payload) : undefined
      },
      write: async (value: YuanShuMcpGrant | undefined): Promise<void> => {
        if (value === undefined) await ctx.credentials.deleteRecord(key)
        else await ctx.credentials.modifyRecord(key, () => Promise.resolve({ kind: 'grant', payload: value }))
      },
      rotate: async (update: (current: YuanShuMcpGrant | undefined) => Promise<YuanShuMcpGrant | undefined>): Promise<void> => {
        await ctx.credentials.modifyRecord(key, async (current) => {
          const value = await update(current?.kind === 'grant' && current.payload !== null ? readGrant(current.payload) : undefined)
          return { kind: 'grant', payload: value ?? null }
        })
      },
    }
    if (disposed) { writeJSON(res, { error: 'Gateway is stopping' }, 503); return }
    let entry = clients.get(key)
    if (entry === undefined) {
      entry = { users: 0, client: new YuanShuMcp({
        resource: mcpResource, issuer: mcpIssuer, clientId: mcpClientId, redirectUri: mcpRedirectUri,
        timeoutMs: config.mcpTimeoutMs ?? 30_000, credentials,
      }) }
      clients.set(key, entry)
    }
    entry.users++
    const mcp = entry.client
    const requestClient = new YuanShuClient({
      ...enterpriseMode === 'mcp' ? { enterprise: mcp } : {},
      baseURL: config.baseURL,
      ...(effectiveToken === undefined ? {} : { token: effectiveToken }),
      ...(tenant === undefined ? {} : { tenantId: tenant }),
    })

    // 元枢要求多租户用户显式选择租户（X-Active-Tenant），而元枢登录页只保存 token。
    // 浏览器未指定租户时，用 token 解析用户的当前租户，避免 admin 这类多租户账号
    // 直接收到 `tenant selection required`。
    try {
      if (tenant === undefined && effectiveToken !== undefined) {
        const resolved = await resolveCurrentTenant(requestClient)
        if (resolved !== undefined) requestClient.setAuth(effectiveToken, resolved)
      }

      if (relative === '/mcp/config') {
        writeJSON(res, {
          enterpriseTransport: enterpriseMode, resource: mcpResource, issuer: mcpIssuer, clientId: mcpClientId,
          redirectUri: mcpRedirectUri, timeoutMs: config.mcpTimeoutMs ?? 30_000,
        }); return
      }
      if (relative === '/mcp/authorize') {
        const input = requireObject(await body(req))
        if (effectiveToken === undefined || tenant === undefined || input.consent !== 'approve' || (input.scope !== 'enterprise:read' && input.scope !== 'enterprise:read enterprise:execute')) throw new GatewayRequestError('Current login, explicit tenant and consent required', 401)
        await mcp.authorize(effectiveToken, tenant, input.scope)
        writeJSON(res, { authorized: true }); return
      }
      if (relative === '/mcp/status') { writeJSON(res, { authorized: await credentials.read() !== undefined }); return }
      if (relative === '/mcp/revoke') { await mcp.revoke(); writeJSON(res, { authorized: false }); return }
      if (relative === '/mcp/workbench') {
        const result = await mcp.call('workbench_describe', {})
        const envelope = result.structuredContent
        if (result.isError || envelope === null || typeof envelope !== 'object' || !('data' in envelope)) throw new GatewayRequestError('Workbench descriptor unavailable', 503)
        writeJSON(res, envelope.data); return
      }
      if (relative === '/mcp/read') {
        const query = parseQuery(url.toString())
        if (query.name === undefined || query.arguments === undefined) throw new GatewayRequestError('Read tool and arguments required')
        const tool = (await mcp.tools()).find(item => item.name === query.name)
        if (tool?.annotations?.readOnlyHint !== true) throw new GatewayRequestError('Only declared read tools may be used as resources')
        writeJSON(res, await mcp.call(query.name, requireObject(JSON.parse(query.arguments)))); return
      }
      if (relative === '/mcp/tools') { writeJSON(res, await mcp.tools()); return }
      if (relative === '/mcp/call') {
        const input = requireObject(await body(req))
        if (typeof input.name !== 'string') throw new GatewayRequestError('Tool name required')
        const continuation: { requestState?: string; inputResponses?: Record<string, { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, string | number | boolean | string[]> }> } = {}
        if (input.requestState !== undefined) {
          if (typeof input.requestState !== 'string') throw new GatewayRequestError('Invalid continuation state')
          continuation.requestState = input.requestState
        }
        if (input.inputResponses !== undefined) {
          const responses = requireObject(input.inputResponses)
          continuation.inputResponses = {}
          for (const [id, raw] of Object.entries(responses)) {
            const response = requireObject(raw)
            if (response.action !== 'accept' && response.action !== 'decline' && response.action !== 'cancel') throw new GatewayRequestError('Invalid user input action')
            const content: Record<string, string | number | boolean | string[]> = {}
            if (response.content !== undefined) for (const [key, value] of Object.entries(requireObject(response.content))) {
              if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || (Array.isArray(value) && value.every(item => typeof item === 'string'))) content[key] = value
              else throw new GatewayRequestError('Supplemental input must contain primitive values')
            }
            continuation.inputResponses[id] = { action: response.action, content }
          }
        }
        const result = await mcp.callWithInput(input.name, requireObject(input.arguments), continuation)
        writeJSON(res, result); return
      }
      if (relative === '/mcp/resource') {
        const uri = parseQuery(url.toString()).uri
        if (uri === undefined) throw new GatewayRequestError('Resource URI required')
        writeJSON(res, await mcp.resource(uri)); return
      }
      // ── Worker API ────────────────────────────────────────────────────

      if (relative === '/capabilities') {
        writeJSON(res, await requestClient.listClientCapabilities())
        return
      }

      if (relative === '/tenants') {
        writeJSON(res, await requestClient.getTenantContext())
        return
      }

      if (relative === '/user/me') {
        writeJSON(res, await requestClient.getCurrentUser())
        return
      }

      if (relative === '/login') {
        const input = await body(req)
        const record = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
        writeJSON(res, await requestClient.login(
          typeof record.username === 'string' ? record.username : '',
          typeof record.password === 'string' ? record.password : '',
        ))
        return
      }

      if (relative === '/execute') {
        const executeRequest = (await body(req)) as YuanShuExecuteRequest
        writeJSON(res, await requestClient.executeWorker(executeRequest))
        return
      }

      if (relative === '/execute-stream') {
        const executeRequest = (await body(req)) as YuanShuExecuteRequest
        const clientAbort = bindClientAbort(req, res)
        const stream = requestClient.executeWorkerStream(executeRequest, clientAbort.signal)
        try {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          for await (const event of stream) {
            res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
          }
          res.end()
        } finally {
          clientAbort.dispose()
        }
        return
      }

      // ── Knowledge Q&A ─────────────────────────────────────────────────

      if (relative === '/qa/ask') {
        const bodyData = await body(req)
        const askRequest = bodyData as AskKnowledgeQuestionRequest
        writeJSON(res, await requestClient.askQuestion(askRequest))
        return
      }

      if (relative === '/qa/ask/stream') {
        const bodyData = await body(req)
        const askRequest = bodyData as AskKnowledgeQuestionRequest
        const clientAbort = bindClientAbort(req, res)
        const stream = requestClient.askQuestionStream(askRequest, clientAbort.signal)
        try {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          for await (const event of stream) {
            res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
          }
          res.end()
        } finally {
          clientAbort.dispose()
        }
        return
      }

      if (relative === '/qa/sessions') {
        const query = parseQuery(url.toString())
        const limit = query.limit ? parseInt(query.limit, 10) : undefined
        writeJSON(res, await requestClient.listQASessions(limit))
        return
      }

      if (relative === '/qa/readiness') {
        const query = parseQuery(url.toString())
        const collectionIds = query.collection_ids
          ? query.collection_ids.split(',').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n))
          : undefined
        writeJSON(res, await requestClient.getQAReadiness(collectionIds))
        return
      }

      if (relative === '/knowledges') {
        const query = parseQuery(url.toString())
        const keyword = query.keyword
        const limit = query.limit ? parseInt(query.limit, 10) : undefined
        writeJSON(res, await requestClient.listKnowledgeCollections(keyword, limit))
        return
      }

      // /knowledges/:id
      if (relative.startsWith('/knowledges/') && relative.split('/').length === 3) {
        const idStr = relative.split('/')[2]
        if (idStr === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid knowledge document id' }))
          return
        }
        const id = parseInt(idStr, 10)
        if (Number.isNaN(id) || id <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid knowledge document id' }))
          return
        }
        writeJSON(res, await requestClient.getKnowledgeDocument(id))
        return
      }

      // ── Workbench profile & home ──────────────────────────────────────
      //
      // 岗位、角色、数据范围和区块顺序都由元枢计算。网关只做透传，
      // 不缓存、不按角色改写，保证 DSH 与 Web 控制台读同一份投影。

      if (relative === '/workbench/profile') {
        writeJSON(res, await requestClient.getWorkbenchProfile())
        return
      }

      if (relative === '/workbench/home') {
        writeJSON(res, await requestClient.getWorkbenchHome())
        return
      }

      const workbenchPosition = parseQuery(url.toString()).position

      if (relative === '/workbench/position') {
        writeJSON(res, await requestClient.getWorkbenchPosition(workbenchPosition))
        return
      }

      if (relative === '/workbench/positions') {
        writeJSON(res, await requestClient.getWorkbenchPositions())
        return
      }

      if (relative === '/workbench/briefing') {
        writeJSON(res, await requestClient.getWorkbenchBriefing(workbenchPosition))
        return
      }

      if (relative === '/workbench/decision-queue') {
        writeJSON(res, await requestClient.getWorkbenchDecisionQueue(workbenchPosition))
        return
      }

      if (relative === '/workbench/navigator') {
        writeJSON(res, await requestClient.getWorkbenchNavigator())
        return
      }

      if (relative === '/workbench/records') {
        const query = parseQuery(url.toString())
        const domain = query.domain ?? ''
        if (domain === '') throw new GatewayRequestError('domain is required')
        const page = query.page ? parseInt(query.page, 10) : undefined
        const pageSize = query.page_size ? parseInt(query.page_size, 10) : undefined
        writeJSON(res, await requestClient.listWorkbenchRecords(domain, {
          ...(page === undefined || Number.isNaN(page) ? {} : { page }),
          ...(pageSize === undefined || Number.isNaN(pageSize) ? {} : { pageSize }),
          ...(query.keyword ? { keyword: query.keyword } : {}),
          ...(query.status ? { status: query.status } : {}),
        }))
        return
      }

      // ── Workbench catalogs ────────────────────────────────────────────
      //
      // 只读目录。可见性完全由元枢裁决：网关不改写 401/403/404，工作台
      // 据此区分“登录失效 / 无权限 / 不可见”。

      if (relative === '/ontology/overview') {
        writeJSON(res, await requestClient.getOntologyOverview())
        return
      }

      if (relative === '/ontology/spaces' || relative === '/ontology/collections' || relative === '/ontology/releases') {
        const query = parseQuery(url.toString())
        const limit = query.page_size ? parseInt(query.page_size, 10) : undefined
        const pageSize = limit === undefined || Number.isNaN(limit) ? undefined : limit
        const value = relative === '/ontology/spaces'
          ? await requestClient.listOntologySpaces(pageSize)
          : relative === '/ontology/collections'
            ? await requestClient.listOntologyCollections(pageSize)
            : await requestClient.listOntologyReleases(pageSize)
        writeJSON(res, value)
        return
      }

      if (relative === '/scenarios') {
        const query = parseQuery(url.toString())
        const limit = query.page_size ? parseInt(query.page_size, 10) : undefined
        writeJSON(res, await requestClient.listScenarios(
          limit === undefined || Number.isNaN(limit) ? undefined : limit,
        ))
        return
      }

      // ── Capability Execution ──────────────────────────────────────────
      //
      // 这里只做 HTTP 到 SDK 的适配：能力是否发布、当前用户是否授权、参数
      // 是否符合 schema 全部由元枢裁决。客户端收到 404 即为“不存在或不可见”。

      if (relative.endsWith('/execute') && relative.startsWith('/skills/')) {
        const id = pathParam(relative, /^\/skills\/([^/]+)\/execute$/u)
        const record = requireObject(await body(req))
        writeJSON(res, config.enterpriseTransport === 'legacy-http'
          ? await requestClient.submitClientExecution('skills', id, executionRequest(record, req.headers['idempotency-key']))
          : await requestClient.submitSkillExecution(id, executionRequest(record, req.headers['idempotency-key'])))
        return
      }

      if (relative.endsWith('/executions') && relative.startsWith('/skills/')) {
        const id = pathParam(relative, /^\/skills\/([^/]+)\/executions$/u)
        const input = await body(req)
        const execution = executionRequest(input, req.headers['idempotency-key'])
        writeJSON(res, config.enterpriseTransport === 'legacy-http'
          ? await requestClient.submitClientExecution('skills', id, execution)
          : await requestClient.submitSkillExecution(id, execution))
        return
      }

      if (relative.endsWith('/execute') && relative.startsWith('/algorithms/')) {
        const id = pathParam(relative, /^\/algorithms\/([^/]+)\/execute$/u)
        const record = requireObject(await body(req))
        writeJSON(res, config.enterpriseTransport === 'legacy-http'
          ? await requestClient.submitClientExecution('algorithms', id, executionRequest(record, req.headers['idempotency-key']))
          : await requestClient.submitAlgorithmExecution(id, executionRequest(record, req.headers['idempotency-key'])))
        return
      }

      if (relative.endsWith('/executions') && relative.startsWith('/algorithms/')) {
        const id = pathParam(relative, /^\/algorithms\/([^/]+)\/executions$/u)
        if (req.method === 'GET') {
          const query = parseQuery(url.toString())
          const limit = query.page_size ? parseInt(query.page_size, 10) : undefined
          writeJSON(res, await requestClient.listClientAlgorithmExecutions(
            id, limit === undefined || Number.isNaN(limit) ? undefined : limit,
          ))
          return
        }
        const input = await body(req)
        const execution = executionRequest(input, req.headers['idempotency-key'])
        writeJSON(res, config.enterpriseTransport === 'legacy-http'
          ? await requestClient.submitClientExecution('algorithms', id, execution)
          : await requestClient.submitAlgorithmExecution(id, execution))
        return
      }

      if (relative.startsWith('/dag/definitions/') && relative.endsWith('/invoke')) {
        const id = pathParam(relative, /^\/dag\/definitions\/([^/]+)\/invoke$/u)
        const input = await body(req)
        const invoke = dagInvokeRequest(input, req.headers['idempotency-key'])
        writeJSON(res, await requestClient.invokeClientDag(id, invoke))
        return
      }

      const execution = /^\/executions\/([^/]+)(\/cancel)?$/u.exec(relative)
      if (execution !== null) {
        const id = decodeURIComponent(String(execution[1]))
        if (execution[2] === undefined) writeJSON(res, await requestClient.getExecution(id))
        else {
          const record = requireObject(await body(req))
          const key = idempotencyKey(record, req.headers['idempotency-key'])
          if (key === undefined || key.trim() === '') throw new GatewayRequestError('idempotency_key required')
          writeJSON(res, await requestClient.cancelExecution(id, key))
        }
        return
      }

      if (relative === '/dag/history') {
        const query = parseQuery(url.toString())
        const limit = query.page_size ? parseInt(query.page_size, 10) : undefined
        const definitionId = query.dag_definition_id
        writeJSON(res, await requestClient.listClientDagHistory(
          limit === undefined || Number.isNaN(limit) ? undefined : limit,
          definitionId === undefined || definitionId.length === 0 ? undefined : definitionId,
        ))
        return
      }

      if (relative.startsWith('/dag/history/')) {
        const id = pathParam(relative, /^\/dag\/history\/([^/]+)$/u)
        writeJSON(res, await requestClient.getClientDagHistoryDetail(id))
        return
      }

      // Fallback: 404
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      writeJSON(res, errorBody(error), errorStatus(error))
    } finally {
      entry.users--
      if (entry.users === 0) {
        if (clients.get(key) === entry) clients.delete(key)
        await close(entry)
      }
    }
  } }
  ctx.effect(() => ctx.webServer.register(route), 'yuanshu-gateway: route')
}

function writeJSON(res: ServerResponse, value: unknown, status = 200): void {
  const output = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(output)
}

function headerValue(value: string | readonly string[] | undefined): string | undefined {
  const raw: unknown = Array.isArray(value) ? value[0] : value
  const trimmed = typeof raw === 'string' ? raw.trim() : undefined
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined
}

/** 用 token 解析用户当前租户；失败时返回 undefined，让元枢自行返回租户错误。 */
async function resolveCurrentTenant(client: YuanShuClient): Promise<string | undefined> {
  try {
    const tenants = await client.listTenants()
    const current = tenants.find(item => item.current === true) ?? tenants[0]
    const value = current?.code ?? current?.id
    if (typeof value !== 'string' && typeof value !== 'number') return undefined
    return String(value)
  } catch {
    return undefined
  }
}

/** Validate a stored OAuth grant before it can reach a remote request. */
function readGrant(value: unknown): YuanShuMcpGrant {
  const record = requireObject(value)
  if (typeof record.accessToken !== 'string' || typeof record.refreshToken !== 'string' || typeof record.expiresAt !== 'number' || typeof record.issuer !== 'string' || typeof record.resource !== 'string' || typeof record.clientId !== 'string') throw new GatewayRequestError('Stored MCP grant is invalid; authorize again', 401)
  return {
    accessToken: record.accessToken, refreshToken: record.refreshToken, expiresAt: record.expiresAt,
    issuer: record.issuer, resource: record.resource, clientId: record.clientId,
  }
}
