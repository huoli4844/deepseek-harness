/** 映射工作台的组织架构路由，限定路径和方法，不访问网络。 */

/** 组织架构查询接口：转发到本地后台后由后台携带同一凭证访问元枢。 */
export const ORGANIZATION_ROUTES: Readonly<Record<string, string>> = {
  '/yuanshu-workbench/organization/departments/tree': '/api/v1/departments/tree',
  '/yuanshu-workbench/organization/roles': '/api/v1/roles',
  '/yuanshu-workbench/organization/users': '/api/v1/users',
}

/** 组织成员写接口路径：按可选后缀转发到本地后台 /api/v1/users/{id}(/status|/roles)。 */
const ORGANIZATION_USER_WRITE_PATTERN = /^\/yuanshu-workbench\/organization\/users\/(\d+)(?:\/(status|roles))?$/u

/** 成员写接口允许的方法：status 仅 PUT，roles 仅 POST，无后缀支持 PUT/DELETE。 */
export function organizationWriteMethod(suffix: string | undefined, method: string): boolean {
  if (suffix === 'status') return method === 'PUT'
  if (suffix === 'roles') return method === 'POST'
  return method === 'PUT' || method === 'DELETE'
}

/** 路由决策：read 是同方法查询转发；write 是成员写转发；method 是方法不匹配；未匹配返回 undefined。 */
export type OrganizationProxyDecision =
  | { readonly type: 'read' | 'write'; readonly remote: string }
  | { readonly type: 'method'; readonly allow: string }

/**
 * 解析组织架构代理路径与请求方法。
 * GET 查询走固定路由表；成员写接口按数字 ID 与可选 status/roles 后缀转发；
 * 未知路径返回 undefined，方法不匹配返回 method 决策供代理回复 405。
 */
export function organizationProxyRoute(pathname: string, method: string): OrganizationProxyDecision | undefined {
  const userWrite = ORGANIZATION_USER_WRITE_PATTERN.exec(pathname)
  if (userWrite === null) {
    const target = ORGANIZATION_ROUTES[pathname]
    if (target === undefined) return undefined
    if (method !== 'GET') return { type: 'method', allow: 'GET' }
    return { type: 'read', remote: target }
  }
  const [, userID, suffix] = userWrite
  if (!organizationWriteMethod(suffix, method)) return { type: 'method', allow: 'PUT, POST, DELETE' }
  const suffixPath = suffix === undefined ? '' : `/${suffix}`
  return { type: 'write', remote: `/api/v1/users/${userID}${suffixPath}` }
}
