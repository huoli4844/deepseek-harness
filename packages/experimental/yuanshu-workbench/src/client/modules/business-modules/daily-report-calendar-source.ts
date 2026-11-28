/** 本人日报的只读数据层，校验月历和详情字段；只访问宿主白名单，不依赖 React。 */
import { field } from '../../../business-forms/model.ts'
import { createCredentialGuard } from '../business-forms/source.ts'

/** 日历中的状态来自后台，不以本地工作记录代替提交状态。 */
export interface DailyReportDay {
  readonly date: string
  readonly status: 'draft' | 'submitted'
}

/** 日报正文仅保留正式数据库/API 中已定义的字段。 */
export interface DailyCalendarReport {
  readonly work_date: string
  readonly status: 'draft' | 'submitted'
  readonly completed_work: string
  readonly in_progress_work: string
  readonly planned_work: string
  readonly issues_and_risks: string
  readonly need_support: string
  readonly submitted_at?: string
}

async function read(path: string, signal: AbortSignal): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw new Error('YuanShu login required')
  const sameAccount = createCredentialGuard()
  const response = await fetch(`/yuanshu-workbench/daily-reports/${path}`, {
    signal, headers: { authorization: `Bearer ${token}`, 'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '' },
  })
  if (!sameAccount() || !response.ok) throw new Error('YuanShu daily report unavailable')
  const body: unknown = await response.json()
  const code = field(body, 'code')
  if (code !== undefined && ![0, 200, '0', '200'].some(value => value === code)) throw new Error('Invalid daily response')
  return field(body, 'data')
}

/** 一次读取所选月份的日报状态，日期不在该月或重复时拒绝响应。 */
export async function loadDailyCalendar(month: string, signal: AbortSignal): Promise<readonly DailyReportDay[]> {
  const data = await read(`calendar?month=${encodeURIComponent(month)}`, signal)
  const days = field(data, 'days')
  if (field(data, 'month') !== month || !Array.isArray(days)) throw new Error('Invalid daily calendar')
  const seen = new Set<string>()
  return days.map((value) => {
    const date = field(value, 'work_date'), status = field(value, 'status')
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || date.slice(0, 7) !== month || seen.has(date)
      || (status !== 'draft' && status !== 'submitted')) throw new Error('Invalid daily calendar day')
    seen.add(date)
    return { date, status }
  })
}

/** 按所选日期读取本人日报；不存在与查询失败严格区分。 */
export async function loadCalendarDailyReport(date: string, signal: AbortSignal): Promise<DailyCalendarReport | null> {
  const value = field(await read(encodeURIComponent(date), signal), 'report')
  if (value === null) return null
  const status = field(value, 'status')
  if (field(value, 'work_date') !== date || (status !== 'draft' && status !== 'submitted')) throw new Error('Invalid daily report')
  const text = (key: string) => {
    const result = field(value, key)
    if (result === null) return ''
    if (typeof result !== 'string') throw new Error('Invalid daily report content')
    return result
  }
  const submitted = field(value, 'submitted_at')
  return { work_date: date, status, completed_work: text('completed_work'), in_progress_work: text('in_progress_work'),
    planned_work: text('planned_work'), issues_and_risks: text('issues_and_risks'), need_support: text('need_support'),
    ...(typeof submitted === 'string' ? { submitted_at: submitted } : {}) }
}
