/**
 * 身份模块的数据层：同源代理 fetch、响应校验与失败降级。
 *
 * 这是本模块唯一知道接口路径和 localStorage 的地方。展示层不接触它；
 * 视图模型层只消费此处校验后的类型。接口字段缺失时用演示数据补齐，
 * 并在 `fallback` 中标记，保证界面不会把演示值误标为真实数据。
 */

import type { IdentitySource, RawIdentity, RawLaborRow, RawPositionAssignment, RawRole, RawUser } from './model.ts'
import { EMPTY_IDENTITY } from './model.ts'

/** 同源只读代理路径。 */
const ROUTES = {
  me: '/yuanshu-workbench/identity/me',
  profile: '/yuanshu-workbench/identity/profile',
  position: '/yuanshu-workbench/identity/position',
  laborHours: '/yuanshu-workbench/identity/labor-hours',
  assignments: '/yuanshu-workbench/user-positions?mine=1',
} as const

/** 身份接口不可用时使用的演示用户（截图中的少仕用户）。 */
const DEMO_USER: RawUser = {
  id: 52,
  username: 'zhouwei',
  nickname: '周伟',
  roles: [{ id: 1, name: '少仕项目管理', code: 'shaoshi_pm' }],
  avatarUrl: undefined,
}

/** 个人资料接口无字段时的演示值。 */
const DEMO_PROFILE: Record<string, string> = {
  employee_no: 'SH-0052',
  department: '项目管理部',
  position: '项目经理',
  supervisor: '陈志远 · 分管副总裁',
  position_duty: '负责项目全生命周期管理：组织编制项目计划与基线；牵头需求分析与方案论证；把控进度、成本、质量与风险；组织阶段评审与验收交付；协调甲方与供应链资源；主持项目例会并跟进决议闭环。',
  email: 'zhouwei@example.com',
  phone: '138****0052',
  tenant: '少仕',
}

/** 工时接口无数据时的演示行。 */
const DEMO_LABOR: readonly RawLaborRow[] = [
  { person: '周伟', project: 'EP220501 电磁阀', hours: 32, status: '正常' },
  { person: '张和林', project: 'EP220501 电磁阀', hours: 26, status: '正常' },
  { person: '林令贤', project: 'EP220302 阀体', hours: 18, status: '待确认' },
  { person: '高静', project: 'EP220302 阀体', hours: 40, status: '正常' },
]

/** 任职接口无数据时的演示行，与演示档案的项目经理身份一致。 */
const DEMO_ASSIGNMENTS: readonly RawPositionAssignment[] = [
  {
    id: 1, positionName: '项目经理', positionLevel: 'S04 10-12', positionCategory: '项目管理部',
    roleInProject: '项目负责人', startDate: '2026-01-01', endDate: '', isPrimary: true,
  },
]

/** 判断值是否为非空对象。 */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** 只接受字符串，且过滤空白。 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 头像字段可能是多种历史命名；非 URL 值一律忽略。 */
function avatarUrl(value: unknown): string | undefined {
  const url = text(value)
  if (url === undefined) return undefined
  return /^(?:https?:\/\/|data:image\/|\/)/u.test(url) ? url : undefined
}

/** 宽松解析 `/user/me` 响应，不因新增字段失败。 */
export function parseMe(body: unknown): RawUser | undefined {
  const data = record(record(body)?.data)
  if (data === undefined) return undefined
  const id = data.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return undefined
  const roles: RawRole[] = []
  if (Array.isArray(data.roles)) {
    for (const entry of data.roles) {
      const row = record(entry)
      const roleId = row?.id
      const name = text(row?.name)
      if (typeof roleId !== 'number' || name === undefined) continue
      roles.push({ id: roleId, name, code: text(row?.code) ?? '' })
    }
  }
  return {
    id,
    username: text(data.username) ?? `user-${id}`,
    nickname: text(data.nickname) ?? text(data.username) ?? `用户 ${id}`,
    roles,
    avatarUrl: avatarUrl(data.avatar) ?? avatarUrl(data.avatar_url) ?? avatarUrl(data.head_img),
  }
}

/** 宽松解析工作台档案；契约未定义字段时保留原始对象供视图模型挑选。 */
export function parseProfile(body: unknown): Record<string, unknown> | undefined {
  const data = record(record(body)?.data)
  if (data === undefined) return undefined
  // 直属上级可能以多种历史命名返回；归一到 supervisor 供视图模型取值。
  const supervisor = text(data.supervisor) ?? text(data.supervisor_name) ?? text(data.supervisorName) ?? text(data.leader)
  return supervisor === undefined ? data : { ...data, supervisor }
}

/** 宽松解析工作台岗位响应（`{data:{title:'采购',...}}`）。 */
export function parsePosition(body: unknown): string | undefined {
  const data = record(record(body)?.data)
  if (data === undefined) return undefined
  return text(data.title) ?? text(data.position) ?? text(data.name)
}

/**
 * 归一化档案字段：后台可能返回嵌套对象（如 `department:{name}`）或历史扁平字符串。
 * 嵌套对象按 `name` → `title` → `code` 顺序展平，保证视图模型始终拿到字符串。
 * 另：档案契约没有 `position` 字段，但有 `workbench:{name}`（如「采购工作台」），
 * 在缺失时提取它作为岗位展示兜底。
 */
export function normalizeProfile(raw: Record<string, unknown>): Record<string, unknown> {
  const flattened: Record<string, unknown> = { ...raw }
  for (const key of ['department', 'position'] as const) {
    const nested = record(raw[key])
    if (nested === undefined) continue
    const name = text(nested.name) ?? text(nested.title) ?? text(nested.code)
    if (name !== undefined) flattened[key] = name
  }
  if (text(flattened.position) === undefined) {
    const workbench = record(raw.workbench)
    const workbenchName = text(workbench?.name) ?? text(workbench?.title)
    if (workbenchName !== undefined) flattened.position = workbenchName
  }
  return flattened
}

/** 从多种响应形态中取出工时数组。 */
function laborRows(value: unknown): readonly unknown[] | undefined {
  if (Array.isArray(value)) return value as readonly unknown[]
  const root = record(value)
  if (root === undefined) return undefined
  const envelope = record(root.data) ?? root
  if (Array.isArray(envelope)) return envelope
  for (const key of ['items', 'rows', 'list', 'records', 'data'] as const) {
    if (Array.isArray(envelope[key])) return envelope[key] as readonly unknown[]
  }
  return undefined
}

/** 宽松解析工时行，忽略缺字段或数值非法的记录。 */
export function parseLaborHours(body: unknown): readonly RawLaborRow[] | undefined {
  const rows = laborRows(body)
  if (rows === undefined) return undefined
  const result: RawLaborRow[] = []
  for (const entry of rows) {
    const row = record(entry)
    if (row === undefined) continue
    const person = text(row.person) ?? text(row.employee_name) ?? text(row.user_name) ?? text(row.name)
    const project = text(row.project) ?? text(row.project_name) ?? text(row.code)
    const rawHours = row.hours ?? row.work_hours ?? row.actual_hours
    const hours = typeof rawHours === 'number' ? rawHours : Number(text(rawHours) ?? Number.NaN)
    if (person === undefined || project === undefined || !Number.isFinite(hours) || hours < 0) continue
    result.push({ person, project, hours, status: text(row.status) ?? '—' })
  }
  return result.length === 0 ? undefined : result
}

/** 宽松解析任职列表；忽略缺 ID、缺岗位名称或字段类型非法的记录。 */
export function parseAssignments(body: unknown): readonly RawPositionAssignment[] | undefined {
  const root = record(body)
  if (root === undefined) return undefined
  const data = record(root.data) ?? root
  const rows = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : undefined
  if (rows === undefined) return undefined
  const result: RawPositionAssignment[] = []
  for (const entry of rows) {
    const row = record(entry)
    if (row === undefined) continue
    const id = row.id
    const name = text(row.position_name)
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || name === undefined) continue
    result.push({
      id,
      positionName: name,
      positionLevel: text(row.level) ?? text(row.position_level) ?? '',
      positionCategory: text(row.position_category) ?? text(row.category) ?? '',
      roleInProject: text(row.role_in_project) ?? '',
      startDate: text(row.start_date) ?? '',
      endDate: text(row.end_date) ?? '',
      isPrimary: row.is_primary === true,
    })
  }
  return result
}

/** 浏览器同源请求所需的鉴权头。 */
function headers(): Record<string, string> {
  const token = localStorage.getItem('workbench-client-token') ?? ''
  return {
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  }
}

/** 单个 GET；401 表示登录态失效，其余失败按缺失处理。 */
async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { headers: headers(), signal })
  if (response.status === 401) return undefined
  if (!response.ok) return undefined
  return await response.json() as unknown
}

/** 创建线上身份数据源；任一段失败时独立降级为演示数据。 */
export function createLiveIdentitySource(): IdentitySource {
  return {
    async load(signal: AbortSignal): Promise<RawIdentity> {
      const [meBody, profileBody, positionBody, laborBody, assignmentsBody] = await Promise.all([
        get(ROUTES.me, signal).catch(() => undefined),
        get(ROUTES.profile, signal).catch(() => undefined),
        get(ROUTES.position, signal).catch(() => undefined),
        get(ROUTES.laborHours, signal).catch(() => undefined),
        get(ROUTES.assignments, signal).catch(() => undefined),
      ])
      const user = parseMe(meBody)
      const profileRaw = parseProfile(profileBody)
      const profile = profileRaw === undefined ? undefined : normalizeProfile(profileRaw)
      const position = parsePosition(positionBody)
      const laborHours = parseLaborHours(laborBody)
      const assignments = parseAssignments(assignmentsBody)
      const fetchedAt = user !== undefined || profile !== undefined || position !== undefined ||
          laborHours !== undefined || assignments !== undefined
        ? Date.now()
        : undefined
      return {
        user: user ?? DEMO_USER,
        profile: profile ?? DEMO_PROFILE,
        position: position ?? DEMO_PROFILE.position,
        laborHours: laborHours ?? DEMO_LABOR,
        assignments: assignments ?? DEMO_ASSIGNMENTS,
        fallback: {
          user: user === undefined,
          profile: profile === undefined,
          position: position === undefined,
          laborHours: laborHours === undefined,
          assignments: assignments === undefined,
        },
        fetchedAt,
      }
    },
  }
}

/** 无 I/O 的空数据源，供首帧与测试使用。 */
export function createEmptyIdentitySource(): IdentitySource {
  return { load: () => Promise.resolve(EMPTY_IDENTITY) }
}
