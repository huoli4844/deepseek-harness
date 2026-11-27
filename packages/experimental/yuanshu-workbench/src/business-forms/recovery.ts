/** 报表恢复请求及回执校验，供同源通道与客户端共用。 */
import { field, parseContent, parseWeeklyContent, type DailyContent, type EvidenceRef, type WeeklyContent, type WeeklyItem } from './model.ts'

interface RecoveryBase {
  readonly account: string
  readonly date: string
  readonly request_id: string
  readonly action: 'save' | 'submit'
}

/** 恢复请求保留首次人工确认的业务日期和幂等标识。 */
export type ReportRecovery = RecoveryBase & (
  { readonly kind: 'daily'; readonly content: DailyContent; readonly version: number; readonly evidence: readonly EvidenceRef[] }
  | { readonly kind: 'weekly'; readonly content: WeeklyContent; readonly baseRevision: string | null; readonly previousContent?: WeeklyContent }
)

/** 校验浏览器缓存恢复请求，只返回允许传给业务适配器的字段。 */
export function parseRecovery(value: unknown): ReportRecovery {
  const account = field(value, 'account'), date = field(value, 'date'), request = field(value, 'request_id')
  const action = field(value, 'action'), kind = field(value, 'kind'), content = field(value, 'content')
  if (typeof account !== 'string' || !/^\d+:\d+$/u.test(account) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || typeof request !== 'string' || !/^[0-9a-f-]{36}$/u.test(request) || (action !== 'save' && action !== 'submit')) throw new Error('Invalid recovery request')
  const base = { account, date, request_id: request, action } satisfies RecoveryBase
  if (kind === 'weekly') {
    const parsed = parseWeeklyContent(content), baseRevision = field(value, 'baseRevision')
    if (parsed.period_start !== date || (baseRevision !== null && typeof baseRevision !== 'string')) throw new Error('Invalid weekly recovery')
    const previous = field(value, 'previousContent')
    const previousContent = previous === undefined ? undefined : parseWeeklyContent(previous)
    if (previousContent && previousContent.period_start !== date) throw new Error('Invalid previous weekly content')
    return { ...base, kind, content: parsed, baseRevision, ...(previousContent ? { previousContent } : {}) }
  }
  const version = field(value, 'version'), refs = field(value, 'evidence')
  if (kind !== 'daily' || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0
    || !Array.isArray(refs) || refs.length > 100) throw new Error('Invalid daily recovery')
  const evidence = refs.map((ref) => {
    const session = field(ref, 'session_id'), seq = field(ref, 'seq')
    if (typeof session !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(session)
      || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) throw new Error('Invalid recovery evidence')
    return { session_id: session, seq }
  })
  return { ...base, kind, version, evidence, content: parseContent(content) }
}

/** 只接受与人工操作匹配的后台回执。 */
export function hasReportReceipt(report: unknown, action: RecoveryBase['action'], date?: string, kind?: ReportRecovery['kind']): boolean {
  const id = field(report, 'id')
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    && field(report, 'status') === (action === 'submit' ? 'submitted' : 'draft')
    && (kind !== 'daily' || typeof field(report, 'version') === 'number')
    && (date === undefined || field(report, kind === 'daily' ? 'work_date' : 'period_start') === date)
}

/** 去除仅供界面使用的事项标识与项目名称，生成 API 契约中的行对象。 */
export function weeklyRowPayload(items: readonly WeeklyItem[]) {
  return items.map(item => ({ project_code: item.project_code, work_type: item.work_type,
    description: item.description, completion_status: item.completion_status, has_risk: item.has_risk,
    risk_details: item.has_risk && item.risk_details ? item.risk_details : null }))
}


/** 周报写入与回执比对共享同一份正文映射。 */
export function weeklyPayload(start: string, content: WeeklyContent) {
  const items = weeklyRowPayload(content.items)
  return { period_start: start, progress_summary: content.progress_summary,
    completed_work: items.length > 0 ? JSON.stringify(items) : content.completed_work,
    planned_work: content.planned_work, issues_and_risks: content.issues_and_risks || null,
    need_support: content.need_support || null }
}
