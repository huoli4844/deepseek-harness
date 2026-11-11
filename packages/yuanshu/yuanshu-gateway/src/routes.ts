import { YuanShuError } from '@deepseek-ai/dsh-yuanshu-client'

/** 客户端请求本身不合法（不是元枢返回的错误）。 */
export class GatewayRequestError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'GatewayRequestError'
    this.status = status
  }
}

interface RouteRule {
  readonly path: RegExp
  readonly methods: readonly string[]
}

/** 精确路径转换成正则，避免手写转义遗漏。 */
function exact(path: string): RegExp {
  return new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u')
}

/**
 * 网关路由表。每条路由同时固定允许的 HTTP 方法，避免把同源代理变成通用隧道。
 *
 * 新增能力必须显式登记；带路径参数的路由只允许明确列出的形状，不使用
 * `startsWith`，防止 `/execute-anything`、`/knowledges/../../admin` 一类路径穿透。
 */
const ROUTES: readonly RouteRule[] = [
  // Worker API
  { path: exact('/capabilities'), methods: ['GET'] },
  { path: exact('/tenants'), methods: ['GET'] },
  { path: exact('/user/me'), methods: ['GET'] },
  { path: exact('/login'), methods: ['POST'] },
  { path: exact('/execute'), methods: ['POST'] },
  { path: exact('/execute-stream'), methods: ['POST'] },
  // Knowledge Q&A
  { path: exact('/qa/ask'), methods: ['POST'] },
  { path: exact('/qa/ask/stream'), methods: ['POST'] },
  { path: exact('/qa/sessions'), methods: ['GET'] },
  { path: exact('/qa/readiness'), methods: ['GET'] },
  { path: exact('/knowledges'), methods: ['GET'] },
  { path: /^\/knowledges\/\d+$/u, methods: ['GET'] },
  // Workbench profile & home (role projection computed by YuanShu)
  { path: exact('/workbench/profile'), methods: ['GET'] },
  { path: exact('/workbench/home'), methods: ['GET'] },
  // Workbench catalogs (read-only)
  { path: exact('/ontology/overview'), methods: ['GET'] },
  { path: exact('/ontology/spaces'), methods: ['GET'] },
  { path: exact('/ontology/collections'), methods: ['GET'] },
  { path: exact('/ontology/releases'), methods: ['GET'] },
  { path: exact('/scenarios'), methods: ['GET'] },
  // Capability execution
  { path: /^\/skills\/[^/]+\/execute$/u, methods: ['POST'] },
  { path: /^\/skills\/[^/]+\/executions$/u, methods: ['POST'] },
  { path: /^\/algorithms\/[^/]+\/execute$/u, methods: ['POST'] },
  { path: /^\/algorithms\/[^/]+\/executions$/u, methods: ['POST', 'GET'] },
  { path: /^\/dag\/definitions\/[^/]+\/invoke$/u, methods: ['POST'] },
  { path: exact('/dag/history'), methods: ['GET'] },
  { path: /^\/dag\/history\/[^/]+$/u, methods: ['GET'] },
]

/** 去掉前缀后的路径允许使用的方法；未登记路由返回 undefined。 */
export function allowedMethods(path: string): readonly string[] | undefined {
  return ROUTES.find(rule => rule.path.test(path))?.methods
}

/** 判断去掉前缀后的路径是否允许代理到元枢。 */
export function isAllowedRoute(path: string): boolean {
  return allowedMethods(path) !== undefined
}

/**
 * 把错误映射为网关响应状态。
 *
 * 401/403/404/429 必须原样透传：登录失效、能力不可见和限流是三种不同的
 * 客户端行为；统一 502 会让界面误判为网关故障并触发无意义重试。
 */
export function errorStatus(error: unknown): number {
  if (error instanceof YuanShuError) return error.status
  if (error instanceof GatewayRequestError) return error.status
  if (error instanceof SyntaxError) return 400
  return 502
}

/** 生成稳定错误体，保留元枢业务错误码。 */
export function errorBody(error: unknown): { error: string; code?: number | string } {
  if (error instanceof YuanShuError) {
    return error.code === undefined ? { error: error.message } : { error: error.message, code: error.code }
  }
  return { error: error instanceof Error ? error.message : String(error) }
}
