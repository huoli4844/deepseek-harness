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
  if (resource === 'meeting-rooms') return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  // 带资源 ID 的 POST 仅用于预约取消（/meeting-room-bookings/{id}/cancel）。
  if (resource === 'meeting-room-bookings') return hasId ? method === 'POST' : method === 'GET' || method === 'POST'
  // 用户任职与线上 user-positions 模块对齐：集合支持查询与创建，单项支持更新与删除。
  if (resource === 'user-positions') return hasId ? method === 'PUT' || method === 'DELETE' : method === 'GET' || method === 'POST'
  return !hasId && (method === 'GET' || (resource === 'material-categories' && method === 'POST'))
}
