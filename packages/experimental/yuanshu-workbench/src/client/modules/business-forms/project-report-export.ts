/** 项目周报导出为本地 Excel 文件，不访问企业后台或更改记录。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ProjectReportDraft } from '../../../business-forms/project-report.ts'
import { projectReportLabel } from './project-report-labels.ts'

/** 一行对应一个项目，列取自当前 Swagger 字段定义。 */
export async function downloadProjectReports(rows: readonly ProjectReportDraft[], t: WorkbenchT) {
  const first = rows[0]
  if (!first) throw new Error('Missing project reports')
  const fields = first.fields.filter(def => !def.unsupported)
  const { utils, writeFile } = await import('xlsx')
  const workbook = utils.book_new()
  const sheet = utils.aoa_to_sheet([
    [t('weekly.form.project'), t('projectReport.start'), t('projectReport.end'), ...fields.map(def => projectReportLabel(t, def))],
    ...rows.map(row => [row.name, row.start, row.end, ...fields.map(def => row.content[def.key] ?? '')]),
  ])
  sheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, ...fields.map(() => ({ wch: 36 }))]
  utils.book_append_sheet(workbook, sheet, t('projectReport.sheet'))
  writeFile(workbook, t('projectReport.sheet') + '-' + first.start + '.xlsx')
}
