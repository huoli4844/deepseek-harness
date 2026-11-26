/** 日报表单共享白名单与数据契约；不依赖 React、网络或宿主框架。 */

/** 后台允许编辑的正文列；其他数据库字段不进入生成界面。 */
export const DAILY_FIELDS = ['completed_work', 'in_progress_work', 'planned_work', 'issues_and_risks', 'need_support'] as const
/** 日报正文列。 */
export type DailyField = typeof DAILY_FIELDS[number]
/** 人工可编辑正文。 */
export type DailyContent = Readonly<Record<DailyField, string>>
/** 会话出处只用于追溯，不能作为访问凭证。 */
export interface EvidenceRef { readonly session_id: string; readonly seq: number }
/** 已读取并裁剪的本人会话依据。 */
export interface WorkEvidence extends EvidenceRef {
  readonly kind: 'user/message' | 'assistant/message' | 'tool/result' | 'deliverable'
  readonly paths?: readonly string[]
  /** 宿主从本地调用记录取得的工具名，用于区分查询、执行和成果。 */
  readonly tool?: string
  readonly outcome: 'unverified' | 'success' | 'error' | 'interrupted'
  readonly time: string
  readonly text: string
  readonly truncated: boolean
}
/** 后台可信身份与表单契约。 */
export interface DailyIdentity { readonly user: number; readonly tenant: number; readonly canWrite: boolean }
/** 日报持久化结果，审计值全部由后台产生。 */
export interface DailyReport extends DailyContent {
  readonly id: number
  readonly work_date: string
  readonly status: 'draft' | 'submitted'
  readonly version: number
  readonly evidence_refs: readonly EvidenceRef[]
  readonly created_at: string
  readonly updated_at: string
  readonly submitted_at: string | null
}
/** 已验证的待确认弹窗；模型不能提供动作地址、脚本或身份字段。 */
export interface DailyForm {
  readonly template_id: 'edit'
  readonly template_version: 1
  readonly id: string
  readonly schema_id: 'daily-report.v1'
  readonly work_date: string
  readonly expected_version: number
  readonly content: DailyContent
  readonly evidence_refs: readonly EvidenceRef[]
  readonly coverage: string
  readonly expires_at: number
}
/** 浏览器发出的人工确认事件。 */
export interface DailyDecision {
  readonly form_id: string
  readonly request_id: string
  readonly action: 'save' | 'submit' | 'cancel'
  readonly content: DailyContent
}

/** 周报中可人工增删改的工作事项；项目编码为空表示需要用户补选。 */
export interface WeeklyItem {
  readonly id: string
  readonly project_code: string
  readonly project_name: string
  readonly work_type: string
  readonly work_item: string
  readonly completion_status: string
  readonly has_risk: boolean
  readonly risk_details: string
}
export interface WeeklyProject { readonly id: number; readonly code: string; readonly name: string }
/** 周报 A2UI 编辑内容；正文与事项均受本地白名单校验。 */
export interface WeeklyContent {
  readonly period_start: string
  readonly progress_summary: string
  readonly completed_work: string
  readonly planned_work: string
  readonly issues_and_risks: string
  readonly need_support: string
  readonly items: readonly WeeklyItem[]
}
export interface WeeklyForm {
  readonly template_id: 'weekly-edit'
  readonly template_version: 1
  readonly id: string
  readonly schema_id: 'weekly-report.v1'
  readonly period_start: string
  readonly period_end: string
  readonly expected_version: number
  readonly content: WeeklyContent
  readonly projects: readonly WeeklyProject[]
  readonly evidence_refs: readonly EvidenceRef[]
  readonly coverage: string
  readonly expires_at: number
}
export interface WeeklyDecision {
  readonly form_id: string
  readonly request_id: string
  readonly action: 'save' | 'submit' | 'cancel'
  readonly content: WeeklyContent
}

/** 校验周报事项和正文，拒绝模型注入未知字段、脚本或超长内容。 */
export function parseWeeklyContent(value: unknown): WeeklyContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid weekly report content')
  const text = (key: keyof Omit<WeeklyContent, 'period_start' | 'items'>): string => {
    const result = field(value, key)
    if (typeof result !== 'string' || Array.from(result).length > 10_000 || result.includes('\0')) throw new Error('Invalid weekly report field')
    return result
  }
  const period = field(value, 'period_start')
  const rawItems = field(value, 'items')
  if (typeof period !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(period) || !Array.isArray(rawItems) || rawItems.length > 200) throw new Error('Invalid weekly report period or items')
  const items = rawItems.map((item, index): WeeklyItem => {
    const read = (key: keyof WeeklyItem): string => {
      const result = field(item, key)
      if (typeof result !== 'string' || Array.from(result).length > 2_000 || result.includes('\0')) throw new Error('Invalid weekly report item')
      return result
    }
    const risk = field(item, 'has_risk')
    if (typeof risk !== 'boolean') throw new Error('Invalid weekly report risk')
    return { id: read('id') || `item-${index + 1}`, project_code: read('project_code'), project_name: read('project_name'),
      work_type: read('work_type'), work_item: read('work_item'), completion_status: read('completion_status'),
      has_risk: risk, risk_details: read('risk_details') }
  })
  return { period_start: period, progress_summary: text('progress_summary'), completed_work: text('completed_work'),
    planned_work: text('planned_work'), issues_and_risks: text('issues_and_risks'), need_support: text('need_support'), items }
}
/** 只取自有字段，拒绝原型链成员。 */
export function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined
}
/** 白名单正文校验；未知字段和超长正文均不接受。 */
export function parseContent(value: unknown): DailyContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).length !== DAILY_FIELDS.length) throw new Error('Invalid daily report content')
  const read = (key: DailyField): string => {
    const text = field(value, key)
    if (typeof text !== 'string' || Array.from(text).length > 10_000 || text.includes('\0')) throw new Error('Invalid daily report field')
    return text
  }
  return { completed_work: read('completed_work'), in_progress_work: read('in_progress_work'),
    planned_work: read('planned_work'), issues_and_risks: read('issues_and_risks'), need_support: read('need_support') }
}
/** 北京时间对应的自然日，避免依赖设备时区。 */
export function beijingDay(time = Date.now()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value ?? '').join('-')
}
