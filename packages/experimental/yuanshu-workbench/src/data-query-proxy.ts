/** 数据卡片查询代理：只转发数据目录登记过的只读 GET 接口，注入员工凭证并裁剪响应。 */
import type { Context } from '@deepseek-ai/cordis'
import { API_CATALOG } from './api-catalog/catalog.generated.ts'
import { buildApiUrl, ApiQueryError } from './api-catalog/query.ts'
import type { ApiCatalogEntry } from './api-catalog/model.ts'

/** 路由前缀。 */
const BASE = '/yuanshu-workbench/data-query'

/** 单次返回的最大记录数，与目录查询工具一致。 */
const MAX_LIMIT = 50

/** 响应体字符上限，防止超大对象拖垮页面。 */
const MAX_RESPONSE_CHARS = 200_000

/**
 * 按路径精确匹配目录条目；草稿必须保存目录原始路径（可含 {name} 占位符）。
 * @param path - 请求指定的后台路径。
 * @returns 匹配的目录条目；未登记时返回 undefined。
 */
function matchCatalogEntry(path: string): ApiCatalogEntry | undefined {
  return API_CATALOG.find(entry => entry.path === path)
}

/**
 * 裁剪后台 data：分页结构保留 total 与前 limit 条，裸数组同理，其余原样返回。
 * @param data - 后台返回的 data 字段。
 * @param limit - 允许返回的记录数。
 * @returns 形状化后的数据。
 */
function shapeData(data: unknown, limit: number): unknown {
  const rows = Array.isArray(data) ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : undefined
  if (rows === undefined) return data
  const total = Array.isArray(data) ? rows.length
    : (data as { total?: unknown }).total
  return {
    total: typeof total === 'number' ? total : rows.length,
    items: rows.slice(0, limit),
  }
}

/**
 * 提取后台失败响应中的可展示说明，避免弹窗里只出现笼统的「加载失败」。
 * @param status - 后台 HTTP 状态码。
 * @param json - 后台响应体。
 * @returns 员工可读的错误文本。
 */
function upstreamError(status: number, json: unknown): string {
  const detail = typeof json === 'object' && json !== null
    ? (json as { message?: unknown; error?: unknown }).message ?? (json as { error?: unknown }).error : undefined
  if (typeof detail === 'string' && detail.trim() !== '' && detail.length <= 200
    && !/[<>\p{Cc}]|https?:\/\//iu.test(detail)) return detail.trim()
  return status === 401 ? '登录状态已失效，请重新登录后重试'
    : status === 403 ? '当前账号没有该数据的查询权限'
      : status === 404 ? '没有找到对应的数据或接口'
        : `后台查询失败（HTTP ${status}）`
}

/**
 * 注册数据卡片查询端点；要求 Bearer 头，仅 GET，路径必须在只读目录中登记。
 * @param scope - 已注入 webServer 的上下文。
 * @param api - 后台服务地址。
 */
export function registerDataQueryRoute(scope: Context, api: string): void {
  scope.effect(() => scope.webServer.register({
    kind: 'prefix',
    path: BASE,
    auth: 'required',
    async handler(req, res) {
      const send = (status: number, payload?: object): void => {
        res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json' })
        res.end(payload === undefined ? undefined : JSON.stringify(payload))
      }
      const authorization = req.headers.authorization
      if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
        send(401)
        return
      }
      if (req.method !== 'GET' || req.headers['sec-fetch-site'] !== 'same-origin') {
        send(403)
        return
      }
      const incoming = new URL(req.url ?? '/', 'http://localhost')
      try {
        const target = incoming.searchParams.get('path')
        if (target === null || !target.startsWith('/api/v1/')) {
          send(400, { error: '缺少接口路径' })
          return
        }
        const entry = matchCatalogEntry(target)
        if (entry === undefined) {
          send(404, { error: '接口不在只读数据目录中' })
          return
        }
        const limit = Math.min(Math.max(Number(incoming.searchParams.get('limit') ?? '20') || 20, 1), MAX_LIMIT)
        // 模型常附加分页等目录未声明的参数：直接忽略而不是拒绝，避免卡片无谓失败。
        const declared = new Set(entry.params.map(param => param.name))
        const params: Record<string, string> = {}
        for (const [name, value] of incoming.searchParams) {
          if (name === 'path' || name === 'limit') continue
          if (!declared.has(name)) {
            scope.logger.warn(`yuanshu: data query 忽略未声明参数 ${name}（${target}）`)
            continue
          }
          params[name] = value
        }
        // 路径参数与查询参数统一交给目录校验器拼接，缺必填参数时直接拒绝。
        const built = buildApiUrl(entry, params)
        const remote = new URL(built.path, api)
        for (const [name, value] of built.query) remote.searchParams.append(name, value)
        const headers: Record<string, string> = { authorization, accept: 'application/json' }
        const tenant = req.headers['x-active-tenant']
        if (typeof tenant === 'string' && tenant !== '') headers['X-Active-Tenant'] = tenant
        const response = await fetch(remote, {
          method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(20_000),
        })
        const json: unknown = await response.json().catch(() => undefined)
        if (!response.ok || (typeof json === 'object' && json !== null
          && (json as { success?: unknown }).success === false)) {
          send(response.status === 0 ? 502 : response.status, { error: upstreamError(response.status, json) })
          return
        }
        const data = typeof json === 'object' && json !== null && 'data' in json
          ? (json as { data?: unknown }).data : json
        // 随数据下发目录字段说明，供页面把英文字段名渲染成中文标签。
        const labels = Object.fromEntries(entry.fields.map(field => [field.name, field.description]))
        const payload = JSON.stringify({ data: shapeData(data, limit), labels })
        if (payload.length > MAX_RESPONSE_CHARS) {
          send(502, { error: '响应内容过大，请增加筛选条件' })
          return
        }
        send(200, JSON.parse(payload) as object)
      } catch (error) {
        if (error instanceof ApiQueryError) {
          send(error.status, { error: error.message })
          return
        }
        send(502, { error: '数据卡片查询失败' })
      }
    },
  }), 'yuanshu: data query proxy')
}
