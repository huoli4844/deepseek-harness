export interface YuanShuClientConfig {
  readonly baseURL: string
  readonly token?: string
  readonly tenantId?: string
  readonly fetch?: typeof globalThis.fetch
}

export interface YuanShuResponse<T> {
  readonly code: number
  readonly message?: string
  readonly data: T
}

export interface YuanShuTenant {
  readonly id: string | number
  readonly name?: string
  readonly [key: string]: unknown
}

export interface YuanShuCapability {
  readonly kind: 'agent' | 'skill' | 'algorithm' | 'dag' | 'worker'
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  readonly raw?: unknown
}

export interface YuanShuExecuteRequest {
  readonly task: string
  readonly worker_type: string
  readonly session_id?: string
  readonly model_name?: string
  readonly priority?: string
}

export interface YuanShuSseEvent {
  readonly event: string
  readonly data: unknown
}

// ── Knowledge Q&A types ──────────────────────────────────────────────────────

export interface KnowledgeCollection {
  readonly id: number
  readonly name: string
  readonly primary_tag?: string
  readonly status?: number
  readonly document_count?: number
}

export interface KnowledgeQASession {
  readonly session_id: string
  readonly question: string
  readonly user_id: number
  readonly created_at: string
  readonly updated_at: string
  readonly last_turn_id?: string
}

export interface KnowledgeQATurn {
  readonly turn_id: string
  readonly session_id: string
  readonly question: string
  readonly answer?: string
  readonly status?: string
  readonly created_at: string
}

export interface KnowledgeCitation {
  readonly evidence_id: string
  readonly document_id: string
  readonly node_id?: string
  readonly title?: string
  readonly content_preview?: string
  readonly relevance_score?: number
  readonly collection_id?: number
}

export interface AskKnowledgeQuestionRequest {
  readonly question: string
  readonly session_id?: string
  readonly collection_ids?: number[]
  readonly application_id?: number
  readonly primary_tag?: string
  readonly limit?: number
  readonly thinking_mode?: 'none' | 'light' | 'medium' | 'heavy' | 'ultra'
}

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

export class YuanShuError extends Error {
  readonly status: number
  readonly code: number | string | undefined

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

export class YuanShuClient {
  private readonly baseURL: string
  private readonly fetcher: typeof globalThis.fetch
  private token: string | undefined
  private tenantId: string | undefined

  constructor(config: YuanShuClientConfig) {
    this.baseURL = config.baseURL
    this.fetcher = config.fetch ?? globalThis.fetch
    this.token = config.token
    this.tenantId = config.tenantId
  }

  setAuth(token?: string, tenantId?: string): void {
    this.token = token
    this.tenantId = tenantId
  }

  getAuth(): { readonly token: string | undefined; readonly tenantId: string | undefined } {
    return { token: this.token, tenantId: this.tenantId }
  }

  // ── Authentication & Tenants ─────────────────────────────────────────────

  async login(username: string, password: string): Promise<unknown> {
    const data = await this.request<unknown>('/api/v1/login', { method: 'POST', body: { username, password } })
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      const token = record.token ?? record.access_token
      if (typeof token === 'string') this.token = token
    }
    return data
  }

  listTenants(): Promise<YuanShuTenant[]> {
    return this.request<YuanShuTenant[]>('/api/v1/user/tenants')
  }

  switchTenant(tenantId: string): Promise<unknown> {
    this.tenantId = tenantId
    return this.request('/api/v1/user/tenant', { method: 'POST', body: { tenant_id: tenantId } })
  }

  // ── Capability Discovery ─────────────────────────────────────────────────

  async listCapabilities(): Promise<YuanShuCapability[]> {
    const endpoints: Array<[YuanShuCapability['kind'], string]> = [
      ['agent', '/api/v1/agent/definitions'],
      ['skill', '/api/v1/skills'],
      ['algorithm', '/api/v1/algorithms'],
      ['dag', '/api/v1/dag/definitions'],
    ]
    const results = await Promise.all(endpoints.map(async ([kind, path]) => {
      try {
        const value = await this.request<unknown>(path)
        const rows = Array.isArray(value) ? value : []
        return rows.flatMap((raw): YuanShuCapability[] => {
          if (!raw || typeof raw !== 'object') return []
          const row = raw as Record<string, unknown>
          const id = row.id ?? row.name ?? row.code
          const name = row.name ?? row.display_name ?? row.title ?? id
          if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string') return []
          return [{ kind, id: String(id), name, description: typeof row.description === 'string' ? row.description : undefined, raw }]
        })
      } catch { return [] }
    }))
    return results.flat()
  }

  // ── Worker Execution ─────────────────────────────────────────────────────

  async executeWorker(request: YuanShuExecuteRequest): Promise<unknown> {
    return this.request(`/api/v1/workers/${encodeURIComponent(request.worker_type)}/execute`, { method: 'POST', body: request })
  }

  async *executeWorkerStream(request: YuanShuExecuteRequest, signal?: AbortSignal): AsyncIterable<YuanShuSseEvent> {
    const response = await this.raw(`/api/v1/workers/${encodeURIComponent(request.worker_type)}/execute-stream`, {
      method: 'POST', body: request, ...(signal === undefined ? {} : { signal }),
    })
    if (!response.body) throw new YuanShuError('YuanShu returned an empty SSE body', response.status)
    yield* parseSse(response.body)
  }

  // ── Knowledge Q&A ────────────────────────────────────────────────────────

  /**
   * Ask a knowledge question (synchronous).
   * Maps to POST /api/v1/knowledge-bases/qa/ask on the YuanShu backend.
   */
  async askQuestion(request: AskKnowledgeQuestionRequest): Promise<AskKnowledgeQuestionResponse> {
    return this.request<AskKnowledgeQuestionResponse>('/api/v1/knowledge-bases/qa/ask', {
      method: 'POST', body: request,
    })
  }

  /**
   * Ask a knowledge question with SSE streaming response.
   * Maps to POST /api/v1/knowledge-bases/qa/ask/stream on the YuanShu backend.
   *
   * Yields events of type:
   *   - "agent_event": RuntimeEvent projection (run_id, type, status, target, timestamp)
   *   - "complete": Final AskKnowledgeQuestionResponse
   *   - "error": Error object with message
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
   * Maps to GET /api/v1/knowledge-bases/qa/sessions.
   */
  listQASessions(limit?: number): Promise<KnowledgeQASession[]> {
    const params = limit !== undefined ? `?limit=${limit}` : ''
    return this.request<KnowledgeQASession[]>(`/api/v1/knowledge-bases/qa/sessions${params}`)
  }

  /**
   * Get conversation turns for a knowledge Q&A session.
   * Maps to GET /api/v1/knowledge-bases/qa/sessions/:session_id/turns.
   */
  getQASessionTurns(sessionId: string, limit?: number): Promise<KnowledgeQATurn[]> {
    const params = limit !== undefined ? `?limit=${limit}` : ''
    return this.request<KnowledgeQATurn[]>(`/api/v1/knowledge-bases/qa/sessions/${encodeURIComponent(sessionId)}/turns${params}`)
  }

  /**
   * Get the readiness status of knowledge collections for QA.
   * Maps to GET /api/v1/knowledge-bases/qa/readiness.
   */
  getQAReadiness(collectionIds?: number[]): Promise<QAReadinessResponse> {
    const params = collectionIds !== undefined && collectionIds.length > 0
      ? `?collection_ids=${collectionIds.join(',')}`
      : ''
    return this.request<QAReadinessResponse>(`/api/v1/knowledge-bases/qa/readiness${params}`)
  }

  /**
   * List knowledge collections.
   * Maps to GET /api/v1/knowledges on the YuanShu backend.
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
   * Maps to GET /api/v1/knowledges/:id.
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
