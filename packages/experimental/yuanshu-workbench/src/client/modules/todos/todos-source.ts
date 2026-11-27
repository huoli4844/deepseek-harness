/** 待办数据层：唯一的网络入口，复用工作台的登录令牌与租户头。 */
import type { TodoItem, TodoPatch } from './todos-model.ts'

const BASE = '/yuanshu-workbench/todos'

/**
 * 组装请求头；缺少登录令牌时抛出 login 类别错误。
 * @param init - 原始请求配置。
 * @returns 带鉴权与租户的请求头。
 */
function headers(init?: RequestInit): Headers {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' })
  const result = new Headers(init?.headers)
  result.set('authorization', `Bearer ${token}`)
  result.set('X-Active-Tenant', localStorage.getItem('yuanshu-active-tenant') ?? '')
  if (init?.body !== undefined) result.set('content-type', 'application/json')
  return result
}

/**
 * 读取待办清单。
 * @param signal - 取消信号。
 * @returns 待办数组；响应异常时抛错。
 */
export async function fetchTodos(signal?: AbortSignal): Promise<TodoItem[]> {
  const response = await fetch(BASE, { headers: headers(), ...(signal === undefined ? {} : { signal }) })
  if (!response.ok) throw new Error(`todos ${response.status}`)
  const payload = await response.json() as { data?: TodoItem[] }
  return payload.data ?? []
}

/**
 * 修改一条待办。
 * @param id - 待办标识。
 * @param patch - 需要修改的字段。
 * @param signal - 取消信号。
 * @returns 修改后的条目；不存在时为 undefined。
 */
export async function patchTodo(id: string, patch: TodoPatch, signal?: AbortSignal): Promise<TodoItem | undefined> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ body: '{}' }),
    body: JSON.stringify(patch),
    ...(signal === undefined ? {} : { signal }),
  })
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`todos ${response.status}`)
  const payload = await response.json() as { data?: TodoItem }
  return payload.data
}

/**
 * 删除一条待办。
 * @param id - 待办标识。
 * @param signal - 取消信号。
 * @returns 是否删除成功。
 */
export async function deleteTodo(id: string, signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: headers(), ...(signal === undefined ? {} : { signal }),
  })
  return response.ok
}
