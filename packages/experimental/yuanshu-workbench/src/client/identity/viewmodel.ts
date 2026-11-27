/**
 * 身份模块的视图模型层：纯函数，把校验后的快照组装成展示模型。
 *
 * 不依赖 React、不请求数据、没有副作用。所有档位标注、头像生成规则与
 * 工时汇总都集中在此，展示层只负责渲染。
 */

import type {
  IdentityField,
  IdentityFieldTier,
  IdentityLocaleKey,
  IdentityUserModel,
  IdentityViewModel,
  ProfileEntryModel,
  RawIdentity,
  RawLaborRow,
} from './model.ts'

/** 数据来源标识。 */
const SOURCE = {
  me: '/api/v1/user/me',
  profile: '/api/v1/apps/shaoshi/workbench/profile',
  labor: '/api/v1/apps/shaoshi/projects/{code}/labor-hours',
  positions: '/api/v1/positions/all',
  demo: 'demo://identity',
} as const

/** 无头像时的蓝绿渐变候选，顺序由姓名哈希决定。 */
const GRADIENTS: readonly (readonly [string, string])[] = [
  ['#1e88e5', '#00acc1'],
  ['#1976d2', '#26a69a'],
  ['#2196f3', '#00897b'],
]

/** 构造带档位与来源的字段。 */
function field<T>(value: T | undefined, tier: IdentityFieldTier, source: string): IdentityField<T> {
  return { value, tier, source }
}

/** 取姓名首字；英文取首字母大写。 */
export function initialsOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? '?'
  return first.toUpperCase()
}

/** 由姓名稳定选择一组蓝绿渐变，保证同一用户头像颜色不变。 */
export function gradientOf(name: string): readonly [string, string] {
  const hash = Array.from(name).reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0)
  const picked = GRADIENTS[hash % GRADIENTS.length]
  return [picked?.[0] ?? '#1e88e5', picked?.[1] ?? '#00acc1']
}

/** 构造头像与用户名模型。 */
function buildUser(raw: RawIdentity): IdentityUserModel {
  const fallback = raw.fallback.user
  const displayName = raw.user?.nickname ?? ''
  const roles = raw.user?.roles.map(role => role.name).filter(name => name !== '') ?? []
  const roleCodes = fallback ? [] : raw.user?.roles.map(role => role.code).filter(code => code !== '') ?? []
  const tier: IdentityFieldTier = fallback ? 'demo' : 'live'
  // 「部门 · 岗位」摘要：部门来自档案，岗位来自工作台岗位接口；两者任一缺失就只显示另一个。
  const department = typeof raw.profile?.department === 'string' ? raw.profile.department : undefined
  const orgParts = [department, raw.position].filter(part => part !== undefined && part !== '')
  return {
    displayName,
    userId: fallback ? undefined : raw.user?.id,
    initials: initialsOf(displayName),
    idText: raw.user === undefined ? '' : String(raw.user.id),
    roleText: roles.join('、'),
    roles,
    roleCodes,
    avatarUrl: raw.user?.avatarUrl,
    gradient: gradientOf(displayName),
    tier,
    orgText: orgParts.join(' · '),
  }
}

/** 从档案对象中取字符串字段；缺失时按来源档位标记为待接入。 */
function profileField(
  raw: RawIdentity,
  key: string,
  labelKey: IdentityLocaleKey,
  id: string,
): ProfileEntryModel {
  const value = raw.profile?.[key]
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
  const tier: IdentityFieldTier = text === undefined
    ? 'missing'
    : raw.fallback.profile ? 'demo' : 'live'
  return {
    id,
    labelKey,
    field: field(text, tier, raw.fallback.profile ? SOURCE.demo : SOURCE.profile),
  }
}

/** 组装个人资料字段列表。 */
function buildProfile(raw: RawIdentity): readonly ProfileEntryModel[] {
  const tier: IdentityFieldTier = raw.fallback.user ? 'demo' : 'live'
  const userSource = raw.fallback.user ? SOURCE.demo : SOURCE.me
  // 「用户角色」展示平台角色（与页头标签同源）；工作台岗位标题只作缺省兜底，
  // 避免把「采购工作台」误当成用户的角色。
  const userRoles = buildUser(raw).roleText
  const workbenchPosition = raw.fallback.position ? undefined : raw.position
  const roleValue = userRoles !== '' ? userRoles : workbenchPosition
  const roleTier: IdentityFieldTier = userRoles !== ''
    ? tier
    : workbenchPosition === undefined ? tier : 'live'
  const roleSource = userRoles !== '' ? userSource : workbenchPosition === undefined ? userSource : SOURCE.profile
  return [
    {
      id: 'name',
      labelKey: 'profile.label.name',
      field: field(raw.user?.nickname, tier, userSource),
    },
    {
      id: 'id',
      labelKey: 'profile.label.id',
      field: field(raw.user === undefined ? undefined : String(raw.user.id), tier, userSource),
    },
    {
      id: 'role',
      labelKey: 'profile.label.role',
      field: field(roleValue, roleTier, roleSource),
    },
    profileField(raw, 'employee_no', 'profile.label.employeeNo', 'employeeNo'),
    profileField(raw, 'department', 'profile.label.department', 'department'),
    profileField(raw, 'position', 'profile.label.position', 'position'),
    // 直属上级：接口可能以下划线 / 驼峰命名返回，数据层统一宽松取值后存入 profile。
    profileField(raw, 'supervisor', 'profile.label.supervisor', 'supervisor'),
    profileField(raw, 'email', 'profile.label.email', 'email'),
    profileField(raw, 'phone', 'profile.label.phone', 'phone'),
    profileField(raw, 'tenant', 'profile.label.tenant', 'tenant'),
  ]
}

/** 工时数字格式化：整数不加小数，非整数保留一位。 */
function hoursText(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
}

/** 岗位职责可能出现的档案字段名（不同接口命名不统一，逐一宽松取值）。 */
const DUTY_KEYS = ['position_duty', 'position_duty_desc', 'duty', 'responsibilities'] as const

/** 优先展示当前任职的岗位描述，兼容真实档案中已有的职责字段。 */
function buildDuty(raw: RawIdentity): IdentityField<string> {
  if (raw.positionDescription) return field(raw.positionDescription, 'live', SOURCE.positions)
  if (raw.fallback.profile) return field<string>(undefined, 'missing', SOURCE.positions)
  for (const key of DUTY_KEYS) {
    const value = raw.profile?.[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return field(value.trim(), 'live', SOURCE.profile)
    }
  }
  return field<string>(undefined, 'missing', SOURCE.positions)
}

/** 组装工时表格行与合计。 */
function buildLaborHours(raw: RawIdentity): IdentityViewModel['laborHours'] {
  const tier: IdentityFieldTier = raw.fallback.laborHours ? 'demo' : 'live'
  const source = raw.fallback.laborHours ? SOURCE.demo : SOURCE.labor
  const rows = (raw.laborHours ?? []).map((row: RawLaborRow, index: number) => ({
    id: `labor-${index}-${row.person}`,
    person: field(row.person, tier, source),
    project: field(row.project, tier, source),
    hours: field(hoursText(row.hours), tier, source),
    status: field(row.status, tier, source),
  }))
  const total = (raw.laborHours ?? []).reduce((sum, row) => sum + row.hours, 0)
  return {
    rows,
    total: field(raw.laborHours === undefined ? undefined : hoursText(total), tier, source),
    source,
  }
}

/**
 * 从原始身份快照构造完整视图模型。
 * @param raw - 数据层产出的不可变快照。
 * @returns 头像、资料字段与工时模型。
 */
export function buildIdentityViewModel(raw: RawIdentity): IdentityViewModel {
  return {
    user: buildUser(raw),
    profile: buildProfile(raw),
    duty: buildDuty(raw),
    laborHours: buildLaborHours(raw),
    fetchedAt: raw.fetchedAt === undefined ? undefined : new Date(raw.fetchedAt).toLocaleString(),
  }
}
