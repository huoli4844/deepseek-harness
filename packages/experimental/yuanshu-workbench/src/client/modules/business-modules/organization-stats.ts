/** 组织统计的纯计算函数：从成员原始字段汇总角色分布、年度入职/累计/离职曲线与在司时间分布。不依赖 React 与 fetch。 */
import type {
  OrganizationMonthlyPoint,
  OrganizationStats,
  OrganizationTenureBucket,
  OrganizationTenurePoint,
} from './organization-model.ts'

/** 单个成员参与统计所需的最小信息。 */
export interface MemberStatEntry {
  /** created_at 原始值，形如 2026-11-12 13:11:39；为空或无法解析表示未知。 */
  readonly createdAt: string
  /** 当前是否在职（status === 1）。 */
  readonly active: boolean
}

/** 在司时间分段的固定顺序，供分布输出与图表轴使用。 */
export const tenureBuckets: readonly OrganizationTenureBucket[] = ['lt1', 'y1to3', 'y3to5', 'y5to10', 'gte10']

/** 生成当前年份的 12 个月份键。 */
export function currentYearMonths(): readonly string[] {
  const year = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, index) => `${String(year)}-${String(index + 1).padStart(2, '0')}`)
}

/** created_at 形如 2026-11-12 13:11:39，取前 7 位作为月份。 */
export function createdMonth(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  return /^\d{4}-\d{2}/u.test(raw) ? raw.slice(0, 7) : ''
}

/** 由 created_at 日期部分计算在司年数；无法解析时返回 undefined。created_at 为北京时间，按公历日期差计算即可。 */
export function tenureYears(createdAt: string, now: Date): number | undefined {
  const datePart = createdAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(datePart)) return undefined
  const [year, month, day] = datePart.split('-').map(part => Number(part))
  if (year === undefined || month === undefined || day === undefined) return undefined
  const days = (now.getTime() - Date.UTC(year, month - 1, day)) / 86400000
  return days / 365.25
}

/** 在司年数归入分段；边界为左闭右开（1 年、3 年、5 年、10 年）。 */
function tenureBucket(years: number): OrganizationTenureBucket {
  if (years < 1) return 'lt1'
  if (years < 3) return 'y1to3'
  if (years < 5) return 'y3to5'
  if (years < 10) return 'y5to10'
  return 'gte10'
}

/** 成员读取失败时的零值统计。 */
export function emptyStats(): OrganizationStats {
  return {
    active: 0,
    inactive: 0,
    roles: [],
    monthly: currentYearMonths().map(month => ({ month, joined: 0, departed: 0, total: 0 })),
    tenure: tenureBuckets.map(bucket => ({ bucket, count: 0 })),
  }
}

/** 汇总角色分布、全年入职/累计/离职曲线与在司时间分布；未知入职月份仅计入累计基数。 */
export function summarizeMembers(
  members: readonly MemberStatEntry[],
  roleCounts: ReadonlyMap<string, number>,
  active: number,
  inactive: number,
  now: Date,
): OrganizationStats {
  const unknown = members.filter(member => createdMonth(member.createdAt) === '').length
  const roles = [...roleCounts].map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'))
  const monthly: OrganizationMonthlyPoint[] = currentYearMonths().map((month) => {
    let joined = 0
    let departed = 0
    let total = unknown
    for (const member of members) {
      const created = createdMonth(member.createdAt)
      if (created === '') continue
      if (created === month) {
        joined += 1
        if (!member.active) departed += 1
      }
      if (created <= month) total += 1
    }
    return { month, joined, departed, total }
  })
  // 在司时间分布只统计当前在职成员；离职成员的工龄已无业务意义。
  const counts = new Map<OrganizationTenureBucket, number>()
  for (const member of members) {
    if (!member.active) continue
    const years = tenureYears(member.createdAt, now)
    if (years === undefined) continue
    const bucket = tenureBucket(years)
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  const tenure: OrganizationTenurePoint[] = tenureBuckets.map(bucket => ({ bucket, count: counts.get(bucket) ?? 0 }))
  return { active, inactive, roles, monthly, tenure }
}
