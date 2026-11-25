/** 通过工作台同源代理读取组织架构树与成员列表，不依赖 React。 */
import type { DepartmentNode, OrganizationMember, OrganizationMemberPage, OrganizationQuery } from './organization-model.ts'

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

function parseMember(value: unknown): OrganizationMember {
  const id = integer(field(value, 'id'))
  if (id === undefined || id === 0) throw new Error('Invalid YuanShu member')
  const effective = roleNames(field(value, 'effective_roles'))
  return {
    id,
    username: text(field(value, 'username')),
    nickname: text(field(value, 'nickname')),
    email: text(field(value, 'email')),
    phone: text(field(value, 'phone')),
    departmentId: integer(field(value, 'department_id')) ?? 0,
    status: integer(field(value, 'status')) ?? 0,
    roles: effective.length > 0 ? effective : roleNames(field(value, 'roles')),
  }
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

/** 读取当前租户的组织架构树。 */
export async function fetchOrganizationTree(signal: AbortSignal): Promise<readonly DepartmentNode[]> {
  const data = await request('organization/departments/tree', signal)
  return list(data).map(node => parseDepartment(node, 0))
}

/** 分页读取成员；departmentId 包含其全部子部门，keyword 由元枢按姓名和账号筛选。 */
export async function fetchOrganizationMembers(
  query: OrganizationQuery,
  signal: AbortSignal,
): Promise<OrganizationMemberPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  if (query.departmentId !== undefined) params.set('department_id', String(query.departmentId))
  if (query.keyword !== '') params.set('keyword', query.keyword)
  return parseMemberPage(await request(`organization/users?${params.toString()}`, signal))
}
