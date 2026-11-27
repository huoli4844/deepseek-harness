/** 保存本机待办和报表回执，仅按已核验账号读取，不保存凭证。 */
import type { DailyForm, WeeklyForm } from '../../../business-forms/model.ts'
import type { ReportRecovery } from '../../../business-forms/recovery.ts'

type TaggedRequest =
  | { readonly request: Extract<ReportRecovery, { kind: 'daily' }>; readonly form: DailyForm }
  | { readonly request: Extract<ReportRecovery, { kind: 'weekly' }>; readonly form: WeeklyForm }

/** 待办保留原始表单、最后尝试时的正文和可理解的失败类别。 */
export type ReportTask = TaggedRequest & {
  readonly time: number
  readonly result: 'sending' | 'uncertain' | 'invalid' | 'auth' | 'conflict' | 'expired' | 'success'
}

const prefix = 'dsh.yuanshu.report-recovery.v1.'
/** 通知同一工作台更新待办列表。 */
export const recoveryChanged = 'yuanshu-report-recovery'

/** 按表单存放最后一次尝试，成功时替换对应待办。 */
export function recordReportTask(task: ReportTask): void {
  const key = prefix + task.request.account + '.' + task.form.id
  const { request, time, result } = task
  localStorage.setItem(key, JSON.stringify(result === 'success'
    ? { time, result, request: { action: request.action, kind: request.kind, date: request.date } }
    : task))
  window.dispatchEvent(new Event(recoveryChanged))
}

/** 回执展示只需要操作、业务日期和尝试时间。 */
export type ReportReceipt = {
  readonly time: number
  readonly result: 'success'
  readonly request: Pick<ReportRecovery, 'action' | 'kind' | 'date'>
}

/** 读取当前账号的待办与成功回执，按最近操作排序。 */
export function reportTasks(account: string): readonly (ReportTask | ReportReceipt)[] {
  const scope = prefix + account + '.'
  const tasks: (ReportTask | ReportReceipt)[] = []
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(scope)) continue
    try {
      const row = JSON.parse(localStorage.getItem(key) ?? 'null') as ReportTask | ReportReceipt | null
      if (row && Number.isFinite(row.time)
        && (row.result === 'success' || row.request.account === account)) tasks.push(row)
    } catch { /* 损坏的单条记录不影响其他待办。 */ }
  }
  return tasks.sort((a, b) => b.time - a.time)
}
