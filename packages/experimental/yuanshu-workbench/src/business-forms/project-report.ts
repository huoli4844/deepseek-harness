/** 项目周报字段、正文校验和北京时间周期，不依赖网络或 React。 */
import { beijingDay, field } from './model.ts'
import type { DynamicField } from './dynamic-record.ts'

/** Swagger 不可用时使用的项目周报文本字段。 */
export const projectReportFallbackFields: readonly DynamicField[] = [
  { key: 'progress_summary', label: '本周进展摘要', type: 'string', required: false },
  { key: 'completed_work', label: '本周已完成工作', type: 'string', required: false },
  { key: 'planned_work', label: '下周工作计划', type: 'string', required: false },
  { key: 'issues_and_risks', label: '问题与风险', type: 'string', required: false },
  { key: 'need_support', label: '需要的支持', type: 'string', required: false },
]

/** 人工复核的正文。 */
export type ProjectReportContent = Record<string, string>

/** 由工作台按周期和提交状态自动填充，不接受人工编辑。 */
const managedReportFields = new Set(['period_start', 'period_end', 'report_type', 'status'])
/** 既有正文的展示顺序，契约新增字段排在其后。 */
const reportFieldOrder = ['progress_summary', 'completed_work', 'planned_work', 'issues_and_risks', 'need_support']

/** 可渲染且允许提交的字段；系统字段和不支持的字段不进入界面和请求体。 */
export function projectReportFieldsOf(fields: readonly DynamicField[]): readonly DynamicField[] {
  const position = (key: string) => {
    const index = reportFieldOrder.indexOf(key)
    return index === -1 ? reportFieldOrder.length : index
  }
  return fields.filter(def => !def.unsupported && !managedReportFields.has(def.key))
    .toSorted((left, right) => position(left.key) - position(right.key))
}

/** 字段是否为人工可编辑正文。 */
export function projectReportEditable(def: DynamicField): boolean {
  return !def.unsupported && !managedReportFields.has(def.key)
}

/** 当前北京时间自然周。 */
export function projectReportWeek(now = Date.now()) {
  const start = new Date(beijingDay(now) + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * 只接受字段定义内的文本正文。
 * @param fields - 当前契约字段。
 * @param value - 人工填写的内容。
 * @returns 校验通过的正文，含未知或超长值时返回 undefined。
 */
export function projectReportContent(fields: readonly DynamicField[], value: unknown): ProjectReportContent | undefined {
  const result: ProjectReportContent = {}
  for (const def of projectReportFieldsOf(fields)) {
    const part = field(value, def.key)
    if (part === undefined) { result[def.key] = ''; continue }
    if (typeof part !== 'string' || part.length > 8000 || part.includes('\0')) return
    result[def.key] = part
  }
  return result
}

/** 核对界面只拿到当前项目、字段定义及本批草稿的进度。 */
export interface ProjectReportDraft {
  readonly id: string
  readonly name: string
  readonly start: string
  readonly end: string
  readonly fields: readonly DynamicField[]
  readonly content: ProjectReportContent
  readonly position: number
  readonly total: number
  readonly state: 'pending' | 'submitted' | 'uncertain'
  readonly exportOnly: boolean
}
