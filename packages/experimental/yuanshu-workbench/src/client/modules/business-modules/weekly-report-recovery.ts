/** 登记页的失败快照转换为待办表单，复用同一周报恢复协议。 */
import type { WeeklyContent, WeeklyForm } from '../../../business-forms/model.ts'
import type { ReportTask } from '../business-forms/recovery-store.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { parseCompletedRows, toWeeklyItems } from './weekly-report-rows.ts'
import type { WeeklyDraft, WeeklyReport } from './project-registration-model.ts'
import { moveDate } from './project-registration-viewmodel.ts'

/** 在调用保存或提交前保存当前人工确认的内容和已读版本。 */
export function weeklyRegistrationAttempt(account: string, start: string, draft: WeeklyDraft,
  report: WeeklyReport | undefined, action: 'save' | 'submit', formId: string): ReportTask {
  const content: WeeklyContent = { ...draft, period_start: start, completed_work: '',
    items: toWeeklyItems(parseCompletedRows(draft.completed_work)) }
  const form: WeeklyForm = { id: formId, template_id: 'weekly-edit', template_version: 1, schema_id: 'weekly-report.v1',
    period_start: start, period_end: moveDate(start, 6), expected_version: 0, content, projects: [], evidence_refs: [],
    coverage: '', expires_at: 0 }
  return { form, request: { account, date: start, kind: 'weekly', action, request_id: randomUUID(), content,
    baseRevision: report?.updated_at ?? null }, time: Date.now(), result: 'sending' }
}
