/** 日报同源人工通道；严格限定动作、来源、请求体和会话账号，不注册成模型工具。 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PersonalPageDrafts } from './personal-page-drafts.ts'
import type { registerProjectReports } from './plugins/yuanshu-project-reports/index.ts'
import { dailySurface, weeklySurface } from './business-forms/a2ui.ts'
import { field, parseContent, parseWeeklyContent, type DailyDecision, type WeeklyDecision } from './business-forms/model.ts'
import { bindOwner, SessionOwnershipError } from './plugins/yuanshu-work-evidence/index.ts'
import { ReportRequestError, type Credential, type WorkRecords } from './plugins/yuanshu-work-records/index.ts'
import type { BusinessForms } from './plugins/yuanshu-business-forms/index.ts'
import type { WorkJournal } from './plugins/yuanshu-work-journal/index.ts'
import { DynamicValidationError } from './plugins/yuanshu-equipment-intake/dynamic-registry.ts'
import type { registerEquipmentIntake } from './plugins/yuanshu-equipment-intake/index.ts'
import { loadEmployee, YuanShuSessionExpired } from './employee.ts'

type EquipmentIntake = ReturnType<typeof registerEquipmentIntake>
type ProjectReports = ReturnType<typeof registerProjectReports>
const projectActions = ['/project-report-form', '/project-report-submit', '/project-report-advance']

import { parseRecovery, hasReportReceipt } from './business-forms/recovery.ts'
import { recoverReport } from './plugins/yuanshu-work-records/recover-report.ts'

const base = '/yuanshu-workbench/daily-report-runtime'

function send(res: ServerResponse, status: number, data?: unknown): void {
  res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify({ data: data ?? null }))
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    if (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) throw new ReportRequestError(400)
    const bytes = Buffer.from(chunk)
    size += bytes.length
    if (size > 256 * 1024) throw new ReportRequestError(413)
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ReportRequestError(400) }
}

function decision(value: unknown): DailyDecision {
  const action = field(value, 'action'), form = field(value, 'form_id'), request = field(value, 'request_id')
  if (!['save', 'submit', 'cancel'].includes(String(action)) || typeof form !== 'string' || typeof request !== 'string'
    || !/^[0-9a-f-]{36}$/u.test(form) || !/^[0-9a-f-]{36}$/u.test(request)
    || typeof value !== 'object' || value === null || Object.keys(value).length !== 4) throw new ReportRequestError(400)
  if (action !== 'save' && action !== 'submit' && action !== 'cancel') throw new ReportRequestError(400)
  return { action, form_id: form, request_id: request, content: parseContent(field(value, 'content')) }
}
function weeklyDecision(value: unknown): WeeklyDecision {
  const action = field(value, 'action'), form = field(value, 'form_id'), request = field(value, 'request_id')
  if (!['save', 'submit', 'cancel'].includes(String(action)) || typeof form !== 'string' || typeof request !== 'string'
    || !/^[0-9a-f-]{36}$/u.test(form) || !/^[0-9a-f-]{36}$/u.test(request)) throw new ReportRequestError(400)
  return { action: action as WeeklyDecision['action'], form_id: form, request_id: request, content: parseWeeklyContent(field(value, 'content')) }
}

/** 注册原生宿主鉴权的同源路由，写请求额外校验 Origin 与浏览器 Fetch Metadata。 */
export function registerDailyRoutes(ctx: Context, records: WorkRecords, forms: BusinessForms, journal: WorkJournal,
  equipment?: EquipmentIntake,
  api?: string,
  onApiError?: (req: IncomingMessage, res: ServerResponse) => void,
  personalPages?: PersonalPageDrafts, projectReports?: ProjectReports): void {
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: base, auth: 'required', async handler(req, res) {
    const controller = new AbortController(), close = () => { controller.abort() }
    const timeout = setTimeout(close, 30_000)
    res.once('close', close)
    try {
      await route(ctx, records, forms, journal, req, res, controller.signal, equipment, api, personalPages, projectReports)
    } catch (error) {
      const status = error instanceof ReportRequestError ? error.status : error instanceof SyntaxError ? 400 : 502
      ctx.logger.warn('Daily report runtime failed: %s %s %s', req.method, new URL(req.url ?? '/', 'http://localhost').pathname, status)
      if (!res.headersSent) send(res, status, error instanceof DynamicValidationError ? { validation_message: error.detail } : undefined)
      if (status >= 500 || status === 404) onApiError?.(req, res)
    } finally { clearTimeout(timeout); res.off('close', close) }
  } }), 'daily-report: human routes')
}

async function route(ctx: Context, records: WorkRecords, forms: BusinessForms, journal: WorkJournal,
  req: IncomingMessage,
  res: ServerResponse,
  signal: AbortSignal,
  equipment?: EquipmentIntake,
  api?: string,
  personalPages?: PersonalPageDrafts, projectReports?: ProjectReports): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const action = url.pathname.slice(base.length)
  if (!['/context', '/bind', '/form', '/decision', '/weekly-form', '/weekly-decision', '/recover', '/equipment-form', '/equipment-dismiss', '/equipment-submit', '/personal-page-draft', '/personal-page-dismiss', ...projectActions].includes(action)) { send(res, 404); return }
  const method = ['/bind', '/decision', '/weekly-decision', '/recover', '/equipment-dismiss', '/equipment-submit', '/personal-page-dismiss', '/project-report-submit', '/project-report-advance'].includes(action) ? 'POST' : 'GET'
  if (req.method !== method) { send(res, 405); return }
  if (method === 'POST' && (req.headers['sec-fetch-site'] !== 'same-origin'
    || (req.headers.origin !== undefined && new URL(req.headers.origin).host !== req.headers.host))) { send(res, 403); return }
  const authorization = req.headers.authorization, tenant = req.headers['x-active-tenant']
  if (!authorization || !/^Bearer [^\s]+$/u.test(authorization) || typeof tenant !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(tenant)) { send(res, 401); return }
  const credential: Credential = { authorization, tenant }
  if (action === '/context') { send(res, 200, await records.identity(credential, signal)); return }
  if (action === '/recover') {
    const raw = await body(req)
    const input = (() => { try { return parseRecovery(raw) } catch { throw new ReportRequestError(400) } })()
    const report = await recoverReport(records, credential, input, signal)
    if (!hasReportReceipt(report, input.action, input.date, input.kind)) throw new ReportRequestError(502)
    send(res, 200, { report }); return
  }
  const id = url.searchParams.get('session_id')
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/u.test(id)) { send(res, 400); return }
  if (action === '/bind') {
    const session = ctx.sessions.list().find(item => item.id === id)
    if (!session) { send(res, 503); return }
    const identity = await records.identity(credential, signal).catch(async (error: unknown) => {
      if (equipment === undefined || api === undefined || !(error instanceof ReportRequestError) || error.status !== 404) throw error
      const employee = await loadEmployee(api.replace(/\/+$/u, ''), { authorization, 'X-Active-Tenant': tenant }, signal)
        .catch((failure: unknown) => { throw new ReportRequestError(failure instanceof YuanShuSessionExpired ? 401 : 502) })
      return { user: employee.userId, tenant: Number(employee.tenantId), canWrite: false }
    })
    try {
      await bindOwner(ctx, session, identity)
    } catch (error) {
      if (!(error instanceof SessionOwnershipError)) throw error
      ctx.logger.info('日报会话绑定拒绝：%s', error.message)
      send(res, 409, { code: 'new-session-required' }); return
    }
    await journal.follow(session, identity)
    forms.bind({ session, identity, credential, verifiedAt: Date.now() })
    send(res, 200, { bound: true, account: `${identity.tenant}:${identity.user}` }); return
  }
  const lease = forms.browser(id, credential)
  if (projectActions.includes(action)) {
    if (!projectReports) { send(res, 404); return }
    if (action === '/project-report-form') { send(res, 200, projectReports.pending(id)); return }
    const input = await body(req)
    if (action === '/project-report-submit') { send(res, 200, await projectReports.submit(lease, input, signal)); return }
    projectReports.advance(id, field(input, 'id'))
    send(res, 200); return
  }
  if (action === '/personal-page-draft') {
    const draft = personalPages?.pending(lease.session)
    send(res, 200, draft && { ...draft, account: `${lease.identity.tenant}:${lease.identity.user}` }); return
  }
  if (action === '/personal-page-dismiss') {
    personalPages?.dismiss(lease.session, field(await body(req), 'id'))
    send(res, 200); return
  }
  if (action === '/equipment-form') { send(res, 200, equipment?.pending(id)); return }
  if (action === '/equipment-dismiss') { equipment?.dismiss(id, field(await body(req), 'id')); send(res, 200); return }
  if (action === '/equipment-submit') {
    if (!equipment) { send(res, 404); return }
    send(res, 200, await equipment.submit(id, credential, await body(req), signal)); return
  }
  if (action === '/weekly-form') {
    const form = forms.pendingWeekly(id)
    send(res, 200, { form, surface: form === null ? null : weeklySurface(form.id, form.content) }); return
  }
  if (action === '/form') {
    const form = forms.pending(id)
    send(res, 200, { form, surface: form === null ? null : dailySurface(form.id, form.content) }); return
  }
  if (action === '/weekly-decision') {
    const report = await forms.decideWeekly(id, weeklyDecision(await body(req)), signal)
    send(res, 200, { report }); return
  }
  const report = await forms.decide(id, decision(await body(req)), signal)
  send(res, 200, { report })
}
