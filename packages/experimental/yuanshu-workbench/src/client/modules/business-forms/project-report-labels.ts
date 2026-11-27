/** 项目周报字段标签：既有字段用本地文案，新增字段使用 Swagger 定义。 */
import type { DynamicField } from '../../../business-forms/dynamic-record.ts'
import type { WorkbenchT } from '../../app/page-api.ts'

/**
 * 返回字段的中文标签。
 * @param t - 工作台文案函数。
 * @param def - 字段定义。
 * @returns 已知字段的本地文案，其余使用契约标签。
 */
export function projectReportLabel(t: WorkbenchT, def: DynamicField): string {
  switch (def.key) {
    case 'progress_summary': return t('projectReport.progress_summary')
    case 'completed_work': return t('projectReport.completed_work')
    case 'planned_work': return t('projectReport.planned_work')
    case 'issues_and_risks': return t('projectReport.issues_and_risks')
    case 'need_support': return t('projectReport.need_support')
    default: return def.label
  }
}
