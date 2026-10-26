/** Options for connecting to a YuanShu API endpoint. */
export interface YuanShuClientConfig {
  readonly baseURL: string
  readonly token?: string
  readonly tenantId?: string
  readonly fetch?: typeof globalThis.fetch
}

/** Standard success envelope returned by YuanShu endpoints. */
export interface YuanShuResponse<T> {
  readonly code: number
  readonly message?: string
  readonly data: T
}

/** A tenant available to the authenticated YuanShu user. */
export interface YuanShuTenant {
  readonly id: string | number
  readonly name?: string
  readonly [key: string]: unknown
}

/** A discovered YuanShu worker capability. */
export interface YuanShuCapability {
  readonly kind: 'agent' | 'skill' | 'algorithm' | 'dag' | 'worker'
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly raw?: unknown
}

/** 元枢列表接口的分页数据结构。
 *
 * 元枢后端统一使用 `{ list, total, page, page_size }` 作为分页载荷，
 * 但早期开发环境和部分兼容网关仍可能直接返回数组。客户端保留两种
 * 形状的兼容解析，避免把“接口契约变化”误判为“没有任何能力”。
 */
interface YuanShuPagePayload {
  readonly list: readonly unknown[]
  readonly total?: number
  readonly page?: number
  readonly pageSize?: number
}

/** Input accepted by the YuanShu worker execution endpoints. */
export interface YuanShuExecuteRequest {
  readonly task: string
  readonly worker_type: string
  readonly session_id?: string
  readonly model_name?: string
  readonly priority?: string
}

/** One decoded server-sent event from a YuanShu stream. */
export interface YuanShuSseEvent {
  readonly event: string
  readonly data: unknown
}

// ── Knowledge Q&A types ──────────────────────────────────────────────────────

/** A knowledge collection returned by YuanShu. */
export interface KnowledgeCollection {
  readonly id: number
  readonly name: string
  readonly primary_tag?: string
  readonly status?: number
  readonly document_count?: number
}

/** A saved knowledge Q&A session. */
export interface KnowledgeQASession {
  readonly session_id: string
  readonly question: string
  readonly user_id: number
  readonly created_at: string
  readonly updated_at: string
  readonly last_turn_id?: string
}

/** One question and answer turn in a knowledge Q&A session. */
export interface KnowledgeQATurn {
  readonly turn_id: string
  readonly session_id: string
  readonly question: string
  readonly answer?: string
  readonly status?: string
  readonly created_at: string
}

/** A source citation attached to a knowledge answer. */
export interface KnowledgeCitation {
  readonly evidence_id: string
  readonly document_id: string
  readonly node_id?: string
  readonly title?: string
  readonly content_preview?: string
  readonly relevance_score?: number
  readonly collection_id?: number
}

/** Input for a knowledge-base question. */
export interface AskKnowledgeQuestionRequest {
  readonly question: string
  readonly session_id?: string
  readonly collection_ids?: number[]
  readonly application_id?: number
  readonly primary_tag?: string
  readonly limit?: number
  readonly thinking_mode?: 'none' | 'light' | 'medium' | 'heavy' | 'ultra'
}

/** Answer, source citations, and execution metadata returned for a question. */
export interface AskKnowledgeQuestionResponse {
  readonly session_id: string
  readonly turn_id: string
  readonly trace_id: string
  readonly execution_trace_id: string
  readonly answer_trace_id: string
  readonly agent_definition_id?: number
  readonly agent_execution_id?: number
  readonly application_id?: number
  readonly application_manifest_hash?: string
  readonly agent_name: string
  readonly agent_mode: string
  readonly answer: string
  readonly answer_mode: string
  readonly answer_artifact_id?: string
  readonly answer_key?: string
  readonly knowledge_release_id?: string
  readonly semantic_key?: string
  readonly answer_artifact_reused: boolean
  readonly synthesis_error?: string
  readonly decision_id?: number
  readonly decision_lineage_id?: number
  readonly citations: KnowledgeCitation[]
  readonly citation_validation?: string
  readonly system_facts?: Record<string, unknown>
  readonly action?: string
  readonly diagnostics?: Record<string, unknown>
  readonly retrieval_trace?: {
    readonly trace_id: string
    readonly query: string
    readonly result_count: number
    readonly duration_ms: number
    readonly retrieval_mode: string
    readonly fallback_terms?: string[]
    readonly vector_error?: string
  }
  readonly evidence_sufficiency?: string
  readonly fallback_terms?: string[]
  readonly retrieval_error?: string
  readonly rewrite?: {
    readonly queries: string[]
    readonly model_name?: string
    readonly error?: string
    readonly claims?: string[]
    readonly claim_coverage?: string
    readonly supplemental_queries?: string[]
    readonly supplemental_rounds?: number
    readonly supplemental_stop_reason?: string
    readonly evidence_sufficiency?: string
  }
  readonly route?: {
    readonly route: string
    readonly confidence?: number
    readonly reason?: string
  }
  readonly created_at: string
}

/** Indexing and retrieval readiness of the requested knowledge collections. */
export interface QAReadinessResponse {
  readonly collections: Array<{
    readonly collection_id: number
    readonly collection_name: string
    readonly primary_tag: string
    readonly status: string
    readonly indexed: boolean
    readonly document_count: number
    readonly vector_count: number
    readonly readiness: 'ready' | 'partial' | 'unready'
    readonly issues?: string[]
  }>
  readonly overall_readiness: 'ready' | 'partial' | 'unready'
  readonly missing_collections?: number[]
  readonly total_collections: number
  readonly indexed_collections: number
}

/** Metadata for a document in a knowledge collection. */
export interface KnowledgeDocument {
  readonly id: number
  readonly name: string
  readonly collection_id: number
  readonly file_type?: string
  readonly file_size?: number
  readonly status?: number
  readonly created_at: string
  readonly updated_at: string
}

/** HTTP or API-level failure returned by a YuanShu request. */
export class YuanShuError extends Error {
  /** HTTP status associated with the failure. */
  readonly status: number
  /** YuanShu application error code, when the response includes one. */
  readonly code: number | string | undefined

  /** @param message - Failure detail. @param status - HTTP response status. @param code - Optional YuanShu application error code. */
  constructor(message: string, status: number, code?: number | string) {
    super(message)
    this.name = 'YuanShuError'
    this.status = status
    this.code = code
  }
}

function joinURL(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`
}

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown
  try { payload = JSON.parse(text) } catch { payload = undefined }
  if (!response.ok) throw new YuanShuError(text || response.statusText, response.status)
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return payload as T
  const wrapped = payload as YuanShuResponse<T>
  if (wrapped.code !== 0 && wrapped.code !== 200) {
    throw new YuanShuError(wrapped.message ?? 'YuanShu request failed', response.status, wrapped.code)
  }
  return wrapped.data
}

/** Sends authenticated HTTP requests to YuanShu and decodes JSON or SSE responses. */
export class YuanShuClient {
  private readonly baseURL: string
  private readonly fetcher: typeof globalThis.fetch
  private token: string | undefined
  private tenantId: string | undefined

  /** @param config - Endpoint, credentials, tenant, and optional fetch implementation. */
  constructor(config: YuanShuClientConfig) {
    this.baseURL = config.baseURL
    this.fetcher = config.fetch ?? globalThis.fetch
    this.token = config.token
    this.tenantId = config.tenantId
  }

  /** Replace the credentials and tenant used by subsequent requests.
   * @param token - Bearer token, or undefined to omit authentication.
   * @param tenantId - Tenant identifier, or undefined to omit tenant selection.
   */
  setAuth(token?: string, tenantId?: string): void {
    this.token = token
    this.tenantId = tenantId
  }

  /** Return the credentials and tenant currently used by this client.
   * @returns Current token and tenant identifier, including undefined when either is unset.
   */
  getAuth(): { readonly token: string | undefined; readonly tenantId: string | undefined } {
    return { token: this.token, tenantId: this.tenantId }
  }

  // ── Authentication & Tenants ─────────────────────────────────────────────

  /** Authenticate a user and retain a token returned by the API.
   * @param username - YuanShu account name.
   * @param password - YuanShu account password.
   * @returns The API login response.
   */
  async login(username: string, password: string): Promise<unknown> {
    const data = await this.request<unknown>('/api/v1/login', { method: 'POST', body: { username, password } })
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      const token = record.token ?? record.access_token
      if (typeof token === 'string') this.token = token
    }
    return data
  }

  /** List tenants visible to the authenticated user.
   * @returns The user's tenants.
   */
  listTenants(): Promise<YuanShuTenant[]> {
    return this.request<YuanShuTenant[]>('/api/v1/user/tenants')
  }

  /** Select a tenant for subsequent requests.
   * @param tenantId - Tenant identifier to select.
   * @returns The API response.
   */
  switchTenant(tenantId: string): Promise<unknown> {
    this.tenantId = tenantId
    return this.request('/api/v1/user/tenant', { method: 'POST', body: { tenant_id: tenantId } })
  }

  // ── Capability Discovery ─────────────────────────────────────────────────

  /** Discover agent, skill, algorithm, and DAG capabilities.
   * @returns Capabilities whose endpoint requests succeeded and had usable identifiers.
   */
  async listCapabilities(): Promise<YuanShuCapability[]> {
    const endpoints: Array<[YuanShuCapability['kind'], string]> = [
      ['agent', '/api/v1/agent/definitions'],
      ['skill', '/api/v1/skills'],
      ['algorithm', '/api/v1/algorithms'],
      ['dag', '/api/v1/dag/definitions'],
    ]
    const results = await Promise.all(endpoints.map(async ([kind, path]) => {
      // 能力目录是控制面数据，不能用“吞异常并返回空数组”的方式降级：
      // 认证失败、租户权限错误或平台故障都必须暴露给调用方，避免把
      // “没有权限”误显示为“平台没有能力”。
      const rows: unknown[] = []
      let page = 1
      let total: number | undefined
      const pageSize = 100
      while (true) {
        const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
        const value = await this.request<unknown>(`${path}?${query.toString()}`)
        const parsed = parseCapabilityPage(value)
        rows.push(...parsed.list)
        total ??= parsed.total

        // 兼容数组响应和没有 total 的旧网关：短页或空页表示已经结束。
        // 有 total 时以 total 为准，防止恰好整页时漏掉下一页。
        if (parsed.list.length === 0 || (total !== undefined && rows.length >= total) ||
          (total === undefined && parsed.list.length < pageSize)) break
        page += 1
        if (page > 10000) {
          throw new YuanShuError(`YuanShu capability pagination exceeded safety limit for ${path}`, 502)
        }
      }
      return rows.flatMap((raw): YuanShuCapability[] => {
        if (!raw || typeof raw !== 'object') return []
        const row = raw as Record<string, unknown>
        const id = row.id ?? row.name ?? row.code
        const name = row.name ?? row.display_name ?? row.title ?? id
        if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string') return []
        return [{ kind, id: String(id), name, description: typeof row.description === 'string' ? row.description : undefined, raw }]
      })
    }))
    return results.flat()
  }

  // ── Worker Execution ─────────────────────────────────────────────────────

  /** Execute a worker and return its complete response.
   * @param request - Worker type and task input.
   * @returns The worker response.
   */
  async executeWorker(request: YuanShuExecuteRequest): Promise<unknown> {
    return this.request(`/api/v1/workers/${encodeURIComponent(request.worker_type)}/execute`, { method: 'POST', body: request })
  }

  /** Execute a worker and yield its server-sent events.
   * @param request - Worker type and task input.
   * @param signal - Optional cancellation signal for the HTTP request.
   * @returns The decoded event stream.
   */
  async *executeWorkerStream(request: YuanShuExecuteRequest, signal?: AbortSignal): AsyncIterable<YuanShuSseEvent> {
    const response = await this.raw(`/api/v1/workers/${encodeURIComponent(request.worker_type)}/execute-stream`, {
      method: 'POST', body: request, ...(signal === undefined ? {} : { signal }),
    })
    if (!response.body) throw new YuanShuError('YuanShu returned an empty SSE body', response.status)
    yield* parseSse(response.body)
  }

  // ── Knowledge Q&A ────────────────────────────────────────────────────────

  /**
   * Ask a knowledge question and wait for the complete answer.
   * @param request - Question and optional retrieval settings.
   * @returns The answer with citations and execution metadata.
   */
  async askQuestion(request: AskKnowledgeQuestionRequest): Promise<AskKnowledgeQuestionResponse> {
    return this.request<AskKnowledgeQuestionResponse>('/api/v1/knowledge-bases/qa/ask', {
      method: 'POST', body: request,
    })
  }

  /**
   * Ask a knowledge question and yield its server-sent events.
   * @param request - Question and optional retrieval settings.
   * @param signal - Optional cancellation signal for the HTTP request.
   * @returns Events from the YuanShu response stream.
   */
  async *askQuestionStream(request: AskKnowledgeQuestionRequest, signal?: AbortSignal): AsyncIterable<YuanShuSseEvent> {
    const response = await this.raw('/api/v1/knowledge-bases/qa/ask/stream', {
      method: 'POST', body: request, ...(signal === undefined ? {} : { signal }),
    })
    if (!response.body) throw new YuanShuError('YuanShu returned an empty SSE body', response.status)
    yield* parseSse(response.body)
  }

  /**
   * List knowledge Q&A sessions for the current user.
   * @param limit - Maximum number of sessions to return.
   * @returns The user's saved sessions.
   */
  listQASessions(limit?: number): Promise<KnowledgeQASession[]> {
    const params = limit !== undefined ? `?limit=${limit}` : ''
    return this.request<KnowledgeQASession[]>(`/api/v1/knowledge-bases/qa/sessions${params}`)
  }

  /**
   * Get conversation turns for a knowledge Q&A session.
   * @param sessionId - Session whose turns should be returned.
   * @param limit - Maximum number of turns to return.
   * @returns The session's turns.
   */
  getQASessionTurns(sessionId: string, limit?: number): Promise<KnowledgeQATurn[]> {
    const params = limit !== undefined ? `?limit=${limit}` : ''
    return this.request<KnowledgeQATurn[]>(`/api/v1/knowledge-bases/qa/sessions/${encodeURIComponent(sessionId)}/turns${params}`)
  }

  /**
   * Get the readiness status of knowledge collections for QA.
   * @param collectionIds - Optional collection identifiers to inspect.
   * @returns Readiness details for the selected collections.
   */
  getQAReadiness(collectionIds?: number[]): Promise<QAReadinessResponse> {
    const params = collectionIds !== undefined && collectionIds.length > 0
      ? `?collection_ids=${collectionIds.join(',')}`
      : ''
    return this.request<QAReadinessResponse>(`/api/v1/knowledge-bases/qa/readiness${params}`)
  }

  /**
   * List knowledge collections.
   * @param keyword - Optional name search.
   * @param limit - Maximum number of collections to return.
   * @returns Matching collections.
   */
  listKnowledgeCollections(keyword?: string, limit?: number): Promise<KnowledgeCollection[]> {
    const params = new URLSearchParams()
    if (keyword) params.set('keyword', keyword)
    if (limit) params.set('limit', String(limit))
    const qs = params.toString()
    return this.request<KnowledgeCollection[]>(`/api/v1/knowledges${qs ? `?${qs}` : ''}`)
  }

  /**
   * Get a knowledge document by ID.
   * @param id - Document identifier.
   * @returns The document metadata.
   */
  getKnowledgeDocument(id: number): Promise<KnowledgeDocument> {
    return this.request<KnowledgeDocument>(`/api/v1/knowledges/${id}`)
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
    return readResponse<T>(await this.raw(path, options))
  }

  private raw(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (this.tenantId) headers['X-Tenant-ID'] = this.tenantId
    const init: RequestInit = { method: options.method ?? 'GET', headers }
    if (options.body !== undefined) init.body = JSON.stringify(options.body)
    if (options.signal !== undefined) init.signal = options.signal
    return this.fetcher(joinURL(this.baseURL, path), init)
  }
}

/** 将能力列表响应统一成分页页，供 `listCapabilities` 使用。
 *
 * 这里不对非法数据静默修复：空对象会被视为空页，调用方仍能得到稳定
 * 结果；真正的 HTTP/API 错误已经由 `readResponse` 转换为 YuanShuError
 * 并向上抛出。`page_size` 同时兼容驼峰字段，便于经过旧网关时工作。
 */
function parseCapabilityPage(value: unknown): YuanShuPagePayload {
  if (Array.isArray(value)) return { list: value }
  if (!value || typeof value !== 'object') return { list: [] }
  const record = value as Record<string, unknown>
  const list = record.list ?? record.items
  if (!Array.isArray(list)) return { list: [] }
  const total = typeof record.total === 'number' && Number.isFinite(record.total) ? record.total : undefined
  const page = typeof record.page === 'number' && Number.isFinite(record.page) ? record.page : undefined
  const pageSizeValue = record.page_size ?? record.pageSize
  const pageSize = typeof pageSizeValue === 'number' && Number.isFinite(pageSizeValue) ? pageSizeValue : undefined
  // exactOptionalPropertyTypes 要求可选字段在不存在时完全省略，不能显式
  // 写入 `undefined`；这样生成的对象也更接近真实分页 JSON。
  return {
    list,
    ...(total === undefined ? {} : { total }),
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
  }
}

/** Decode an SSE response body into event names and JSON-or-text data.
 * @param body - Streaming response body.
 * @returns Parsed events in arrival order.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncIterable<YuanShuSseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let data: string[] = []
  const flush = (): YuanShuSseEvent | undefined => {
    if (data.length === 0) return undefined
    const raw = data.join('\n')
    let parsed: unknown = raw
    try { parsed = JSON.parse(raw) } catch { /* plain text event */ }
    const result = { event, data: parsed }
    event = 'message'; data = []
    return result
  }
  while (true) {
    const chunk = await reader.read()
    buffer += decoder.decode(chunk.value, { stream: !chunk.done })
    const lines = buffer.split(/\r?\n/u)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line === '') { const result = flush(); if (result) yield result; continue }
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (chunk.done) break
  }
  const result = flush(); if (result) yield result
}
