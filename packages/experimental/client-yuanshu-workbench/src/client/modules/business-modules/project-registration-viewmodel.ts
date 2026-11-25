/** 从日历值和业务状态计算周报及工时界面模型，不依赖 React 或请求。 */
import type { LaborDraft, LaborRecord, RegistrationProject, WeeklyDraft } from './project-registration-model.ts'

/** 周报正文的稳定表单顺序。 */
export const weeklyFields = ['progress_summary', 'completed_work', 'planned_work', 'issues_and_risks', 'need_support'] as const

/** 工时分类代码与后台契约保持一致。 */
export const laborTypes = ['direct', 'indirect', 'meeting', 'overtime', 'training'] as const

/** 工时完成状态沿用项目任务状态。 */
export const completionStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] as const

/** 空白周报表单。 */
export const blankWeekly: WeeklyDraft = {
  progress_summary: '', completed_work: '', planned_work: '', issues_and_risks: '', need_support: '',
}

/** 转换北京时间的自然日期。 */
export function beijingDate(date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' }).format(date)
}

/** 天数移动在日历日期上进行，避免设备时区改变结果。 */
export function moveDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 归一化到这一自然周的周一。 */
export function weekStart(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return weekStart(beijingDate())
  return moveDate(value, -((date.getUTCDay() + 6) % 7))
}

/** 月份字符串（YYYY-MM）移动指定月数。 */
export function shiftMonth(value: string, offset: number): string {
  const date = new Date(`${value}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 7)
}

/** 一条待保存的工时事项；id 存在表示改写已有草稿。 */
export interface LaborDraftRow {
  readonly key: string
  readonly id?: number
  readonly projectCode: string
  readonly work_type: string
  readonly hours: string
  readonly description: string
  readonly completion_status: string
}

/** 本人当月单个项目的工时合计。 */
export interface LaborProjectTotal {
  readonly code: string
  readonly name: string
  readonly hours: string
}

/** 月历单日的着色状态；日期集合未知时不判断缺填，避免误标红。 */
export type LaborDayState = 'filled' | 'missing' | 'rest' | 'plain' | 'outside'

/** 着色所需的日期集合；节假日缺失时只按周末判断。 */
export interface LaborCalendarDays {
  /** 当月已填报日期；undefined 表示数据不可用，不判断缺填。 */
  readonly filled: ReadonlySet<string> | undefined
  /** 法定放假日期。 */
  readonly rests?: ReadonlySet<string> | undefined
  /** 调休补班日期，按工作日处理。 */
  readonly workdays?: ReadonlySet<string> | undefined
}

/**
 * 计算月历单日状态：已填报优先，其次法定假日，最后才是工作日缺填。
 * 调休补班日即使落在周末也按工作日处理；未拿到节假日数据时退回周六日=休。
 */
export function laborDayState(
  day: string, month: string, today: string, calendar: LaborCalendarDays,
): LaborDayState {
  if (day.slice(0, 7) !== month) return 'outside'
  if (calendar.filled?.has(day) === true) return 'filled'
  if (calendar.rests?.has(day) === true) return 'rest'
  const workday = calendar.workdays?.has(day) === true
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  if (!workday && (weekday === 0 || weekday === 6)) return 'rest'
  // 未来日期和当天不标红，只有真正过去的工作日才提示缺填。
  if (calendar.filled === undefined || day >= today) return 'plain'
  return 'missing'
}

/** 根据筛选页和现有选择生成项目下拉列表。 */
export function projectChoices(items: readonly RegistrationProject[], selected?: RegistrationProject): readonly RegistrationProject[] {
  return selected && !items.some(project => project.code === selected.code) ? [selected, ...items] : items
}

/** 将工时记录的可编辑字段复制到表单。 */
export function laborDraft(record: LaborRecord | undefined, workDate: string): LaborDraft {
  return {
    work_date: record?.work_date ?? workDate, hours: record?.hours ?? '', work_type: record?.work_type ?? 'direct',
    description: record?.description ?? '', ...(record?.task_id === undefined ? {} : { task_id: record.task_id }),
  }
}

/** 校验输入的工时精度和上限。 */
export function validLaborHours(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,2})?$/u.test(value) && Number(value) > 0
}

/** 将写入错误映射为界面文案键。 */
export function registrationWriteError(error: unknown) {
  const status = error instanceof Error && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return 'registration.writeAuth'
  if (status === 409) return 'registration.conflict'
  return 'registration.writeError'
}

/** 新建一条空白事项，沿用上次选择的项目和工时类型。 */
export function emptyDraftRow(key: string, projectCode: string, workType: string): LaborDraftRow {
  return { key, projectCode, work_type: workType, hours: '', description: '', completion_status: '' }
}

/** 将已有记录复制为可编辑事项，保留记录 id 以改写同一条草稿。 */
export function draftRowFromRecord(key: string, record: LaborRecord, projectCode: string): LaborDraftRow {
  return {
    key, id: record.id, projectCode, work_type: record.work_type, hours: record.hours,
    description: record.description, completion_status: record.completion_status ?? '',
  }
}

/** 由事项生成写入请求字段；写入日期统一使用当前选中日期。 */
export function laborDraftFromRow(row: LaborDraftRow, workDate: string, taskId?: number): LaborDraft {
  return {
    work_date: workDate, hours: row.hours, work_type: row.work_type, description: row.description,
    ...(row.completion_status === '' ? {} : { completion_status: row.completion_status }),
    ...(taskId === undefined ? {} : { task_id: taskId }),
  }
}

/** 汇总当月已填报日期，供月历着色；记录无日期时忽略。 */
export function monthFilledDays(records: readonly LaborRecord[]): ReadonlySet<string> {
  const days = new Set<string>()
  for (const record of records) {
    if (record.work_date !== undefined) days.add(record.work_date)
  }
  return days
}

/** 按项目汇总当月工时，只保留有记录的项目并沿用项目目录顺序。 */
export function monthProjectTotals(
  records: readonly LaborRecord[], projects: readonly RegistrationProject[],
): readonly LaborProjectTotal[] {
  const totals = new Map<string, number>()
  for (const record of records) {
    const project = projects.find(item => item.id === record.project_id)
    const hours = Number(record.hours)
    if (project === undefined || !Number.isFinite(hours)) continue
    totals.set(project.code, (totals.get(project.code) ?? 0) + hours)
  }
  return projects.filter(project => totals.has(project.code)).map((project) => {
    return { code: project.code, name: project.name, hours: String(Math.round((totals.get(project.code) ?? 0) * 100) / 100) }
  })
}

/** 筛选所选日期的全部工时记录，保持后台返回顺序。 */
export function dayLaborRecords(records: readonly LaborRecord[], date: string): readonly LaborRecord[] {
  return records.filter(record => record.work_date === date)
}
