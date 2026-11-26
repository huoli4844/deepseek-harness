/** 表单数据层：同源请求、响应验证和账号隔离；不依赖 React 或展示文案。 */
/* oxlint-disable @stylistic/max-len, @stylistic/arrow-parens, typescript/no-base-to-string */
import { field, parseContent, parseWeeklyContent, type DailyDecision, type DailyForm, type EvidenceRef, type WeeklyDecision, type WeeklyForm } from '../../../business-forms/model.ts'
import { dailySurface, weeklySurface, type BusinessSurface } from '../../../business-forms/a2ui.ts'

/** 保留 HTTP 业务码供容器决定重试和反馈，不显示原始响应。 */
export class BusinessFormError extends Error {
  constructor(readonly status: number, readonly newSessionRequired = false) { super('Business form request failed') }
}
const base = '/yuanshu-workbench/daily-report-runtime'

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
    const detail: unknown = path.startsWith('/bind?') && response.status === 409
      ? await response.json().catch(() => null) : null
    throw new BusinessFormError(response.status, field(field(detail, 'data'), 'code') === 'new-session-required')
  }
  return field(await response.json(), 'data')
}
/** 会话缓存按后台实际身份分区，不使用演示身份或把凭证写入会话。 */
export async function assistantAccountKey(signal: AbortSignal): Promise<string> {
  const identity = await request('/context', signal)
  const user = field(identity, 'user'), tenant = field(identity, 'tenant')
  if (typeof user !== 'number' || typeof tenant !== 'number' || user <= 0 || tenant <= 0) throw new BusinessFormError(502)
  return `${tenant}:${user}`
}
/** 绑定或续租当前工作台会话；旧的无归属历史会话不能直接认领。 */
export async function bindAssistantSession(session: string, signal: AbortSignal): Promise<void> {
  await request(`/bind?session_id=${encodeURIComponent(session)}`, signal, 'POST')
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
  const form: WeeklyForm = { id, schema_id: 'weekly-report.v1', template_id: 'weekly-edit', template_version: 1,
    period_start: start, period_end: end, expected_version: typeof field(value, 'expected_version') === 'number' ? field(value, 'expected_version') as number : 0,
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
  if (report === null || report === undefined) throw new BusinessFormError(502)
}
