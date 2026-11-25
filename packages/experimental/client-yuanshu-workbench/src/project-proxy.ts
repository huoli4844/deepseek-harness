/** 映射工作台的项目业务路由，限定路径和方法，不访问网络。 */

const prefix = '/yuanshu-workbench/projects'
const routePattern = /^\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\/(labor-hours|tasks)(?:\/([1-9]\d*))?(\/submit)?$/u

/** 解析项目业务路径。未知路径返回空值，已知路径保留允许的方法供代理校验。 */
export function projectProxyRoute(pathname: string): { readonly path: string; readonly methods: readonly string[] } | undefined {
  if (pathname === prefix) return { path: '/api/v1/apps/shaoshi/projects', methods: ['GET'] }
  // 周报按用户每周一份，不再挂在项目路径下。
  if (pathname === '/yuanshu-workbench/weekly-reports') {
    return { path: '/api/v1/apps/deepseek-harness/weekly-reports', methods: ['GET', 'PUT'] }
  }
  if (pathname === '/yuanshu-workbench/weekly-reports/submit') {
    return { path: '/api/v1/apps/deepseek-harness/weekly-reports/submit', methods: ['POST'] }
  }
  if (!pathname.startsWith(prefix + '/')) return undefined
  const match = routePattern.exec(pathname.slice(prefix.length))
  if (match === null) return undefined
  const [, code, resource, id, submit] = match
  if (resource === 'tasks') {
    if (id !== undefined || submit !== undefined) return undefined
    return { path: `/api/v1/apps/shaoshi/projects/${code}/tasks`, methods: ['GET'] }
  }
  if (submit !== undefined && id === undefined) return undefined
  return {
    path: `/api/v1/apps/shaoshi${pathname.slice('/yuanshu-workbench'.length)}`,
    methods: submit !== undefined ? ['POST'] : id !== undefined ? ['PUT'] : ['GET', 'POST'],
  }
}
