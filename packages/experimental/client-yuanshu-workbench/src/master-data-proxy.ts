/**
 * 限定少仕主数据代理允许的方法，避免前端通过同源代理访问未开放的后台写操作。
 * 纯粹依据资源、HTTP 方法和资源 ID 状态判断，不处理请求内容或身份。
 */
/** 判断少仕主数据资源的 HTTP 方法是否可由工作台代理。 */
export function shaoshiMasterMethodAllowed(resource: string, method: string, hasId: boolean): boolean {
  if (resource === 'customers' || resource === 'suppliers') {
    return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  }
  if (resource === 'weekly-reports') return !hasId && (method === 'GET' || method === 'PUT')
  if (resource === 'materials') return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET'
  if (resource === 'equipments') return hasId ? method === 'GET' || method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  if (resource === 'contracts') return !hasId && method === 'GET'
  return !hasId && (method === 'GET' || (resource === 'material-categories' && method === 'POST'))
}
