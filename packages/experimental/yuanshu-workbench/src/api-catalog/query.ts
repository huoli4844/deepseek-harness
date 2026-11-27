/** 只读查询执行：按目录校验参数、注入员工凭证、裁剪响应；不依赖模型或界面。 */
import type { ApiCatalogEntry } from './model.ts'
import { encodeParam, trimApiResponse } from './model.ts'

/** 当前会话已核实的员工凭证。 */
export interface ApiCredential {
  /** 员工访问令牌，只在宿主内使用，不返回给模型。 */
  readonly authorization: string
  /** 当前租户标识。 */
  readonly tenant: string
}

/** 查询失败时携带可映射给用户的状态码。 */
export class ApiQueryError extends Error {
  /**
   * @param status - 建议对用户呈现的状态码。
   * @param message - 面向员工的中文说明。
   */
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** 一次查询的输入。 */
export interface ApiQueryOptions {
  /** 后台服务地址。 */
  readonly api: string
  /** 目录条目，决定路径与允许的参数。 */
  readonly entry: ApiCatalogEntry
  /** 模型提供的参数值，仅允许目录声明过的名称。 */
  readonly params: Readonly<Record<string, string>>
  /** 允许返回的最大记录数。 */
  readonly limit: number
  /** 员工凭证。 */
  readonly credential: ApiCredential
  /** 调用方取消信号。 */
  readonly signal: AbortSignal
  /** 可注入的 fetch，便于测试。 */
  readonly request?: typeof fetch
}

/** 单次查询的后台超时，避免工具长期挂起。 */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * 按目录路径与声明参数拼出请求地址。
 * @param entry - 目录条目。
 * @param params - 模型提供的参数。
 * @returns 完整地址与待附加的查询参数。
 * @throws ApiQueryError 参数缺失、未知或类型不符。
 */
export function buildApiUrl(entry: ApiCatalogEntry, params: Readonly<Record<string, string>>): {
  readonly path: string
  readonly query: readonly (readonly [string, string])[]
} {
  const declared = new Map(entry.params.map(param => [param.name, param]))
  for (const name of Object.keys(params)) {
    if (!declared.has(name)) {
      const allowed = entry.params.map(param => param.name).join('、') || '无'
      throw new ApiQueryError(400, `接口没有参数 ${name}；可用参数：${allowed}`)
    }
  }
  let path = entry.path
  const query: (readonly [string, string])[] = []
  for (const param of entry.params) {
    const raw = params[param.name]
    if (raw === undefined || raw === '') {
      if (param.required) throw new ApiQueryError(400, `缺少必填参数 ${param.name}${param.description === '' ? '' : `（${param.description}）`}`)
      continue
    }
    const encoded = encodeParam(param, raw)
    if (!encoded.ok) throw new ApiQueryError(400, encoded.reason)
    if (param.in === 'path') {
      const pair = encoded.pairs[0]
      if (encoded.pairs.length !== 1 || pair === undefined) throw new ApiQueryError(400, `路径参数 ${param.name} 只能有一个值`)
      path = path.replace(`{${param.name}}`, encodeURIComponent(pair[1]))
    } else {
      query.push(...encoded.pairs)
    }
  }
  const missing = [...path.matchAll(/\{(\w+)\}/gu)].map(match => match[1])
  if (missing.length > 0) throw new ApiQueryError(400, `缺少必填参数 ${missing.join('、')}`)
  return { path, query }
}

/**
 * 执行一次只读查询，返回已裁剪的 JSON 文本。
 * @param options - 查询输入。
 * @returns 模型可读的响应文本。
 * @throws ApiQueryError 参数不合法、无权限或后台失败。
 */
export async function queryApi(options: ApiQueryOptions): Promise<string> {
  const { path, query } = buildApiUrl(options.entry, options.params)
  const url = new URL(path, options.api)
  for (const [name, value] of query) url.searchParams.append(name, value)
  const headers: Record<string, string> = { authorization: options.credential.authorization, accept: 'application/json' }
  if (options.credential.tenant !== '') headers['X-Active-Tenant'] = options.credential.tenant
  const response = await (options.request ?? fetch)(url, {
    method: 'GET',
    redirect: 'error',
    headers,
    signal: AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
  })
  const json: unknown = await response.json().catch(() => null)
  const business = field(json, 'code')
  if (!response.ok || field(json, 'success') === false
    || (business !== undefined && ![0, 200, 201, '0', '200', '201'].includes(business as number | string))) {
    throw failure(response.status, json)
  }
  const data = field(json, 'data')
  if (data === null) return '（没有数据）'
  return trimApiResponse(data === undefined ? json : data, options.limit)
}

/**
 * 把后台失败映射成员工可理解的中文说明，避免泄露技术细节。
 * @param status - HTTP 状态码。
 * @param json - 后台响应体。
 * @returns 查询错误。
 */
function failure(status: number, json: unknown): ApiQueryError {
  const detail = field(json, 'message') ?? field(json, 'error')
  const safe = typeof detail === 'string' && detail.trim() !== '' && detail.length <= 300
    && !/[<>\p{Cc}]|https?:\/\/|\bbearer\b|\bSQLSTATE\b/iu.test(detail) ? detail.trim() : undefined
  if (status === 401) return new ApiQueryError(401, '登录状态已失效，请重新登录元枢后重试')
  if (status === 403) return new ApiQueryError(403, safe ?? '当前账号没有该数据的查询权限')
  if (status === 404) return new ApiQueryError(404, safe ?? '没有找到对应的数据或接口')
  if (status === 429) return new ApiQueryError(429, '查询过于频繁，请稍后再试')
  return new ApiQueryError(502, safe ?? `后台查询失败（HTTP ${status}）`)
}

/**
 * 读取对象字段；非对象或缺少该字段时返回 undefined。
 * @param value - 待读取的值。
 * @param key - 字段名。
 * @returns 字段值。
 */
function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}
