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
import { emptyStats, summarizeMembers, type MemberStatEntry } from './organization-stats.ts'

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

/** 成员计数结果：各部门直属人数、未分配部门人数与页面统计。 */
interface MemberSnapshot {
  readonly byDepartment: ReadonlyMap<number, number>
  readonly unassigned: number
  readonly stats: ReturnType<typeof summarizeMembers>
}

/** 与后台一致的成员分页大小与最大页数，避免异常数据导致无限翻页。 */
const memberPageSize = 200
const memberPageLimit = 20

/**
 * 逐页读取成员，统计各部门直属人数、角色分布与在职/离职和年度曲线。
 * 云端部门树不返回 total_members 与 unassigned_count，需要按成员列表补齐；
 * 统计失败时返回 undefined，部门树本身仍可正常展示。
 */
async function collectMembers(signal: AbortSignal): Promise<MemberSnapshot | undefined> {
  const byDepartment = new Map<number, number>()
  const roleCounts = new Map<string, number>()
  const members: MemberStatEntry[] = []
  let unassigned = 0
  let active = 0
  let inactive = 0
  try {
    for (let page = 1; page <= memberPageLimit; page += 1) {
      const data = await request(`organization/users?page=${String(page)}&page_size=${String(memberPageSize)}`, signal)
      const entries = list(field(data, 'list'))
      for (const member of entries) {
        const departmentId = integer(field(member, 'department_id')) ?? 0
        if (departmentId > 0) byDepartment.set(departmentId, (byDepartment.get(departmentId) ?? 0) + 1)
        else unassigned += 1
        const isActive = (integer(field(member, 'status')) ?? 0) === 1
        if (isActive) active += 1
        else inactive += 1
        const effective = field(member, 'effective_roles')
        const names = roleNames(effective).length > 0 ? roleNames(effective) : roleNames(field(member, 'roles'))
        for (const name of new Set(names)) roleCounts.set(name, (roleCounts.get(name) ?? 0) + 1)
        members.push({ createdAt: text(field(member, 'created_at')), active: isActive })
      }
      const total = integer(field(data, 'total')) ?? 0
      if (entries.length === 0 || page * memberPageSize >= total) break
    }
  } catch {
    return undefined
  }
  return { byDepartment, unassigned, stats: summarizeMembers(members, roleCounts, active, inactive, new Date()) }
}

/** 自底向上把直属人数累加为子树总人数，并生成带统计的新树。 */
function withMemberTotals(nodes: readonly DepartmentNode[], counts: ReadonlyMap<number, number>): {
  readonly nodes: readonly DepartmentNode[]
  readonly total: number
} {
  let total = 0
  const mapped = nodes.map((node) => {
    const counted = withMemberTotals(node.children, counts)
    const members = (counts.get(node.id) ?? 0) + counted.total
    total += members
    return { ...node, totalMembers: members, children: counted.nodes }
  })
  return { nodes: mapped, total }
}

/**
 * 读取当前租户的组织架构树快照，含未分配部门人数。
 * 云端 /api/v1/departments/tree 的 data 直接是部门树数组；
 * 旧版本地后台返回 { departments, unassigned_count }，两种形态都兼容。
 */
export async function fetchOrganizationTree(signal: AbortSignal): Promise<OrganizationTree> {
  const data = await request('organization/departments/tree', signal)
  const payload = Array.isArray(data) ? data : field(data, 'departments')
  const departments = list(payload).map(node => parseDepartment(node, 0))
  const fallbackUnassigned = Array.isArray(data) ? 0 : integer(field(data, 'unassigned_count')) ?? 0
  const counts = await collectMembers(signal)
  if (counts === undefined) return { departments, unassignedCount: fallbackUnassigned, stats: emptyStats() }
  const counted = withMemberTotals(departments, counts.byDepartment)
  return { departments: counted.nodes, unassignedCount: counts.unassigned, stats: counts.stats }
}

/** 读取部门及其全部子部门的 ID，供成员本地过滤使用。 */
async function departmentScope(departmentId: number, signal: AbortSignal): Promise<ReadonlySet<number>> {
  const data = await request('organization/departments/tree', signal)
  const payload = Array.isArray(data) ? data : field(data, 'departments')
  const nodes = list(payload).map(node => parseDepartment(node, 0))
  const scope = new Set<number>()
  const collect = (items: readonly DepartmentNode[], inside: boolean): void => {
    for (const item of items) {
      const matched = inside || item.id === departmentId
      if (matched) scope.add(item.id)
      collect(item.children, matched)
    }
  }
  collect(nodes, false)
  return scope
}

/** 逐页拉取全部成员，云端不支持按部门筛选，需在本地过滤与分页。 */
async function fetchAllMembers(keyword: string, signal: AbortSignal): Promise<readonly OrganizationMember[]> {
  const members: OrganizationMember[] = []
  for (let page = 1; page <= memberPageLimit; page += 1) {
    const params = new URLSearchParams({ page: String(page), page_size: String(memberPageSize) })
    if (keyword !== '') params.set('keyword', keyword)
    const parsed = parseMemberPage(await request(`organization/users?${params.toString()}`, signal))
    members.push(...parsed.list)
    if (parsed.list.length === 0 || page * memberPageSize >= parsed.total) break
  }
  return members
}

/**
 * 分页读取成员；departmentId 为 0 时只返回未分配部门的成员。
 * 云端用户列表不按部门筛选，选定部门时在本地按“本部门及子部门”过滤后分页；
 * keyword 仍交给元枢按姓名和账号筛选，减少传输量。
 */
export async function fetchOrganizationMembers(
  query: OrganizationQuery,
  signal: AbortSignal,
): Promise<OrganizationMemberPage> {
  if (query.departmentId === undefined) {
    const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
    if (query.keyword !== '') params.set('keyword', query.keyword)
    return parseMemberPage(await request(`organization/users?${params.toString()}`, signal))
  }
  const scope = query.departmentId === 0 ? new Set([0]) : await departmentScope(query.departmentId, signal)
  const matched = (await fetchAllMembers(query.keyword, signal))
    .filter(member => scope.has(member.departmentId))
  const start = (query.page - 1) * query.pageSize
  return {
    list: matched.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total: matched.length,
  }
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
