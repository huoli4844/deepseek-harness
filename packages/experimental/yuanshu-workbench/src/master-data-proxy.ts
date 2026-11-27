/**
 * 限定少仕主数据代理允许的方法，避免前端通过同源代理访问未开放的后台写操作。
 * 只放行云端仍在服务且已接入的资源；已下线的合同与会议室资源一律拒绝。
 */
/** 判断少仕主数据资源的 HTTP 方法是否可由工作台代理。 */
export function shaoshiMasterMethodAllowed(resource: string, method: string, hasId: boolean): boolean {
  if (resource === 'customers' || resource === 'suppliers') {
    return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  }
  if (resource === 'materials') return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET'
  if (resource === 'material-categories') return !hasId && (method === 'GET' || method === 'POST')
  if (resource === 'supplier-categories') return !hasId && method === 'GET'
  if (resource === 'equipments') return hasId ? method === 'GET' || method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  if (resource === 'onboarding-tasks') return !hasId && (method === 'GET' || method === 'POST')
  // 用户任职与线上 user-positions 模块对齐：集合支持查询与创建，单项支持更新与删除。
  if (resource === 'user-positions') return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  return false
}
