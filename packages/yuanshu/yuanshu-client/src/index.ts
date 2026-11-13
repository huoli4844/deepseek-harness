import type { YuanShuMcp } from './mcp.ts'
export { YuanShuMcp, YuanShuMcpError } from './mcp.ts'
export type { YuanShuMcpOptions, YuanShuMcpGrant, YuanShuMcpCredentials } from './mcp.ts'

/** Options for connecting to a YuanShu API endpoint. */
export interface YuanShuClientConfig {
  readonly baseURL: string
  readonly token?: string
  readonly tenantId?: string
  readonly fetch?: typeof globalThis.fetch
  /** Explicit enterprise channel; absent preserves the legacy adapter for rollback. */
  readonly enterprise?: YuanShuMcp
}

/** Standard success envelope returned by YuanShu endpoints. */
export interface YuanShuResponse<T> {
  readonly code: number
  readonly message?: string
  readonly data: T
}

/** The YuanShu account behind the current bearer token. */
export interface YuanShuCurrentUser {
  readonly id?: string | number
  readonly username?: string
  readonly nickname?: string
}

/** A tenant available to the authenticated YuanShu user. */
export interface YuanShuTenant {
  readonly id: string | number
  readonly name?: string
  readonly [key: string]: unknown
}

/** Tenants plus the token's current tenant. */
export interface YuanShuTenantContext {
  readonly current?: YuanShuTenant
  readonly list: readonly YuanShuTenant[]
}

/** A discovered YuanShu worker capability. */
export interface YuanShuCapability {
  readonly kind: 'agent' | 'skill' | 'algorithm' | 'dag' | 'worker'
  readonly id: string
  readonly name: string
  readonly description: string | undefined
  /** 已发布能力声明的入参 schema；缺省表示能力没有可展示的参数契约。 */
  readonly inputSchema?: Readonly<Record<string, unknown>>
  /** 是否能通过客户执行入口直接运行；resource 型 Skill 为 false，缺省视为可执行。 */
  readonly executable?: boolean
  /** Skill 交互形态；resource 表示由 Agent 装载而不是直接执行。 */
  readonly interactionMode?: string
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

/** 同步能力执行返回的载荷。 */
export interface YuanShuExecutionResult {
  readonly result: unknown
  readonly [key: string]: unknown
}

/** 技能/算法异步执行提交参数。 */
export interface YuanShuExecutionRequest {
  /** 业务输入，对应元枢的 `input_data`。 */
  readonly inputData?: unknown
  /** 已上传的输入产物 ID。 */
  readonly inputArtifactIds?: readonly string[]
  /** 幂等键；同一键重复提交时元枢复用首次执行。 */
  readonly idempotencyKey?: string
}

/** 异步执行提交结果。 */
export interface YuanShuExecutionHandle {
  readonly execution: unknown
  readonly reused?: boolean
  readonly [key: string]: unknown
}

/** 发布态 DAG 应用调用参数。字段名与元枢 `DAGAppInvokeRequest` 保持一致。 */
export interface YuanShuDagInvokeRequest {
  readonly input?: unknown
  readonly conversationId?: string
  readonly conversationVars?: Readonly<Record<string, unknown>>
  readonly traceId?: string
  readonly idempotencyKey?: string
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
  readonly description?: string
  readonly code?: string
  readonly primary_tag?: string
  readonly status?: number
  readonly document_count?: number
}

/** Page of knowledge collections returned by the knowledge-base catalog. */
export interface KnowledgeCollectionPage {
  readonly list: readonly KnowledgeCollection[]
  readonly total?: number
  readonly page?: number
  readonly page_size?: number
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

// ── Workbench profile & home ────────────────────────────────────────────────

/** 当前用户的岗位与工作台投影。 */
export interface YuanShuWorkbenchProfile {
  readonly profile_id: string
  readonly profile_version: number
  readonly generated_at: string
  readonly expires_at: string
  readonly tenant_id: string
  readonly tenant_code: string
  readonly tenant_name: string
  readonly user_id: number
  readonly username: string
  readonly nickname: string
  readonly department: { readonly id: number; readonly code: string; readonly name: string }
  readonly active_roles: readonly { readonly code: string; readonly name: string }[]
  readonly workbench: { readonly code: string; readonly name: string }
  readonly plugin_contributions: readonly {
    readonly plugin_id: string
    readonly version_range: string
    readonly contribution_ids: readonly string[]
    readonly config_ref: string
  }[]
  readonly visible_capabilities: readonly string[]
  readonly focus_scope: {
    readonly scope_ref: string
    readonly scope_type: string
    readonly project_codes: readonly string[]
    readonly project_count: number
  }
  readonly data_scope: { readonly scope_type: string; readonly description: string }
  readonly slots: readonly string[]
}

/** 工作台首页的跨项目聚合指标。 */
export interface YuanShuHomeMetrics {
  readonly project_total: number
  readonly active_projects: number
  readonly open_risks: number
  readonly high_risks: number
  readonly open_tasks: number
  readonly overdue_tasks: number
  /** 负责人是当前用户且未完成的任务数。 */
  readonly my_open_tasks: number
  /** 负责人是当前用户且已逾期的任务数。 */
  readonly my_overdue_tasks: number
  readonly pending_gates: number
  readonly milestones_due_30d: number
}

/** 首页任务状态分布；逾期是独立桶，各状态之和等于 total。 */
export interface YuanShuHomeTaskStats {
  readonly total: number
  readonly pending: number
  readonly in_progress: number
  readonly overdue: number
  readonly completed: number
  readonly cancelled: number
}

/** 首页「我的项目」卡片。 */
export interface YuanShuHomeProject {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly stage: string
  readonly status: string
  readonly priority: string
  readonly risk_level: string
  readonly progress_percent: number
  readonly manager_user_id: number
  readonly manager_name?: string
  readonly end_date?: string | null
  readonly open_tasks: number
  readonly open_risks: number
}

/** 首页风险行。 */
export interface YuanShuHomeRisk {
  readonly id: number
  readonly project_code: string
  readonly project_name: string
  readonly risk_code: string
  readonly title: string
  readonly risk_level: string
  readonly status: string
  readonly handler_name?: string
  readonly deadline?: string | null
}

/** 首页任务行。 */
export interface YuanShuHomeTask {
  readonly id: number
  readonly project_code: string
  readonly project_name: string
  readonly code: string
  readonly name: string
  readonly priority: string
  readonly status: string
  readonly plan_end?: string | null
  readonly owner_name?: string
  readonly overdue: boolean
}

/** 首页门径行。 */
export interface YuanShuHomeGate {
  readonly id: number
  readonly project_code: string
  readonly project_name: string
  readonly gate_code: string
  readonly gate_name: string
  readonly planned_date?: string | null
  readonly gate_status: string
}

/** 首页里程碑行。 */
export interface YuanShuHomeMilestone {
  readonly id: number
  readonly project_code: string
  readonly project_name: string
  readonly code: string
  readonly name: string
  readonly plan_date?: string | null
  readonly status: string
  readonly days_left: number
}

/** 首页场景入口。 */
export interface YuanShuHomeScene {
  readonly code: string
  readonly title: string
  readonly description: string
  readonly plugin_id: string
  readonly contribution_id: string
  readonly entry: string
  readonly available: boolean
}

/** 岗位工作台首页聚合。 */
export interface YuanShuWorkbenchHome {
  readonly generated_at: string
  readonly tenant: { readonly id: string; readonly code: string; readonly name: string }
  readonly workbench: { readonly code: string; readonly name: string }
  readonly data_scope: { readonly scope_type: string; readonly description: string }
  readonly metrics: YuanShuHomeMetrics
  /** 当前用户的任务状态分布，用于任务概览与看板列计数。 */
  readonly my_task_stats?: YuanShuHomeTaskStats
  /** 当前工作台的指标卡顺序；为空时客户端使用默认顺序。 */
  readonly metric_keys?: readonly string[]
  readonly sections: readonly string[]
  readonly projects: readonly YuanShuHomeProject[]
  readonly risks: readonly YuanShuHomeRisk[]
  readonly tasks: readonly YuanShuHomeTask[]
  /** 负责人是当前用户的待办。 */
  readonly my_tasks: readonly YuanShuHomeTask[]
  readonly gates: readonly YuanShuHomeGate[]
  readonly milestones: readonly YuanShuHomeMilestone[]
  readonly scenes: readonly YuanShuHomeScene[]
}

/** 工作台左侧业务栏目。 */
export interface YuanShuWorkbenchNavItem {
  readonly code: string
  readonly title: string
  /** 当前数据范围内的记录总数。 */
  readonly count: number
}

/** 一组同域栏目。 */
export interface YuanShuWorkbenchNavGroup {
  readonly code: string
  readonly title: string
  readonly items: readonly YuanShuWorkbenchNavItem[]
}

/** 左侧栏目导航投影。 */
export interface YuanShuWorkbenchNavigator {
  readonly generated_at: string
  readonly workbench: { readonly code: string; readonly name: string }
  readonly data_scope: { readonly scope_type: string; readonly description: string }
  readonly groups: readonly YuanShuWorkbenchNavGroup[]
}

/** 记录详情字段：顺序由后端决定，空值已被后端过滤。 */
export interface YuanShuWorkbenchField {
  readonly label: string
  readonly value: string
}

/** 跨业务域归一后的记录行。 */
export interface YuanShuWorkbenchRecord {
  readonly id: number
  readonly domain: string
  readonly code: string
  readonly title: string
  readonly subtitle: string
  readonly status: string
  readonly priority: string
  readonly owner_user_id: number
  readonly owner_name?: string
  readonly project_code: string
  readonly project_name: string
  /** YYYY-MM-DD；空字符串表示该域没有业务截止日期。 */
  readonly due_date: string
  readonly overdue: boolean
  /** 该业务域自己的关键字段，右侧详情按序渲染。 */
  readonly fields?: readonly YuanShuWorkbenchField[]
}

/** 一个业务栏目的分页记录。 */
export interface YuanShuWorkbenchRecords {
  readonly domain: string
  readonly items: readonly YuanShuWorkbenchRecord[]
  readonly total: number
  readonly page: number
  readonly page_size: number
}

/** 岗位简报上的一个指标。 */
export interface YuanShuBriefingKPI {
  readonly key: string
  readonly label: string
  readonly value: number
  /** neutral | warning | danger */
  readonly tone: string
}

/** 简报中的一个事项，可定位到数据探索里的记录。 */
export interface YuanShuBriefingItem {
  readonly id: string
  readonly title: string
  readonly meta: string
  readonly domain: string
  readonly record_id: number
  readonly record_code: string
  readonly due_date: string
  readonly overdue: boolean
  readonly tone?: string
}

/** 岗位简报：身份、数据范围、指标、今日事项与异常。 */
export interface YuanShuWorkbenchBriefing {
  readonly generated_at: string
  readonly tenant?: { readonly id: string; readonly code: string; readonly name: string }
  readonly workbench?: { readonly code?: string; readonly title?: string }
  readonly data_scope?: { readonly description?: string }
  readonly greeting: string
  readonly kpis: readonly YuanShuBriefingKPI[]
  readonly today: readonly YuanShuBriefingItem[]
  readonly exceptions: readonly YuanShuBriefingItem[]
}

/** 决策依据。 */
export interface YuanShuDecisionEvidence {
  readonly label: string
  readonly value: string
}

/** 决策动作。 */
export interface YuanShuDecisionAction {
  readonly code: string
  readonly label: string
}

/** 一条待决策事项。 */
export interface YuanShuDecisionItem {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly reason: string
  readonly recommendation: string
  /** high | medium | low */
  readonly severity: string
  readonly domain: string
  readonly record_id: number
  readonly record_code: string
  readonly project_name: string
  readonly deadline: string
  readonly evidence: readonly YuanShuDecisionEvidence[]
  readonly actions: readonly YuanShuDecisionAction[]
}

/** 待决策队列。 */
export interface YuanShuDecisionQueue {
  readonly generated_at: string
  readonly total: number
  readonly items: readonly YuanShuDecisionItem[]
}

/** 岗位面板区块：type 由客户端区块注册表渲染。 */
export interface YuanShuPositionBlock {
  readonly type: string
  readonly title: string
  readonly source?: string
}

/** 岗位 Agent 的角色设定。 */
export interface YuanShuPositionAgent {
  readonly code: string
  readonly role: string
  readonly goal: string
  readonly rules: readonly string[]
}

/** 工作流的一步：做什么、用哪些工具、产出什么。 */
export interface YuanShuWorkflowStep {
  readonly title: string
  readonly tools: readonly string[]
  readonly output: string
}

/** 岗位 Agent 工作流配置。 */
export interface YuanShuPositionWorkflow {
  readonly code: string
  readonly label: string
  readonly intent: string
  readonly trigger: string
  readonly inputs: readonly string[]
  readonly steps: readonly YuanShuWorkflowStep[]
  readonly deliverable: string
  readonly approval: string
  readonly prompt: string
}

/** 可预览的岗位。 */
export interface YuanShuPositionOption {
  readonly code: string
  readonly title: string
}

/** 岗位目录：当前岗位与租户内可预览的岗位。 */
export interface YuanShuPositionCatalog {
  readonly current: string
  readonly options: readonly YuanShuPositionOption[]
}

function positionQuery(path: string, position?: string): string {
  if (position === undefined || position === '') return path
  return `${path}?position=${encodeURIComponent(position)}`
}

/** 岗位包：同一副面板骨架的装配描述。 */
export interface YuanShuWorkbenchPosition {
  readonly generated_at: string
  readonly position: string
  readonly title: string
  readonly headline: string
  readonly scope: { readonly type: string; readonly description: string }
  readonly kpis: readonly { readonly key: string; readonly label: string }[]
  readonly decision_kinds: readonly string[]
  readonly blocks: readonly YuanShuPositionBlock[]
  readonly agent: YuanShuPositionAgent
  readonly workflows: readonly YuanShuPositionWorkflow[]
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

  /** 是否为可安全重试的瞬时失败。认证、权限和“不可见”错误不在此列。 */
  get retryable(): boolean {
    return this.status === 408 || this.status === 429 || this.status >= 500
  }
}

function joinURL(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/$/u, '')}/${path.replace(/^\//u, '')}`
}

/** 给只读列表路径补上第一页查询参数。 */
function withPageQuery(path: string, limit?: number): string {
  const query = new URLSearchParams({ page: '1' })
  if (limit !== undefined) query.set('page_size', String(limit))
  return `${path}?${query.toString()}`
}

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  let payload: unknown
  try { payload = JSON.parse(text) } catch { payload = undefined }
  if (!response.ok) {
    // 元枢错误体通常是 `{code, message}`。保留服务端错误码，调用方才能区分
    // 401/403（换账号或重新授权）与 404（能力不可见）和 5xx（可重试）。
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : undefined
    const message = typeof record?.message === 'string' && record.message.length > 0 ? record.message : text || response.statusText
    const code = typeof record?.code === 'number' || typeof record?.code === 'string' ? record.code : undefined
    throw new YuanShuError(message, response.status, code)
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload)) return payload as T
  const wrapped = payload as YuanShuResponse<T>
  // 元枢信封的 code 与 HTTP 状态一致：0 表示成功，2xx 表示已受理/成功。
  // DAG 队列执行会返回 `{code:202, data:{execution_id, status}}`，不能按失败处理。
  const code = typeof wrapped.code === 'number' ? wrapped.code : undefined
  const succeeded = wrapped.code === 0 || (code !== undefined && code >= 200 && code < 300)
  if (!succeeded) {
    throw new YuanShuError(wrapped.message ?? 'YuanShu request failed', response.status, wrapped.code)
  }
  return wrapped.data
}

/** 把客户端字段转换为元枢执行提交契约；未提供的字段不出现在请求体里。 */
function executionBody(request: YuanShuExecutionRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (request.inputData !== undefined) body.input_data = request.inputData
  if (request.inputArtifactIds !== undefined) body.input_artifact_ids = [...request.inputArtifactIds]
  if (request.idempotencyKey !== undefined) body.idempotency_key = request.idempotencyKey
  return body
}

/** 幂等键同时放进请求头，兼容只读取 `Idempotency-Key` 的网关实现。 */
function executionHeaders(request: YuanShuExecutionRequest): { headers?: Record<string, string> } {
  return request.idempotencyKey === undefined ? {} : { headers: { 'Idempotency-Key': request.idempotencyKey } }
}

/** 把 DAG 调用参数转换成元枢契约；未提供的字段不写入请求体。 */
function dagInvokeBody(request: YuanShuDagInvokeRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (request.input !== undefined) body.input = request.input
  if (request.conversationId !== undefined) body.conversation_id = request.conversationId
  if (request.conversationVars !== undefined) body.conversationVars = request.conversationVars
  if (request.traceId !== undefined) body.trace_id = request.traceId
  if (request.idempotencyKey !== undefined) body.idempotency_key = request.idempotencyKey
  return body
}

/** Sends authenticated HTTP requests to YuanShu and decodes JSON or SSE responses. */
export class YuanShuClient {
  private readonly enterprise: YuanShuMcp | undefined
  private readonly baseURL: string
  private readonly fetcher: typeof globalThis.fetch
  private token: string | undefined
  private tenantId: string | undefined

  /** @param config - Endpoint, credentials, tenant, and optional fetch implementation. */
  constructor(config: YuanShuClientConfig) {
    this.enterprise = config.enterprise
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

  /** Read the account behind the current credentials.
   * @returns The current user profile, or undefined when the API returns no object.
   */
  async getCurrentUser(): Promise<YuanShuCurrentUser | undefined> {
    const value = await this.request<unknown>('/api/v1/user/me')
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const record = value as Record<string, unknown>
    return {
      ...(typeof record.id === 'string' || typeof record.id === 'number' ? { id: record.id } : {}),
      ...(typeof record.username === 'string' ? { username: record.username } : {}),
      ...(typeof record.nickname === 'string' ? { nickname: record.nickname } : {}),
    }
  }

  /** Read the tenant context visible to the authenticated user.
   * @returns The token's current tenant and every selectable tenant.
   */
  async getTenantContext(): Promise<YuanShuTenantContext> {
    const value = await this.request<unknown>('/api/v1/user/tenants')
    // 元枢返回 `{ current, list }`，早期网关可能直接返回数组。
    if (Array.isArray(value)) return { list: value as YuanShuTenant[] }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const list = Array.isArray(record.list) ? record.list as YuanShuTenant[] : []
      const current = record.current !== null && typeof record.current === 'object' && !Array.isArray(record.current)
        ? record.current as YuanShuTenant
        : undefined
      return { ...(current === undefined ? {} : { current }), list }
    }
    return { list: [] }
  }

  /** List tenants visible to the authenticated user.
   * @returns The user's tenants.
   */
  async listTenants(): Promise<YuanShuTenant[]> {
    return [...(await this.getTenantContext()).list]
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

  // ── Capability Execution ─────────────────────────────────────────────────
  //
  // 元枢把能力执行拆成同步和异步两套端点；这里只做契约适配，不在客户端
  // 判断能力是否已发布或当前用户是否有权限。可见性与授权由元枢裁决，
  // 客户端对 404 的处理就是“能力不存在或不可见”。

  /** 同步执行一个已发布技能。
   * @param id - Skill ID。
   * @param inputData - 技能输入，对应 `input_data`。
   * @returns 元枢返回的 `{ result }` 载荷。
   */
  executeSkill(id: string | number, inputData: unknown): Promise<YuanShuExecutionResult> {
    return this.request(`/api/v1/skills/${encodeURIComponent(String(id))}/execute`, {
      method: 'POST',
      body: { input_data: inputData },
    })
  }

  /** 提交技能异步执行，返回执行记录。
   * @param id - Skill ID。
   * @param request - 输入、输入产物与幂等键。
   * @returns 执行记录和是否复用。
   */
  submitSkillExecution(id: string | number, request: YuanShuExecutionRequest = {}): Promise<YuanShuExecutionHandle> {
    return this.request(`/api/v1/skills/${encodeURIComponent(String(id))}/executions`, {
      method: 'POST',
      body: executionBody(request),
      ...executionHeaders(request),
    })
  }

  /** 同步执行一个已发布算法。
   * @param id - 算法 ID。
   * @param inputData - 算法输入，对应 `input_data`。
   * @param options - `draft` 仅用于元枢后台试运行，客户端默认 false。
   * @returns 元枢返回的 `{ result }` 载荷。
   */
  executeAlgorithm(id: string | number, inputData: unknown, options: { readonly draft?: boolean } = {}): Promise<YuanShuExecutionResult> {
    return this.request(`/api/v1/algorithms/${encodeURIComponent(String(id))}/execute`, {
      method: 'POST',
      body: { input_data: inputData, draft: options.draft === true },
    })
  }

  /** 提交算法异步执行，返回执行记录。
   * @param id - 算法 ID。
   * @param request - 输入、输入产物与幂等键。
   * @returns 执行记录和是否复用。
   */
  submitAlgorithmExecution(id: string | number, request: YuanShuExecutionRequest = {}): Promise<YuanShuExecutionHandle> {
    return this.request(`/api/v1/algorithms/${encodeURIComponent(String(id))}/executions`, {
      method: 'POST',
      body: executionBody(request),
      ...executionHeaders(request),
    })
  }

  /** 查询某个算法的历史执行记录。
   * @param id - 算法 ID。
   * @param limit - 可选的页大小。
   * @returns 元枢分页执行记录。
   */
  listAlgorithmExecutions(id: string | number, limit?: number): Promise<unknown> {
    const query = new URLSearchParams({ page: '1' })
    if (limit !== undefined) query.set('page_size', String(limit))
    return this.request(`/api/v1/algorithms/${encodeURIComponent(String(id))}/executions?${query.toString()}`)
  }

  /** 调用一个已发布 DAG 应用。
   * @param id - DAG 定义 ID。
   * @param request - 输入、会话变量、trace 与幂等键。
   * @returns 元枢 DAG 执行响应。
   */
  invokeDag(id: string | number, request: YuanShuDagInvokeRequest = {}): Promise<unknown> {
    return this.request(`/api/v1/dag/definitions/${encodeURIComponent(String(id))}/invoke`, {
      method: 'POST',
      body: dagInvokeBody(request),
      ...(request.idempotencyKey === undefined ? {} : { headers: { 'Idempotency-Key': request.idempotencyKey } }),
    })
  }

  /** 查询一次 DAG 运行详情。
   * @param id - DAG 历史记录 ID。
   * @returns 运行详情。
   */
  getDagHistory(id: string | number): Promise<unknown> {
    return this.request(`/api/v1/dag/history/${encodeURIComponent(String(id))}`)
  }

  /** 列出 DAG 运行历史。
   * @param limit - 可选的页大小。
   * @returns 元枢分页运行历史。
   */
  listDagHistory(limit?: number): Promise<unknown> {
    const query = new URLSearchParams({ page: '1' })
    if (limit !== undefined) query.set('page_size', String(limit))
    return this.request(`/api/v1/dag/history?${query.toString()}`)
  }

  /** Read the original execution, including failed terminal status and artifacts.
   * @param executionId - Platform execution handle.
   * @returns Original execution detail; never starts an execution.
   */
  getExecution(executionId: string): Promise<unknown> {
    return this.request(`/api/v1/execution-runs/${encodeURIComponent(executionId)}`)
  }

  /** Request cancellation of the original execution.
   * @param executionId - Platform execution handle.
   * @param key - Stable key for this cancellation intent.
   * @returns Recorded cancellation intent and current state.
   */
  cancelExecution(executionId: string, key: string): Promise<unknown> {
    return this.request(`/api/v1/execution-runs/${encodeURIComponent(executionId)}/cancel`, { method: 'POST', body: { idempotency_key: key }, headers: { 'Idempotency-Key': key } })
  }

  // ── Client Workbench（普通客户通道） ─────────────────────────────────────
  //
  // 普通业务角色没有 `system:*` 管理权限，只使用 `/api/v1/client/*`。服务端
  // 按“已发布 + 当前租户可见”过滤目录，并在执行入口二次校验；不可见能力
  // 统一返回 404，客户端不能凭 ID 猜测能力是否存在。

  /** 拉取当前用户可见的已发布能力目录。
   * @returns 能力列表，元素包含 `kind`、`id`、`name` 和可选描述。
   */
  async listClientCapabilities(): Promise<YuanShuCapability[]> {
    const value = await this.request<unknown>('/api/v1/client/capabilities')
    const rows = Array.isArray(value) ? value : []
    return rows.flatMap((raw): YuanShuCapability[] => {
      if (raw === null || typeof raw !== 'object') return []
      const record = raw as Record<string, unknown>
      const kind = record.kind
      const id = record.id
      const name = record.name
      if (kind !== 'agent' && kind !== 'skill' && kind !== 'algorithm' && kind !== 'dag' && kind !== 'worker') return []
      if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string' || name.length === 0) return []
      const schema = record.input_schema
      return [{
        kind,
        id: String(id),
        name,
        description: typeof record.description === 'string' && record.description.length > 0 ? record.description : undefined,
        ...(schema !== null && typeof schema === 'object' && !Array.isArray(schema)
          ? { inputSchema: schema as Record<string, unknown> }
          : {}),
        executable: record.executable !== false,
        ...(typeof record.interaction_mode === 'string' && record.interaction_mode.length > 0
          ? { interactionMode: record.interaction_mode }
          : {}),
        raw,
      }]
    })
  }

  /** 以普通客户身份同步执行一个已发布 Skill。
   * @param id - Skill ID。
   * @param inputData - Skill 输入参数。
   * @returns 元枢执行响应。
   */
  executeClientSkill(id: string | number, inputData?: unknown): Promise<unknown> {
    return this.request(`/api/v1/client/skills/${encodeURIComponent(String(id))}/execute`, {
      method: 'POST',
      body: inputData === undefined ? {} : { input_data: inputData },
    })
  }

  /** 以普通客户身份同步执行一个已发布算法。
   * @param id - 算法 ID。
   * @param inputData - 算法输入参数。
   * @returns 元枢执行响应。
   */
  executeClientAlgorithm(id: string | number, inputData?: unknown): Promise<unknown> {
    return this.request(`/api/v1/client/algorithms/${encodeURIComponent(String(id))}/execute`, {
      method: 'POST',
      body: { ...(inputData === undefined ? {} : { input_data: inputData }), draft: false },
    })
  }

  /**
   * Admit a published asset through the explicit HTTP rollback transport.
   * @param kind - Published asset family.
   * @param id - Platform asset identifier.
   * @param request - Frozen input and stable key shared with the MCP attempt.
   * @returns The original platform execution handle, including idempotent reuse.
   */
  submitClientExecution(kind: 'skills' | 'algorithms', id: string | number, request: YuanShuExecutionRequest): Promise<YuanShuExecutionHandle> {
    return this.request(`/api/v1/client/${kind}/${encodeURIComponent(String(id))}/executions`, {
      method: 'POST', body: executionBody(request), ...executionHeaders(request),
    })
  }

  /** 列出一次算法的历史执行记录。
   * @param id - 算法 ID。
   * @param limit - 可选的页大小。
   * @returns 元枢分页执行记录。
   */
  listClientAlgorithmExecutions(id: string | number, limit?: number): Promise<unknown> {
    const query = new URLSearchParams({ page: '1' })
    if (limit !== undefined) query.set('page_size', String(limit))
    return this.request(`/api/v1/client/algorithms/${encodeURIComponent(String(id))}/executions?${query.toString()}`)
  }

  /** 以普通客户身份调用一个已发布 DAG 应用。
   * @param id - DAG 定义 ID。
   * @param request - 输入、会话变量、trace 与幂等键。
   * @returns 元枢 DAG 执行响应。
   */
  invokeClientDag(id: string | number, request: YuanShuDagInvokeRequest = {}): Promise<unknown> {
    return this.request(`/api/v1/client/dag/definitions/${encodeURIComponent(String(id))}/invoke`, {
      method: 'POST',
      body: dagInvokeBody(request),
      ...(request.idempotencyKey === undefined ? {} : { headers: { 'Idempotency-Key': request.idempotencyKey } }),
    })
  }

  /** 列出当前租户的 DAG 运行历史。
   * @param limit - 可选的页大小。
   * @param dagDefinitionId - 可选，只列出某个 DAG 定义的运行。
   * @returns 元枢分页运行历史。
   */
  listClientDagHistory(limit?: number, dagDefinitionId?: string | number): Promise<unknown> {
    const query = new URLSearchParams({ page: '1' })
    if (limit !== undefined) query.set('page_size', String(limit))
    if (dagDefinitionId !== undefined) query.set('dag_definition_id', String(dagDefinitionId))
    return this.request(`/api/v1/client/dag/history?${query.toString()}`)
  }

  /** 读取一次客户 DAG 运行详情（含节点执行快照）。
   * @param id - DAG 历史记录 ID。
   * @returns 元枢运行详情。
   */
  getClientDagHistoryDetail(id: string | number): Promise<unknown> {
    return this.request(`/api/v1/client/dag/history/${encodeURIComponent(String(id))}`)
  }

  // ── Workbench profile & home（岗位工作台投影） ───────────────────────────
  //
  // 角色、权限、工作台与数据范围全部由元枢计算。DSH 只消费投影并渲染，
  // 不在客户端重新判断岗位，也不根据角色写分支。

  /** 读取当前会话的岗位工作台 profile（含岗位角色、数据范围与场景声明）。
   * @returns 元枢计算的 profile 投影。
   */
  getWorkbenchProfile(): Promise<YuanShuWorkbenchProfile> {
    return this.request('/api/v1/client/workbench/profile')
  }

  /** 读取岗位工作台首页聚合（指标、风险、任务、门径、里程碑与场景）。
   * @returns 元枢计算的首页载荷，区块顺序由服务端 `sections` 决定。
   */
  getWorkbenchHome(): Promise<YuanShuWorkbenchHome> {
    return this.request('/api/v1/client/workbench/home')
  }

  /** 读取岗位包：面板骨架的装配描述（指标、决策类型、区块与 Agent 动作）。
   * @param position - 可选岗位预览代码，平台仍校验当前用户的数据范围。
   * @returns 当前账号岗位的面板装配描述。
   */
  getWorkbenchPosition(position?: string): Promise<YuanShuWorkbenchPosition> {
    return this.request(positionQuery('/api/v1/client/workbench/position', position))
  }

  /** 读取可预览的岗位目录。
   * @returns 当前岗位与可选岗位列表。
   */
  getWorkbenchPositions(): Promise<YuanShuPositionCatalog> {
    return this.request('/api/v1/client/workbench/positions')
  }

  /** 读取岗位简报：指标、今日事项与异常。
   * @param position - 可选岗位预览代码，不授予该岗位的额外权限。
   * @returns 元枢投影的岗位简报。
   */
  getWorkbenchBriefing(position?: string): Promise<YuanShuWorkbenchBriefing> {
    return this.request(positionQuery('/api/v1/client/workbench/briefing', position))
  }

  /** 读取待决策队列：按影响与截止时间排序。
   * @param position - 可选岗位预览代码，返回当前用户可见的待决策事项。
   * @returns 待决策事项及其依据、建议和可执行动作。
   */
  getWorkbenchDecisionQueue(position?: string): Promise<YuanShuDecisionQueue> {
    return this.request(positionQuery('/api/v1/client/workbench/decision-queue', position))
  }

  /** 读取左侧业务栏目导航：按业务域分组的栏目与当前数据范围内的记录数。
   * @returns 元枢计算的导航投影。
   */
  getWorkbenchNavigator(): Promise<YuanShuWorkbenchNavigator> {
    return this.request('/api/v1/client/workbench/navigator')
  }

  /** 读取某个业务栏目的跨项目记录（已归一成统一行）。
   * @param domain - 导航返回的栏目 code。
   * @param options - 分页、关键字与状态过滤。
   * @returns 归一后的记录分页。
   */
  listWorkbenchRecords(
    domain: string,
    options: { page?: number; pageSize?: number; keyword?: string; status?: string } = {},
  ): Promise<YuanShuWorkbenchRecords> {
    const query = new URLSearchParams({
      domain,
      page: String(options.page ?? 1),
      page_size: String(options.pageSize ?? 50),
    })
    if (options.keyword !== undefined && options.keyword.length > 0) query.set('keyword', options.keyword)
    if (options.status !== undefined && options.status.length > 0) query.set('status', options.status)
    return this.request(`/api/v1/client/workbench/records?${query.toString()}`)
  }

  // ── Ontology / Scenario Catalogs（工作台只读目录） ───────────────────────
  //
  // 这些是控制面目录的只读视图。是否可见由元枢裁决：401/403/404 原样
  // 抛给界面，工作台据状态区分“登录失效 / 无权限 / 不可见”，不把错误
  // 吞成空列表。

  /** 读取本体平台概览。
   * @returns 概览载荷，结构由元枢决定。
   */
  getOntologyOverview(): Promise<unknown> {
    return this.request('/api/v1/ontology-platform/overview')
  }

  /** 列本体空间。
   * @param limit - 可选的页大小。
   * @returns 元枢分页载荷或数组。
   */
  listOntologySpaces(limit?: number): Promise<unknown> {
    return this.request(withPageQuery('/api/v1/ontology-platform/spaces', limit))
  }

  /** 列本体集合。
   * @param limit - 可选的页大小。
   * @returns 元枢分页载荷或数组。
   */
  listOntologyCollections(limit?: number): Promise<unknown> {
    return this.request(withPageQuery('/api/v1/ontology-platform/collections', limit))
  }

  /** 列本体发布版本。
   * @param limit - 可选的页大小。
   * @returns 元枢分页载荷或数组。
   */
  listOntologyReleases(limit?: number): Promise<unknown> {
    return this.request(withPageQuery('/api/v1/ontology-platform/releases', limit))
  }

  /** 列场景（Agent 定义）。
   * @param limit - 可选的页大小。
   * @returns 元枢分页载荷或数组。
   */
  listScenarios(limit?: number): Promise<unknown> {
    return this.request(withPageQuery('/api/v1/agent/definitions', limit))
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
    if (this.enterprise !== undefined) {
      const result = await this.request(`/api/v1/workers/${encodeURIComponent(request.worker_type)}/execute`, { method: 'POST', body: request, ...(signal === undefined ? {} : { signal }) })
      yield { event: 'complete', data: result }
      return
    }
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
    if (this.enterprise !== undefined) {
      const result = await this.askQuestion(request)
      yield { event: 'complete', data: result }
      return
    }
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
   * List knowledge collections (the knowledge-base catalog shown by 知识资产).
   * @param keyword - Optional name search.
   * @param limit - Maximum number of collections to return.
   * @returns Page of enabled collections.
   */
  listKnowledgeCollections(keyword?: string, limit?: number): Promise<KnowledgeCollectionPage> {
    const params = new URLSearchParams({ page: '1', page_size: String(limit ?? 100), status: '1' })
    if (keyword) params.set('keyword', keyword)
    return this.request<KnowledgeCollectionPage>(`/api/v1/knowledge-bases/collections?${params.toString()}`)
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

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Readonly<Record<string, string>> } = {},
  ): Promise<T> {
    if (this.enterprise !== undefined && !path.startsWith('/api/v1/auth/') && !path.startsWith('/api/v1/user/') && !path.startsWith('/api/v1/files/')) {
      const operation = enterpriseOperation(path, options.body, options.method ?? 'GET')
      if (/^(skill|algorithm|dag)_[0-9]+_execute$/u.test(operation.name)) {
        const definition = (await this.enterprise.tools()).find(tool => tool.name === operation.name)
        const schema = definition?.inputSchema.properties
        const revision = schema?.revision_id
        if (revision === null || typeof revision !== 'object' || !('const' in revision) || typeof revision.const !== 'number') throw new YuanShuError('Published revision unavailable; rediscover capabilities', 409, 'MCP_REVISION_UNAVAILABLE')
        operation.args.revision_id = revision.const
      }
      const result = await this.enterprise.call(operation.name, operation.args, options.signal)
      // Reading a failed terminal Run still returns that original record to the UI.
      if (result.isError === true && (options.method ?? 'GET') !== 'GET') throw new YuanShuBusinessError(result.structuredContent)
      if (result.isError === true && !isBusinessRecord(result.structuredContent)) throw new YuanShuBusinessError(result.structuredContent)
      if (result.resultType === 'input_required') throw new YuanShuError('Platform input or approval required', 409, 'MCP_INPUT_REQUIRED')
      const envelope = result.structuredContent
      if (envelope === null || typeof envelope !== 'object' || !('schema_version' in envelope) || envelope.schema_version !== '1' || !('data' in envelope)) throw new YuanShuError('Invalid enterprise result schema', 502, 'MCP_RESULT_INVALID')
      return envelope.data as T
    }
    return readResponse<T>(await this.raw(path, options))
  }

  private raw(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Readonly<Record<string, string>> } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.headers !== undefined) Object.assign(headers, options.headers)
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (this.tenantId) headers['X-Active-Tenant'] = this.tenantId
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

/** A rejected or uncertain business result retaining the platform's recovery handle. */
export class YuanShuBusinessError extends YuanShuError {
  constructor(readonly businessResult: unknown) {
    super('Enterprise operation failed; inspect the original Run before retrying', 502, 'MCP_BUSINESS_FAILED')
  }

  /** Business writes require recovery using their original handle before any retry. */
  override get retryable(): boolean { return false }
}

function isBusinessRecord(value: unknown): value is { schema_version: '1'; data: unknown } {
  return value !== null && typeof value === 'object' && 'schema_version' in value && value.schema_version === '1' && 'data' in value
}

function enterpriseOperation(path: string, body: unknown, method: string): { name: string; args: Record<string, unknown> } {
  const url = new URL(path, 'http://localhost')
  const args: Record<string, unknown> = Object.fromEntries(url.searchParams)
  for (const key of ['page', 'page_size', 'limit', 'after_seq', 'release_id', 'asset_id']) {
    const value = args[key]
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed < 0) throw new YuanShuError('Invalid numeric query parameter', 400, 'MCP_ARGUMENT_INVALID')
      args[key] = parsed
    }
  }
  if (body !== undefined) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new YuanShuError('Enterprise input must be an object', 400)
    Object.assign(args, body)
  }
  const fixed: Record<string, string> = {
    '/api/v1/client/capabilities': 'capabilities_list',
    '/api/v1/client/workbench/profile': 'workbench_profile',
    '/api/v1/client/workbench/home': 'workbench_home',
    '/api/v1/client/workbench/position': 'workbench_position',
    '/api/v1/client/workbench/positions': 'workbench_positions',
    '/api/v1/client/workbench/briefing': 'workbench_briefing',
    '/api/v1/client/workbench/decision-queue': 'workbench_decisions',
    '/api/v1/client/workbench/navigator': 'workbench_navigator',
    '/api/v1/client/workbench/records': 'workbench_records',
    '/api/v1/knowledge-bases/qa/ask': 'knowledge_ask',
    '/api/v1/knowledge-bases/collections': 'knowledge_collections',
    '/api/v1/client/dag/history': 'dag_history',
    '/api/v1/dag/history': 'dag_history',
    '/api/v1/ontology-platform/overview': 'ontology_overview',
    '/api/v1/ontology-platform/spaces': 'ontology_spaces',
    '/api/v1/ontology-platform/collections': 'ontology_collections',
    '/api/v1/ontology-platform/releases': 'ontology_releases',
    '/api/v1/agent/definitions': 'scenarios_list',
    '/api/v1/knowledge-bases/qa/sessions': 'knowledge_sessions',
    '/api/v1/knowledge-bases/qa/readiness': 'knowledge_readiness',
  }
  const name = fixed[url.pathname]
  if (name !== undefined) return { name, args }
  const asset = /^\/api\/v1\/(?:client\/)?(skills|algorithms)\/([0-9]+)\/(execute|executions)$/u.exec(url.pathname)
  if (asset !== null) {
    if (method === 'GET') return { name: 'executions_list', args: { ...args, asset_kind: asset[1] === 'skills' ? 'skill' : 'algorithm', asset_id: Number(asset[2]) } }
    const kind = asset[1] === 'skills' ? 'skill' : 'algorithm'
    return { name: `${kind}_${String(asset[2])}_execute`, args }
  }
  const dag = /^\/api\/v1\/(?:client\/)?dag\/definitions\/([0-9]+)\/invoke$/u.exec(url.pathname)
  if (dag !== null) return { name: `dag_${String(dag[1])}_execute`, args }
  const execution = /^\/api\/v1\/execution-runs\/([^/]+)(\/cancel)?$/u.exec(url.pathname)
  if (execution !== null) return { name: execution[2] === undefined ? 'execution_get' : 'execution_cancel', args: { ...args, executionID: decodeURIComponent(String(execution[1])) } }
  const history = /^\/api\/v1\/client\/dag\/history\/([0-9]+)$/u.exec(url.pathname)
  if (history !== null) return { name: 'dag_run_get', args: { ...args, id: history[1] } }
  const document = /^\/api\/v1\/knowledges\/([0-9]+)$/u.exec(url.pathname)
  if (document !== null) return { name: 'knowledge_document', args: { ...args, id: document[1] } }
  const turns = /^\/api\/v1\/knowledge-bases\/qa\/sessions\/([^/]+)\/turns$/u.exec(url.pathname)
  if (turns !== null) return { name: 'knowledge_session_turns', args: { ...args, session_id: decodeURIComponent(String(turns[1])) } }
  const worker = /^\/api\/v1\/workers\/([^/]+)\/execute$/u.exec(url.pathname)
  if (worker !== null) return { name: 'agent_delegate', args: { ...args, worker_type: decodeURIComponent(String(worker[1])) } }
  throw new YuanShuError('This enterprise operation has no MCP projection; no legacy fallback was executed', 501, 'MCP_OPERATION_UNAVAILABLE')
}
