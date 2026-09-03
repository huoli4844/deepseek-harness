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
