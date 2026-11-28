/** 只读查询目录的类型定义与响应裁剪，不发起请求。 */

/** 目录中声明的单个请求参数。 */
export interface ApiParam {
  /** 参数名，调用时原样回传。 */
  readonly name: string
  /** 参数位置：路径参数必须提供，查询参数按需提供。 */
  readonly in: 'path' | 'query'
  /** OpenAPI 声明的类型，用于调用前的取值校验。 */
  readonly type: string
  /** 是否必填；路径参数恒为 true。 */
  readonly required: boolean
  /** 契约中的中文说明，用于帮助模型选择取值。 */
  readonly description: string
}

/** 目录中声明的响应记录字段中文说明。 */
export interface ApiField {
  /** 字段名，与返回记录的键一致。 */
  readonly name: string
  /** 契约中的中文说明，用于界面展示。 */
  readonly description: string
}

/** 目录中的一个只读 GET 接口。 */
export interface ApiCatalogEntry {
  /** 接口路径，含 `{name}` 形式的路径参数占位。 */
  readonly path: string
  /** 接口中文说明，来自 Swagger summary。 */
  readonly summary: string
  /** 所属模块，用于按业务域筛选。 */
  readonly tag: string
  /** 路径与查询参数，不含鉴权相关请求头。 */
  readonly params: readonly ApiParam[]
  /** 响应记录字段的中文说明，用于界面标签；无说明字段时为空。 */
  readonly fields: readonly ApiField[]
}

/** 单次查询允许返回的最大记录数。 */
export const MAX_QUERY_LIMIT = 50
/** 默认返回的记录数。 */
export const DEFAULT_QUERY_LIMIT = 20
/** 单次查询输出的最大字符数，超出时截断并说明。 */
export const MAX_QUERY_CHARS = 12_000

/**
 * 按条数与字符预算裁剪后台响应，避免把整库数据灌进上下文。
 * @param payload - 后台返回的 `data` 字段。
 * @param limit - 允许返回的最大记录数。
 * @returns 模型可读的 JSON 文本。
 */
export function trimApiResponse(payload: unknown, limit: number): string {
  const bounded = Math.min(Math.max(limit, 1), MAX_QUERY_LIMIT)
  const candidate: unknown = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'items') : undefined
  const rows: readonly unknown[] | undefined = Array.isArray(candidate) ? candidate : undefined
  if (rows === undefined) return clipText(JSON.stringify(payload ?? null))
  const total: unknown = Array.isArray(payload) ? rows.length
    : typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'total') : undefined
  const body = JSON.stringify({
    total: typeof total === 'number' ? total : undefined,
    returned: Math.min(rows.length, bounded),
    truncated: rows.length > bounded,
    items: rows.slice(0, bounded),
  })
  return clipText(body)
}

/**
 * 超长文本截断，并明确告知截断事实与继续收窄的方向。
 * @param value - 待输出文本。
 * @returns 不超过字符预算的文本。
 */
export function clipText(value: string): string {
  if (value.length <= MAX_QUERY_CHARS) return value
  return `${value.slice(0, MAX_QUERY_CHARS)}\n…（结果过大已截断，请增加筛选条件或减少返回条数）`
}

/** 参数校验结果：通过时给出待拼接的键值对，失败时给出原因。 */
export type ParamEncoding = { readonly ok: true; readonly pairs: readonly (readonly [string, string])[] }
  | { readonly ok: false; readonly reason: string }

/**
 * 校验并按类型序列化参数值，数组用逗号分隔后重复传递。
 * @param param - 目录中声明的参数。
 * @param raw - 模型提供的原始值。
 * @returns 校验通过时返回待拼接的键值对，失败时返回错误说明。
 */
export function encodeParam(param: ApiParam, raw: string): ParamEncoding {
  if (param.type === 'integer' && !/^-?\d+$/u.test(raw)) return { ok: false, reason: `参数 ${param.name} 需要整数` }
  if (param.type === 'number' && !/^-?\d+(?:\.\d+)?$/u.test(raw)) return { ok: false, reason: `参数 ${param.name} 需要数字` }
  if (param.type === 'boolean' && raw !== 'true' && raw !== 'false') return { ok: false, reason: `参数 ${param.name} 需要 true 或 false` }
  if (param.type === 'array') {
    const values = raw.split(',').map(item => item.trim()).filter(item => item !== '')
    if (values.length === 0) return { ok: false, reason: `参数 ${param.name} 需要至少一个值` }
    return { ok: true, pairs: values.map(value => [param.name, value] as const) }
  }
  return { ok: true, pairs: [[param.name, raw]] }
}
