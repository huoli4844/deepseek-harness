/** 从同源宿主读取当前员工权限，并按后台权限树标注是否已授权。 */
import { field } from '../../business-forms/model.ts'

/** 权限树节点：编码、名称、本人是否已获得，以及与子权限的关系。 */
export interface PermissionNode {
  readonly id?: number
  readonly code: string
  readonly name: string
  readonly granted: boolean
  readonly children: readonly PermissionNode[]
}

/** 递归读取后台权限树节点；名称缺失的节点不展示。 */
function readNode(value: unknown, granted: ReadonlySet<string>): PermissionNode | undefined {
  const name = field(value, 'name')
  if (typeof name !== 'string' || name.trim() === '') return undefined
  const code = field(value, 'code')
  const id = field(value, 'id')
  const rawChildren = field(value, 'children')
  const children = (Array.isArray(rawChildren) ? rawChildren : [])
    .map(child => readNode(child, granted))
    .filter((child): child is PermissionNode => child !== undefined)
  const own = typeof code === 'string' ? code.trim() : ''
  return {
    ...(typeof id === 'number' ? { id } : {}),
    code: own,
    name: name.trim(),
    // 分组节点本身没有编码时，用子权限是否授予作为聚合状态。
    granted: own === '' ? children.some(child => child.granted) : granted.has(own),
    children,
  }
}

/** 读取权限树；后台未开放或请求失败时返回空表，调用方回退为扁平编码列表。 */
async function loadTree(
  token: string,
  tenant: string,
  granted: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<readonly PermissionNode[]> {
  try {
    const response = await fetch('/yuanshu-workbench/permission-catalog', {
      method: 'GET', signal, credentials: 'same-origin',
      headers: { authorization: `Bearer ${token}`, 'X-Active-Tenant': tenant },
    })
    if (!response.ok) return []
    const data = field(await response.json(), 'data')
    const nodes = Array.isArray(data) ? data : field(data, 'list')
    return (Array.isArray(nodes) ? nodes : [])
      .map(node => readNode(node, granted))
      .filter((node): node is PermissionNode => node !== undefined)
  } catch {
    return []
  }
}

/** 绑定本次读取使用的账号与租户，避免接收切换账号前发出的响应。 */
export function createProfilePermissionsRequest() {
  const token = localStorage.getItem('workbench-client-token')
  const tenant = localStorage.getItem('yuanshu-active-tenant')
  const isCurrent = () => token === localStorage.getItem('workbench-client-token')
    && tenant === localStorage.getItem('yuanshu-active-tenant')
  return {
    isCurrent,
    async load(signal: AbortSignal): Promise<readonly PermissionNode[] | null> {
      if (!token || !tenant) return null
      const response = await fetch('/yuanshu-workbench/employee-access', {
        method: 'POST', signal, credentials: 'same-origin',
        headers: { authorization: `Bearer ${token}`, 'X-Active-Tenant': tenant },
      })
      if (!response.ok) return null
      const data = field(await response.json(), 'data')
      const permissions = field(data, 'permissions')
      if (!isCurrent() || !Array.isArray(permissions)
        || !permissions.every((code: unknown): code is string => typeof code === 'string' && code.trim() !== '')) return null
      const codes = [...new Set(permissions)].sort()
      const granted = new Set(codes)
      const tree = await loadTree(token, tenant, granted, signal)
      if (!isCurrent()) return null
      if (tree.length > 0) return tree
      // 权限树不可用时退化为已授权编码清单，界面仍能看到本人拥有的权限。
      return codes.map(code => ({ code, name: code, granted: true, children: [] }))
    },
  }
}
