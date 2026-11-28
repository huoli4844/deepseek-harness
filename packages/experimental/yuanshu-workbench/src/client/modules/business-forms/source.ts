/** 表单数据层：同源请求、响应验证和账号隔离；不依赖 React 或展示文案。 */
/* oxlint-disable @stylistic/max-len, @stylistic/arrow-parens, typescript/no-base-to-string */
import { field, parseContent, parseWeeklyContent, type DailyDecision, type DailyForm, type EvidenceRef, type WeeklyDecision, type WeeklyForm } from '../../../business-forms/model.ts'
import { dailySurface, weeklySurface, type BusinessSurface } from '../../../business-forms/a2ui.ts'
import { parseDynamicDraft } from '../../../business-forms/dynamic-record.ts'
import { projectReportContent, type ProjectReportDraft } from '../../../business-forms/project-report.ts'
import { parseDynamicField, type DynamicField } from '../../../business-forms/dynamic-record.ts'

/** 保留 HTTP 业务码供容器决定重试和反馈，不显示原始响应。 */
export class BusinessFormError extends Error {
  constructor(readonly status: number, readonly newSessionRequired = false, readonly validationMessage?: string) { super('Business form request failed') }
}
import { rememberReportAccount } from './account-cache.ts'
import { hasReportReceipt, type ReportRecovery } from '../../../business-forms/recovery.ts'

const base = '/yuanshu-workbench/daily-report-runtime'

/** 登录跳转完成后并行初始化员工授权信息、Swagger 和 MCP 服务目录。 */
export async function initializeEnterpriseLogin(signal: AbortSignal): Promise<void> {
  if (typeof localStorage === 'undefined') return
  const token = localStorage.getItem('workbench-client-token'), tenant = localStorage.getItem('yuanshu-active-tenant')
  if (!token || !tenant) return
  const options = {
    method: 'POST', signal, credentials: 'same-origin',
    headers: { authorization: `Bearer ${token}`, 'X-Active-Tenant': tenant },
  } satisfies RequestInit
  await Promise.allSettled([
    fetch('/yuanshu-workbench/employee-access', options),
    fetch('/yuanshu-workbench/swagger-capabilities/login', options),
    fetch('/yuanshu-workbench/mcp-capabilities/login', options),
  ])
}

/** 判断是否有企业登录凭证，身份仍由宿主与后台校验。 */
export function hasEnterpriseLogin(): boolean {
  return Boolean(localStorage.getItem('workbench-client-token') && localStorage.getItem('yuanshu-active-tenant'))
}

/** 把凭证留在数据层闭包，只向容器暴露账号是否仍一致。 */
export function createCredentialGuard(): () => boolean {
  const token = localStorage.getItem('workbench-client-token'), tenant = localStorage.getItem('yuanshu-active-tenant')
  return () => token === localStorage.getItem('workbench-client-token') && tenant === localStorage.getItem('yuanshu-active-tenant')
}

async function request(path: string, signal: AbortSignal, method = 'GET', body?: object): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token'), tenant = localStorage.getItem('yuanshu-active-tenant')
  if (!token || !tenant) throw new BusinessFormError(401)
  const response = await fetch(`${base}${path}`, { method, signal, credentials: 'same-origin',
    headers: { authorization: `Bearer ${token}`, 'X-Active-Tenant': tenant, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    const bindingError = path.startsWith('/bind?') && response.status === 409
    const validationError = path.startsWith('/project-report-submit?') || (path.startsWith('/equipment-submit?') && (response.status === 400 || response.status === 422))
    const detail: unknown = bindingError || validationError ? await response.json().catch(() => null) : null
    const data = field(detail, 'data')
    const message = validationError ? field(data, 'validation_message') : undefined
    throw new BusinessFormError(response.status, bindingError && field(data, 'code') === 'new-session-required',
      typeof message === 'string' && message.length <= 500 ? message : undefined)
  }
  return field(await response.json(), 'data')
}

function projectFields(value: unknown): readonly DynamicField[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new BusinessFormError(502)
  const fields: DynamicField[] = []
  for (const item of value) {
    const def = parseDynamicField(item)
    if (!def) throw new BusinessFormError(502)
    fields.push(def)
  }
  return fields
}

function projectDraft(value: unknown): ProjectReportDraft {
  const id = field(value, 'id'), name = field(value, 'name'), start = field(value, 'start'), end = field(value, 'end')
  const position = field(value, 'position'), total = field(value, 'total'), state = field(value, 'state')
  const fields = projectFields(field(value, 'fields'))
  const content = projectReportContent(fields, field(value, 'content'))
  if (typeof id !== 'string' || typeof name !== 'string' || typeof start !== 'string' || typeof end !== 'string'
    || typeof position !== 'number' || typeof total !== 'number' || !content
    || (state !== 'pending' && state !== 'submitted' && state !== 'uncertain')) throw new BusinessFormError(502)
  return { id, name, start, end, fields, content, position, total, state, exportOnly: field(value, 'exportOnly') === true }
}

/** 校验项目周报的同源表单。 */
export async function pendingProjectReport(session: string, signal: AbortSignal) {
  const data = await request('/project-report-form?session_id=' + encodeURIComponent(session), signal)
  const raw = field(data, 'draft')
  if (!raw) return
  const draft = projectDraft(raw)
  const rows = field(data, 'rows')
  if (draft.exportOnly && Array.isArray(rows)) return { draft, rows: rows.map(projectDraft) }
  return { draft }
}

/** 仅在人工动作后提交、取消或转到下一份。 */
export async function decideProjectReport(session: string, draft: ProjectReportDraft, action: 'submit' | 'advance', signal: AbortSignal) {
  const result = await request('/project-report-' + action + '?session_id=' + encodeURIComponent(session), signal, 'POST',
    { id: draft.id, ...(action === 'submit' ? { content: draft.content } : {}) })
  if (action === 'submit' && field(result, 'submitted') !== true) throw new BusinessFormError(502)
}

/** 读取当前会话待核对的业务登记草稿。 */
export async function pendingEquipment(session: string, signal: AbortSignal) {
  return parseDynamicDraft(await request(`/equipment-form?session_id=${encodeURIComponent(session)}`, signal))
}

/** 人工提交运行时登记表单，宿主负责复核权限、契约和云端回执。 */
export async function submitDynamicRecord(session: string, id: string, content: Readonly<Record<string, string>>, signal: AbortSignal) {
  const data = await request(`/equipment-submit?session_id=${encodeURIComponent(session)}`, signal, 'POST', { id, content })
  if (field(data, 'simulated') === true) return { kind: 'simulation' as const }
  const receipt = field(data, 'receipt')
  if (typeof receipt !== 'string' || !receipt) throw new BusinessFormError(502)
  return { kind: 'saved' as const, receipt }
}

/** 关闭匹配的会话草稿，不执行后台写入。 */
export async function dismissEquipment(session: string, id: string, signal: AbortSignal) {
  await request(`/equipment-dismiss?session_id=${encodeURIComponent(session)}`, signal, 'POST', { id })
}
/** 会话缓存按后台实际身份分区，不使用演示身份或把凭证写入会话。 */
export async function assistantAccountKey(signal: AbortSignal): Promise<string> {
  const sameAccount = createCredentialGuard()
  const identity = await request('/context', signal)
  const user = field(identity, 'user'), tenant = field(identity, 'tenant')
  if (typeof user !== 'number' || typeof tenant !== 'number' || user <= 0 || tenant <= 0) throw new BusinessFormError(502)
  if (!sameAccount()) throw new BusinessFormError(403)
  const account = `${tenant}:${user}`
  void rememberReportAccount(account).catch(() => {})
  return account
}
/** 绑定或续租当前工作台会话；旧的无归属历史会话不能直接认领。 */
export async function bindAssistantSession(session: string, signal: AbortSignal): Promise<string | undefined> {
  const sameAccount = createCredentialGuard()
  const data = await request(`/bind?session_id=${encodeURIComponent(session)}`, signal, 'POST')
  const account = field(data, 'account')
  if (!sameAccount()) throw new BusinessFormError(403)
  if (typeof account !== 'string' || !/^\d+:\d+$/u.test(account)) return undefined
  void rememberReportAccount(account).catch(() => {})
  return account
}
/** 只接受受控日报表单，客户端不接受自定义回调 URL。 */
export function parseForm(value: unknown): DailyForm {
  const id = field(value, 'id'), date = field(value, 'work_date'), version = field(value, 'expected_version'), expiry = field(value, 'expires_at')
  const refs = field(value, 'evidence_refs')
  if (field(value, 'schema_id') !== 'daily-report.v1' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id)
    || field(value, 'template_id') !== 'edit' || field(value, 'template_version') !== 1
    || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0
    || typeof expiry !== 'number' || !Number.isFinite(expiry) || !Array.isArray(refs) || refs.length > 100
    || field(value, 'coverage') !== 'verified-active-workbench-sessions') throw new BusinessFormError(502)
  const evidence: readonly EvidenceRef[] = refs.map((item) => {
    const session = field(item, 'session_id'), seq = field(item, 'seq')
    if (typeof session !== 'string' || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) throw new BusinessFormError(502)
    return { session_id: session, seq }
  })
  return { id, schema_id: 'daily-report.v1', template_id: 'edit', template_version: 1,
    work_date: date, expected_version: version, expires_at: expiry,
    coverage: 'verified-active-workbench-sessions', evidence_refs: evidence, content: parseContent(field(value, 'content')) }
}
/** 查询本会话待确认表单；受控布局在本地由白名单生成。 */
export async function pendingForm(session: string, signal: AbortSignal): Promise<{
  readonly form: DailyForm
  readonly surface: BusinessSurface
} | null> {
  const data = await request(`/form?session_id=${encodeURIComponent(session)}`, signal)
  const value = field(data, 'form')
  if (value === null) return null
  const form = parseForm(value)
  const surface = dailySurface(form.id, form.content)
  if (JSON.stringify(field(data, 'surface')) !== JSON.stringify(surface)) throw new BusinessFormError(502)
  return { form, surface }
}
/** 原始人工确认直接交给宿主回调，模型不参与改写。 */
export async function decideForm(session: string, decision: DailyDecision, signal: AbortSignal): Promise<void> {
  const data = await request(`/decision?session_id=${encodeURIComponent(session)}`, signal, 'POST', decision)
  if (decision.action === 'cancel') return
  const report = field(data, 'report'), status = field(report, 'status')
  if ((decision.action === 'submit' ? status !== 'submitted' : status !== 'draft')
    || typeof field(report, 'id') !== 'number' || typeof field(report, 'version') !== 'number') throw new BusinessFormError(502)
}

/** 查询当前会话待确认周报表单。 */
export async function pendingWeeklyForm(session: string, signal: AbortSignal): Promise<{ readonly form: WeeklyForm; readonly surface: BusinessSurface } | null> {
  const data = await request(`/weekly-form?session_id=${encodeURIComponent(session)}`, signal)
  const value = field(data, 'form')
  if (value === null) return null
  const id = field(value, 'id'), start = field(value, 'period_start'), end = field(value, 'period_end'), expiry = field(value, 'expires_at')
  if (field(value, 'schema_id') !== 'weekly-report.v1' || field(value, 'template_id') !== 'weekly-edit'
    || typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id) || typeof start !== 'string' || typeof end !== 'string'
    || typeof expiry !== 'number') throw new BusinessFormError(502)
  const projects = field(value, 'projects')
  if (!Array.isArray(projects)) throw new BusinessFormError(502)
  const projectOptions = projects.flatMap(item => {
    const projectId = field(item, 'id'), code = field(item, 'code'), name = field(item, 'name')
    return typeof projectId === 'number' && typeof code === 'string' && typeof name === 'string' ? [{ id: projectId, code, name }] : []
  })
  const revision = field(value, 'base_revision')
  const form: WeeklyForm = { id, schema_id: 'weekly-report.v1', template_id: 'weekly-edit', template_version: 1,
    period_start: start, period_end: end, expected_version: typeof field(value, 'expected_version') === 'number' ? field(value, 'expected_version') as number : 0,
    ...(typeof revision === 'string' ? { base_revision: revision } : {}),
    content: parseWeeklyContent(field(value, 'content')), projects: projectOptions, evidence_refs: [], coverage: String(field(value, 'coverage') ?? ''), expires_at: expiry }
  const surface = weeklySurface(form.id, form.content)
  if (JSON.stringify(field(data, 'surface')) !== JSON.stringify(surface)) throw new BusinessFormError(502)
  return { form, surface }
}
/** 提交人工确认后的周报内容；保存结果仍由后台回执决定。 */
export async function decideWeeklyForm(session: string, decision: WeeklyDecision, signal: AbortSignal): Promise<void> {
  const data = await request(`/weekly-decision?session_id=${encodeURIComponent(session)}`, signal, 'POST', decision)
  if (decision.action === 'cancel') return
  const report = field(data, 'report')
  if (!hasReportReceipt(report, decision.action)) throw new BusinessFormError(502)
}

/** 恢复由本人确认的请求，重新验证账号与服务端回执。 */
export async function submitRecovery(input: ReportRecovery, signal: AbortSignal): Promise<void> {
  const data = await request('/recover', signal, 'POST', input)
  if (!hasReportReceipt(field(data, 'report'), input.action, input.date, input.kind)) throw new BusinessFormError(502)
}

/** 读取当前对话中待员工预览的个人页请求。 */
export async function pendingPersonalPage(session: string, signal: AbortSignal) {
  const value = await request(`/personal-page-draft?session_id=${encodeURIComponent(session)}`, signal)
  const id = field(value, 'id'), name = field(value, 'name'), account = field(value, 'account')
  if (typeof id !== 'string' || typeof name !== 'string' || typeof account !== 'string'
    || !/^\d+:\d+$/u.test(account)) return
  // 草稿可携带对话预填的卡片；只透传对象数组，具体结构由个人页编辑器校验。
  const widgets = field(value, 'widgets')
  return {
    id, name, account,
    ...(Array.isArray(widgets) ? { widgets: widgets.filter(item => typeof item === 'object' && item !== null) } : {}),
  } as const
}

/** 关闭已处理的对话请求。 */
export async function dismissPersonalPage(session: string, id: string, signal: AbortSignal) {
  await request(`/personal-page-dismiss?session_id=${encodeURIComponent(session)}`, signal, 'POST', { id })
}
