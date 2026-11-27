/** 定义项目选择、工时及周报的响应字段，不依赖界面或请求。 */

/** 当前租户可选择的项目。 */
export interface RegistrationProject {
  readonly id: number
  readonly code: string
  readonly name: string
}

/** 当前项目的可选工作事项。 */
export interface RegistrationTask extends RegistrationProject {
  readonly status: string
}

/** 工时页面使用的项目及日期筛选条件。 */
export interface RegistrationRange {
  readonly projectCode: string
  readonly dateFrom: string
  readonly dateTo: string
  readonly status?: string
}

/** 工时填报表单字段。 */
export interface LaborDraft {
  readonly completion_status?: string
  readonly task_id?: number
  readonly work_date: string
  readonly hours: string
  readonly work_type: string
  readonly description: string
}

/** 工时表格中的真实记录及后台授权。 */
export interface LaborRecord {
  readonly completion_status?: string
  readonly id: number
  readonly user_id: number
  readonly project_id: number
  readonly task_id?: number
  readonly work_date?: string
  readonly hours: string
  readonly work_type: string
  readonly description: string
  readonly status: string
  readonly submitted_at?: string
  readonly approved_at?: string
  readonly approved_by?: number
  readonly created_at?: string
  readonly updated_at?: string
  readonly can_edit: boolean
  readonly can_submit: boolean
}

/** 周报可登记的正文。 */
export interface WeeklyDraft {
  readonly progress_summary: string
  readonly completed_work: string
  readonly planned_work: string
  readonly issues_and_risks: string
  readonly need_support: string
}

/** 后台生成的周报及审计字段；项目关联保存在正文事项行内。 */
export interface WeeklyReport extends WeeklyDraft {
  readonly id: number
  readonly period_start: string
  readonly period_end: string
  readonly status: 'draft' | 'submitted'
  readonly created_by: number
  readonly submitted_by?: number
  readonly submitted_at?: string
  readonly created_at?: string
  readonly updated_at?: string
}

/** 周报登记和已批准工时汇总。 */
export interface WeeklySnapshot {
  readonly report?: WeeklyReport
  readonly totalHours: string
  readonly employees: readonly { readonly user_id: number; readonly hours: string }[]
}

/** 支持项目和工时后台分页的响应。 */
export interface RegistrationPage<T> {
  readonly items: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly archiveTotal?: number
}
