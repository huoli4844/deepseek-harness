/** 元枢能力工作台的纯逻辑：能力目录整形、参数校验、结果与错误语义。
 *
 * 这里刻意不依赖 React、DOM 和网络。能力可见性、授权和执行由元枢裁决，
 * 客户端只负责把服务端返回的目录与错误翻译成稳定的界面状态。
 */

/** 工作台可以展示的能力类型（顺序即选择器中的分组顺序）。 */
export const CAPABILITY_KINDS = ['skill', 'algorithm', 'dag', 'agent', 'worker'] as const

/** 能力类型。 */
export type CapabilityKind = typeof CAPABILITY_KINDS[number]

/** 一条可在工作台执行的能力。 */
export interface CapabilityOption {
  readonly kind: CapabilityKind
  readonly id: string
  readonly name: string
  readonly description?: string
  /** 元枢为已发布能力声明的入参 schema；缺省时只能使用 JSON 模式。 */
  readonly inputSchema?: Readonly<Record<string, unknown>>
  /** 是否能通过客户执行入口直接运行；resource 型 Skill 为 false，缺省视为可执行。 */
  readonly executable?: boolean
  /** Skill 交互形态；resource 表示由 Agent 装载而不是直接执行。 */
  readonly interactionMode?: string
}

/** 能力选择器中的一个分组。`qa` 是元枢知识问答，不属于后端能力目录。 */
export interface CapabilityGroup {
  readonly kind: CapabilityKind | 'qa'
  readonly items: readonly CapabilityOption[]
}

/** 网关或元枢返回的非 2xx 错误，保留 HTTP 状态供界面区分 401/403/404/429。 */
export class WorkbenchRequestError extends Error {
  /** HTTP status returned by the gateway. */
  readonly status: number
  /** Upstream business error code, when supplied. */
  readonly code: number | string | undefined

  constructor(message: string, status: number, code?: number | string) {
    super(message)
    this.name = 'WorkbenchRequestError'
    this.status = status
    this.code = code
  }
}

/** 判断一个字符串是否是后端能力类型。 */
function isCapabilityKind(value: unknown): value is CapabilityKind {
  return typeof value === 'string' && (CAPABILITY_KINDS as readonly string[]).includes(value)
}

/** 把网关返回的能力载荷整形为工作台选项。
 *
 * 兼容裸数组和 `{ list }` 两种形状；缺少 id 或 name 的行直接丢弃，
 * 因为不可寻址的能力无法被安全执行。未知 kind 也不进入工作台。
 * @param value - Gateway capability list or list envelope.
 * @returns Addressable options with recognized kinds; invalid rows are omitted.
 */
export function toCapabilityOptions(value: unknown): CapabilityOption[] {
  const rows = Array.isArray(value)
    ? value
    : value !== null && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).list)
      ? (value as Record<string, unknown>).list as unknown[]
      : []
  return rows.flatMap((raw): CapabilityOption[] => {
    if (raw === null || typeof raw !== 'object') return []
    const record = raw as Record<string, unknown>
    const kind = record.kind
    const id = record.id
    const name = record.name
    if (!isCapabilityKind(kind)) return []
    if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string' || name.length === 0) return []
    const schema = record.input_schema ?? record.inputSchema
    return [{
      kind,
      id: String(id),
      name,
      ...(typeof record.description === 'string' && record.description.length > 0 ? { description: record.description } : {}),
      ...(schema !== null && typeof schema === 'object' && !Array.isArray(schema)
        ? { inputSchema: schema as Record<string, unknown> }
        : {}),
      executable: record.executable !== false,
      ...(typeof record.interaction_mode === 'string' && record.interaction_mode.length > 0
        ? { interactionMode: record.interaction_mode }
        : {}),
    }]
  })
}

/** 工作台可直接执行的能力类型。Agent/Worker 走对话与守护线程，不在本面板执行。 */
export const RUNNABLE_KINDS = ['skill', 'algorithm', 'dag'] as const

/** 判断能力是否可由工作台直接执行。
 *
 * resource 型 Skill 由 Agent 装载后使用，没有独立执行入口；后端会返回 422，
 * 工作台必须提前识别，避免把必然失败的按钮暴露给用户。
 * @param kind - Capability kind.
 * @param executable - Server execution permission; omitted values allow execution.
 * @returns Whether this kind supports direct execution and is executable.
 */
export function isRunnable(kind: CapabilityKind, executable?: boolean): boolean {
  return (RUNNABLE_KINDS as readonly string[]).includes(kind) && executable !== false
}

/**
 * 选择器 value：`kind:encodeURIComponent(id)`。
 * @param option - Capability whose identifier is encoded.
 * @returns A kind-prefixed selector key.
 */
export function capabilityKey(option: CapabilityOption): string {
  return `${option.kind}:${encodeURIComponent(option.id)}`
}

/**
 * 解析选择器 value；`qa` 与非法值都返回 undefined。
 * @param value - Selector key to decode.
 * @returns Recognized kind and nonempty identifier, or undefined.
 */
export function parseCapabilityKey(value: string): { readonly kind: CapabilityKind; readonly id: string } | undefined {
  const separator = value.indexOf(':')
  if (separator <= 0) return undefined
  const kind = value.slice(0, separator)
  if (!isCapabilityKind(kind)) return undefined
  try {
    const id = decodeURIComponent(value.slice(separator + 1))
    return id.length === 0 ? undefined : { kind, id }
  } catch {
    return undefined
  }
}

/**
 * 按固定顺序分组，始终包含知识问答分组。
 * @param capabilities - Options to group in the fixed display order.
 * @returns The Q&A group followed by nonempty capability groups.
 */
export function groupCapabilities(capabilities: readonly CapabilityOption[]): CapabilityGroup[] {
  const groups: CapabilityGroup[] = [{ kind: 'qa', items: [] }]
  for (const kind of CAPABILITY_KINDS) {
    const items = capabilities.filter(capability => capability.kind === kind)
    if (items.length > 0) groups.push({ kind, items })
  }
  return groups
}

/** JSON 参数校验结果。空输入表示“不携带参数”，不是错误。 */
export type JsonInputResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false }

/**
 * 解析用户输入的能力参数。
 * @param text - User-entered JSON; blank input omits the parameter.
 * @returns Parsed input on success, or a validation failure.
 */
export function parseJsonInput(text: string): JsonInputResult {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch {
    return { ok: false }
  }
}

/**
 * 把任意值渲染成可读文本；字符串保持原样，其余使用两空格缩进 JSON。
 * @param value - Result to display.
 * @returns Unchanged string text, formatted JSON, or a string fallback.
 */
export function formatOutput(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

/**
 * 同步能力返回 `{ result }`，界面只展示业务结果，隐藏传输层包装。
 * @param value - Execution response, optionally wrapped in a result field.
 * @returns Display text for the business result.
 */
export function formatExecutionResult(value: unknown): string {
  if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'result' in value) {
    return formatOutput((value as Record<string, unknown>).result)
  }
  return formatOutput(value)
}

// ── 入参 schema → 基础表单 ─────────────────────────────────────────────────

/** 表单控件的归一类型。`integer` 并入 number，含 enum 的属性按枚举渲染。 */
export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array'

/** 一个可渲染的入参字段。 */
export interface SchemaField {
  readonly name: string
  readonly type: SchemaFieldType
  readonly required: boolean
  readonly description?: string
  readonly enum?: readonly string[]
  readonly default?: unknown
}

/**
 * 把能力入参 schema 展开成表单字段；无法理解的结构返回空数组，退回 JSON 模式。
 * @param schema - Object input schema, when declared by the server.
 * @returns Supported form fields; unsupported schemas produce an empty list.
 */
export function schemaFields(schema: Readonly<Record<string, unknown>> | undefined): SchemaField[] {
  if (schema === undefined) return []
  const declaredType = schema.type
  if (typeof declaredType === 'string' && declaredType !== 'object') return []
  const properties = schema.properties
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return []
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === 'string') : [],
  )
  return Object.entries(properties as Record<string, unknown>).flatMap(([name, raw]): SchemaField[] => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return []
    const definition = raw as Record<string, unknown>
    const enumValues = Array.isArray(definition.enum)
      ? definition.enum.filter((item): item is string | number | boolean => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean').map(String)
      : []
    const rawType = typeof definition.type === 'string' ? definition.type : 'string'
    const type: SchemaFieldType = enumValues.length > 0
      ? 'enum'
      : rawType === 'integer' || rawType === 'number'
        ? 'number'
        : rawType === 'boolean'
          ? 'boolean'
          : rawType === 'object'
            ? 'object'
            : rawType === 'array'
              ? 'array'
              : 'string'
    return [{
      name,
      type,
      required: required.has(name),
      ...(typeof definition.description === 'string' && definition.description.length > 0 ? { description: definition.description } : {}),
      ...(enumValues.length > 0 ? { enum: enumValues } : {}),
      ...('default' in definition ? { default: definition.default } : {}),
    }]
  })
}

/**
 * 按 schema 默认值初始化表单；复杂类型序列化成 JSON 文本。
 * @param fields - Schema fields with optional defaults.
 * @returns Editable text for nonnull defaults.
 */
export function buildFieldValues(fields: readonly SchemaField[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    if (field.default === undefined || field.default === null) continue
    values[field.name] = formatOutput(field.default)
  }
  return values
}

/** 表单输入的构造结果。 */
export type SchemaInputResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false }

/**
 * 把表单值还原成能力参数；空值视为“不提交该字段”。
 * @param fields - Schema fields describing the controls.
 * @param values - Editable text keyed by field name.
 * @returns Submitted nonblank fields, or a validation failure.
 */
export function buildSchemaInput(fields: readonly SchemaField[], values: Readonly<Record<string, string>>): SchemaInputResult {
  const input: Record<string, unknown> = {}
  for (const field of fields) {
    const raw = (values[field.name] ?? '').trim()
    if (raw.length === 0) continue
    switch (field.type) {
      case 'number': {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) return { ok: false }
        input[field.name] = parsed
        break
      }
      case 'boolean': {
        if (raw !== 'true' && raw !== 'false') return { ok: false }
        input[field.name] = raw === 'true'
        break
      }
      case 'object':
      case 'array': {
        try {
          input[field.name] = JSON.parse(raw)
        } catch {
          return { ok: false }
        }
        break
      }
      case 'enum':
      case 'string':
      default:
        input[field.name] = raw
    }
  }
  return { ok: true, value: input }
}

// ── DAG 运行时间线 ─────────────────────────────────────────────────────────

/**
 * 从 DAG 调用响应中取出执行 ID；缺失时界面只能展示原始结果。
 * @param value - DAG invocation response.
 * @returns Execution identifier, or undefined when absent.
 */
export function extractExecutionId(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const direct = record.execution_id
  if (typeof direct === 'string' && direct.length > 0) return direct
  if (typeof direct === 'number') return String(direct)
  const data = record.data ?? record.execution ?? record.run
  if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
    return extractExecutionId(data)
  }
  return undefined
}

/** 兼容裸数组与 `{ list }` 的分页载荷。 */
function pageRows(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  if (value !== null && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).list)) {
    return (value as Record<string, unknown>).list as unknown[]
  }
  return []
}

/**
 * 在运行历史里按 execution_id 找到历史行 ID，供详情接口使用。
 * @param history - DAG history list or list envelope.
 * @param executionId - Execution identifier to match.
 * @returns Matching history identifier, or undefined.
 */
export function findHistoryId(history: unknown, executionId: string | undefined): string | undefined {
  if (executionId === undefined) return undefined
  for (const row of pageRows(history)) {
    if (row === null || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    if (record.execution_id !== executionId) continue
    if (typeof record.id === 'number') return String(record.id)
    if (typeof record.id === 'string' && record.id.length > 0) return record.id
  }
  return undefined
}

/** 节点时间线的一行。 */
export interface RunTimelineNode {
  readonly nodeId: string
  readonly label: string
  readonly type: string
  readonly status: string
  readonly durationMs: number
  readonly startedAt: string
  readonly error?: string
}

/** 一次 DAG 运行的时间线。 */
export interface RunTimeline {
  readonly id: string
  readonly status: string
  readonly executionId: string
  readonly durationMs: number
  readonly createdAt: string
  readonly nodes: readonly RunTimelineNode[]
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/**
 * 把运行详情整形为按开始时间排序的节点时间线；结构不可用时返回 undefined。
 * @param detail - DAG history detail returned by the gateway.
 * @returns Display fields with nodes sorted by start time, or undefined for invalid detail.
 */
export function toRunTimeline(detail: unknown): RunTimeline | undefined {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return undefined
  const record = detail as Record<string, unknown>
  const nodes: RunTimelineNode[] = pageRows(record.node_executions).flatMap((raw): RunTimelineNode[] => {
    if (raw === null || typeof raw !== 'object') return []
    const node = raw as Record<string, unknown>
    const nodeId = asString(node.node_id)
    if (nodeId.length === 0) return []
    const duration = typeof node.duration_ms === 'number' && Number.isFinite(node.duration_ms) ? node.duration_ms : 0
    return [{
      nodeId,
      label: asString(node.node_label) || nodeId,
      type: asString(node.node_type),
      status: asString(node.status),
      durationMs: duration,
      startedAt: asString(node.started_at),
      ...(typeof node.error === 'string' && node.error.length > 0 ? { error: node.error } : {}),
    }]
  })
  nodes.sort((left, right) => {
    if (left.startedAt === right.startedAt) return 0
    if (left.startedAt.length === 0) return 1
    if (right.startedAt.length === 0) return -1
    return left.startedAt.localeCompare(right.startedAt)
  })
  return {
    id: asString(record.id),
    status: asString(record.status),
    executionId: asString(record.execution_id),
    durationMs: typeof record.duration_ms === 'number' && Number.isFinite(record.duration_ms) ? record.duration_ms : 0,
    createdAt: asString(record.created_at),
    nodes,
  }
}

// ── 算法历史 ───────────────────────────────────────────────────────────────

/** 算法执行历史的一行。 */
export interface AlgorithmExecutionRow {
  readonly id: string
  readonly status: string
  readonly createdAt: string
  readonly durationMs: number
  readonly error?: string
}

/**
 * 把算法历史响应整形为可展示的执行记录列表。
 * @param history - Algorithm execution list or list envelope.
 * @returns Display fields for addressable execution rows.
 */
export function toAlgorithmExecutionRows(history: unknown): AlgorithmExecutionRow[] {
  return pageRows(history).flatMap((raw): AlgorithmExecutionRow[] => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return []
    const record = raw as Record<string, unknown>
    const id = asString(record.id)
    if (id.length === 0) return []
    return [{
      id,
      status: asString(record.status),
      createdAt: asString(record.created_at),
      durationMs: typeof record.duration_ms === 'number' && Number.isFinite(record.duration_ms) ? record.duration_ms : 0,
      ...(typeof record.error_message === 'string' && record.error_message.length > 0 ? { error: record.error_message } : {}),
    }]
  })
}

/** 失败语义。`invisible` 对应元枢的 404：能力不存在或当前账号不可见。 */
export type FailureKind = 'unauthorized' | 'forbidden' | 'invisible' | 'rateLimited' | 'unavailable' | 'failed'

/** 一次失败的分类结果。 */
export interface Failure {
  readonly kind: FailureKind
  readonly status?: number
  readonly message?: string
}

/** 从错误对象中读取 HTTP 状态，不依赖具体错误类。 */
function errorStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== 'object') return undefined
  const status = (error as Record<string, unknown>).status
  return typeof status === 'number' && Number.isFinite(status) ? status : undefined
}

/**
 * 失败语义到字典键的映射，问答与能力运行共用。
 * @param error - Request failure, optionally carrying an HTTP status.
 * @returns Locale key for the failure category.
 */
export function failureKey(error: unknown): 'loginRequired' | 'permissionDenied' | 'capabilityInvisible' | 'rateLimited' | 'requestFailed' {
  switch (describeFailure(error).kind) {
    case 'unauthorized': return 'loginRequired'
    case 'forbidden': return 'permissionDenied'
    case 'invisible': return 'capabilityInvisible'
    case 'rateLimited': return 'rateLimited'
    case 'unavailable':
    case 'failed':
    default: return 'requestFailed'
  }
}

/**
 * 把错误映射为稳定的失败语义，供界面选择提示文案。
 * @param error - Request failure, optionally carrying an HTTP status.
 * @returns Failure category and available diagnostic fields.
 */
export function describeFailure(error: unknown): Failure {
  const status = errorStatus(error)
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : undefined
  const base = {
    ...(status === undefined ? {} : { status }),
    ...(message === undefined || message.length === 0 ? {} : { message }),
  }
  if (status === 401) return { kind: 'unauthorized', ...base }
  if (status === 403) return { kind: 'forbidden', ...base }
  if (status === 404) return { kind: 'invisible', ...base }
  if (status === 429) return { kind: 'rateLimited', ...base }
  if (status !== undefined && status >= 500) return { kind: 'unavailable', ...base }
  return { kind: 'failed', ...base }
}

// ── Workbench navigation & read-only catalogs ─────────────────────────────

/** 工作台左侧导航分组顺序。`home` 是元枢岗位工作台首页。 */
export const WORKBENCH_SECTIONS = [
  'home', 'qa', 'knowledge', 'overview', 'ontology', 'skill', 'algorithm', 'scenario', 'dag',
] as const

/** 工作台左侧导航分组。 */
export type WorkbenchSection = typeof WORKBENCH_SECTIONS[number]

/**
 * 把后端能力类型映射到工作台分组。
 * @param kind - Capability kind returned by the server.
 * @returns Owning workbench section.
 */
export function sectionForCapabilityKind(kind: CapabilityKind): WorkbenchSection {
  switch (kind) {
    case 'skill': return 'skill'
    case 'algorithm': return 'algorithm'
    case 'dag': return 'dag'
    case 'agent':
    case 'worker': return 'scenario'
  }
}

/** 只读目录中的一行。 */
export interface CatalogRow {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly status?: string
}

function stringField(record: Record<string, unknown>, ...keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

/**
 * 把元枢只读目录载荷整形为列表行。
 *
 * 兼容裸数组与 `{ list }` / `{ items }` / `{ data }` 信封；缺失字段的行
 * 直接丢弃，不凭空编造条目。
 * @param value - Catalog list or supported list envelope.
 * @returns Rows with an identifier or name; unusable rows are omitted.
 */
export function toCatalogRows(value: unknown): readonly CatalogRow[] {
  const envelope = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  const items = Array.isArray(value)
    ? value
    : Array.isArray(envelope?.list)
      ? envelope.list
      : Array.isArray(envelope?.items)
        ? envelope.items
        : Array.isArray(envelope?.data)
          ? envelope.data
          : []
  const rows: CatalogRow[] = []
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const id = stringField(record, 'id', 'key', 'space_id', 'collection_id', 'code')
    const name = stringField(record, 'name', 'title', 'label', 'code')
    if (id === undefined && name === undefined) continue
    const description = stringField(record, 'description', 'summary', 'remark')
    const status = stringField(record, 'status', 'state')
    rows.push({
      id: id ?? name as string,
      name: name ?? id as string,
      ...(description === undefined ? {} : { description }),
      ...(status === undefined ? {} : { status }),
    })
  }
  return rows
}

/**
 * 把任意概览载荷压平成可展示的键值对。
 * @param value - Overview response object.
 * @returns Top-level scalar fields formatted for display.
 */
export function toOverviewEntries(value: unknown): readonly { label: string; value: string }[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const entries: { label: string; value: string }[] = []
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      entries.push({ label: key, value: String(raw) })
    }
  }
  return entries
}
