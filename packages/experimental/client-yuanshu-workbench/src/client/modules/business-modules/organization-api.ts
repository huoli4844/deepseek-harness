/** 通过工作台同源代理读取组织架构树与成员列表，并透传成员编辑、删除请求，不依赖 React。 */
import type {
  DepartmentNode,
  MemberDraft,
  OrganizationMember,
  OrganizationMemberPage,
  OrganizationQuery,
  OrganizationRole,
  OrganizationTree,
} from './organization-model.ts'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function list(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  throw new Error('Invalid YuanShu organization payload')
}

function parseDepartment(value: unknown, depth: number): DepartmentNode {
  const id = integer(field(value, 'id'))
  if (id === undefined || id === 0) throw new Error('Invalid YuanShu department')
  if (depth > 16) throw new Error('YuanShu department tree is too deep')
  const children = field(value, 'children')
  return {
    id,
    name: text(field(value, 'name')),
    parentId: integer(field(value, 'parent_id')) ?? 0,
    leader: text(field(value, 'leader')),
    status: integer(field(value, 'status')) ?? 0,
    totalMembers: integer(field(value, 'total_members')) ?? 0,
    children: Array.isArray(children) ? children.map(child => parseDepartment(child, depth + 1)) : [],
  }
}

function roleNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  const names: string[] = []
  for (const entry of value) {
    const name = text(field(entry, 'role_name')) || text(field(entry, 'name'))
    if (name !== '') names.push(name)
  }
  return names
}

function roleIDs(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  const ids: number[] = []
  for (const entry of value) {
    const id = integer(field(entry, 'role_id')) ?? integer(field(entry, 'id'))
    if (id !== undefined && id > 0) ids.push(id)
  }
  return ids
}

function parseMember(value: unknown): OrganizationMember {
  const id = integer(field(value, 'id'))
  if (id === undefined || id === 0) throw new Error('Invalid YuanShu member')
  const effective = field(value, 'effective_roles')
  const fallback = field(value, 'roles')
  const names = roleNames(effective).length > 0 ? roleNames(effective) : roleNames(fallback)
  const ids = roleIDs(effective).length > 0 ? roleIDs(effective) : roleIDs(fallback)
  return {
    id,
    username: text(field(value, 'username')),
    nickname: text(field(value, 'nickname')),
    email: text(field(value, 'email')),
    phone: text(field(value, 'phone')),
    departmentId: integer(field(value, 'department_id')) ?? 0,
    status: integer(field(value, 'status')) ?? 0,
    roles: names,
    roleIds: ids,
  }
}

function parseRoles(value: unknown): readonly OrganizationRole[] {
  const roles: OrganizationRole[] = []
  for (const entry of list(value)) {
    const id = integer(field(entry, 'id'))
    if (id === undefined || id === 0) continue
    const name = text(field(entry, 'name'))
    if (name === '' || integer(field(entry, 'status')) !== 1) continue
    roles.push({ id, name, code: text(field(entry, 'code')) })
  }
  return roles
}

function parseMemberPage(value: unknown): OrganizationMemberPage {
  const page = integer(field(value, 'page')) ?? 1
  const pageSize = integer(field(value, 'page_size')) ?? 20
  const total = integer(field(value, 'total')) ?? 0
  return {
    list: list(field(value, 'list')).map(parseMember),
    page: page > 0 ? page : 1,
    pageSize: pageSize > 0 ? pageSize : 20,
    total,
  }
}

async function request(path: string, signal: AbortSignal): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  const response = await fetch(`/yuanshu-workbench/${path}`, { headers, signal })
  if (!response.ok) throw Object.assign(new Error('YuanShu organization request failed'), { status: response.status })
  return field(await response.json(), 'data')
}

/** 发送成员写请求；成功响应不携带数据。 */
async function writeRequest(path: string, method: 'PUT' | 'POST' | 'DELETE', body: unknown, signal: AbortSignal): Promise<void> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    accept: 'application/json',
  })
  if (body !== undefined) headers.set('content-type', 'application/json')
  const init: RequestInit = body === undefined
    ? { method, headers, signal }
    : { method, headers, body: JSON.stringify(body), signal }
  const response = await fetch(`/yuanshu-workbench/${path}`, init)
  if (!response.ok) throw Object.assign(new Error('YuanShu organization write failed'), { status: response.status })
}

/** 读取当前租户的组织架构树快照，含未分配部门人数。 */
export async function fetchOrganizationTree(signal: AbortSignal): Promise<OrganizationTree> {
  const data = await request('organization/departments/tree', signal)
  if (typeof data !== 'object' || data === null) throw new Error('Invalid YuanShu organization tree')
  return {
    departments: list(field(data, 'departments')).map(node => parseDepartment(node, 0)),
    unassignedCount: integer(field(data, 'unassigned_count')) ?? 0,
  }
}

/** 分页读取成员；departmentId 为 0 时只返回未分配部门的成员，keyword 由元枢按姓名和账号筛选。 */
export async function fetchOrganizationMembers(
  query: OrganizationQuery,
  signal: AbortSignal,
): Promise<OrganizationMemberPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  if (query.departmentId !== undefined) params.set('department_id', String(query.departmentId))
  if (query.keyword !== '') params.set('keyword', query.keyword)
  return parseMemberPage(await request(`organization/users?${params.toString()}`, signal))
}

/** 读取当前租户启用状态的角色列表，供成员编辑弹窗分配角色。 */
export async function fetchOrganizationRoles(signal: AbortSignal): Promise<readonly OrganizationRole[]> {
  return parseRoles(await request('organization/roles?page=1&page_size=100', signal))
}

/**
 * 透传成员资料编辑。元枢要求邮箱必填；手机号留空表示保持原值，无法清空。
 */
export async function updateOrganizationMember(id: number, draft: MemberDraft, signal: AbortSignal): Promise<void> {
  const payload: Record<string, string> = { nickname: draft.nickname, email: draft.email }
  if (draft.phone !== '') payload.phone = draft.phone
  await writeRequest(`organization/users/${id}`, 'PUT', payload, signal)
}

/** 透传成员启用状态；1 表示启用、0 表示停用。 */
export async function updateOrganizationMemberStatus(id: number, status: number, signal: AbortSignal): Promise<void> {
  await writeRequest(`organization/users/${id}/status`, 'PUT', { status }, signal)
}

/** 透传成员角色分配；空集合表示清空全部角色。 */
export async function updateOrganizationMemberRoles(
  id: number,
  roleIds: readonly number[],
  signal: AbortSignal,
): Promise<void> {
  await writeRequest(`organization/users/${id}/roles`, 'POST', { role_ids: roleIds }, signal)
}

/** 透传成员删除。 */
export async function deleteOrganizationMember(id: number, signal: AbortSignal): Promise<void> {
  await writeRequest(`organization/users/${id}`, 'DELETE', undefined, signal)
}
