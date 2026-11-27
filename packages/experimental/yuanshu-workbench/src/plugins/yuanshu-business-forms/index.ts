/** 人工表单运行时：保存会话账号租约、待确认表单与回执；不向模型暴露凭证或写入工具。 */
/* oxlint-disable @stylistic/max-len */
import { randomUUID } from 'node:crypto'
import type { Session } from '@deepseek-ai/dsh-session'
import { beijingDay, parseWeeklyContent, type DailyContent, type DailyDecision, type DailyForm, type DailyIdentity, type DailyReport, type EvidenceRef, type WeeklyContent, type WeeklyDecision, type WeeklyForm, type WorkEvidence } from '../../business-forms/model.ts'
import { sameOwner } from '../yuanshu-work-evidence/index.ts'
import { EDIT_TEMPLATE } from '../../business-forms/templates/index.ts'
import { ReportRequestError, type Credential, type WorkRecords } from '../yuanshu-work-records/index.ts'

/** 活跃界面与经过后台校验的账号绑定；到期后必须重新鉴权。 */
export interface FormLease {
  readonly session: Session
  readonly identity: DailyIdentity
  readonly credential: Credential
  readonly verifiedAt: number
  readonly evidence?: readonly WorkEvidence[]
}
interface FormState {
  readonly form: DailyForm
  readonly session: string
  readonly owner: DailyIdentity
  readonly status: 'pending' | 'saved' | 'submitted' | 'cancelled'
  readonly report?: DailyReport
  readonly decision?: string
}
interface WeeklyFormState {
  readonly form: WeeklyForm
  readonly session: string
  readonly owner: DailyIdentity
  readonly status: 'pending' | 'saved' | 'submitted' | 'cancelled'
  readonly report?: unknown
  readonly decision?: string
}

/** 已提交日报提供最小回执，供对话明确告知员工。 */
export class DailyReportAlreadySubmitted extends ReportRequestError {
  constructor(readonly date: string, readonly submittedAt: string | null) {
    super(409)
  }
}

/** 每次插件激活独享实例；重启后草稿弹窗失效，已保存日报仍在后台。 */
export class BusinessForms {
  private readonly leases = new Map<string, FormLease>()
  private readonly forms = new Map<string, FormState>()
  private readonly weeklyForms = new Map<string, WeeklyFormState>()
  private readonly writes = new Map<string, Promise<DailyReport | null>>()
  private closing = false
  constructor(private readonly records: WorkRecords) {}
  /** 插件卸载清除凭证和临时草稿。 */
  dispose(): void { this.closing = true; this.leases.clear(); this.forms.clear(); this.weeklyForms.clear() }
  /** 注册已经校验归属的会话，客户端续租不能更换企业账号。 */
  bind(lease: FormLease): void {
    if (this.closing) throw new ReportRequestError(503)
    const old = this.leases.get(lease.session.id)
    if (old !== undefined && !sameOwner(old.identity, lease.identity)) throw new ReportRequestError(403)
    this.leases.set(lease.session.id, { ...lease, ...(old?.evidence === undefined ? {} : { evidence: old.evidence }) })
    this.prune()
  }
  /** 模型执行和界面读取均要求当前账号租约仍然有效。 */
  require(session: string): FormLease {
    if (this.closing) throw new ReportRequestError(503)
    const lease = this.leases.get(session)
    if (lease === undefined || Date.now() - lease.verifiedAt > 120_000) throw new ReportRequestError(401)
    return lease
  }
  /** 校验浏览器凭证与绑定一致；真正写入时后台仍重新鉴权。 */
  browser(session: string, credential: Credential): FormLease {
    const lease = this.require(session)
    if (lease.credential.authorization !== credential.authorization || lease.credential.tenant !== credential.tenant) {
      throw new ReportRequestError(403)
    }
    return lease
  }
  /** 仅枚举该账号已绑定且活跃的会话，不扫描其他本地用户的历史。 */
  sessions(lease: FormLease): readonly Session[] {
    return [...this.leases.values()].filter(item => sameOwner(item.identity, lease.identity)
      && Date.now() - item.verifiedAt <= 120_000).map(item => item.session)
  }
  /** 缓存实际返回的依据，用于核验模型引用，不能由模型添加新出处。 */
  evidence(session: string, evidence: readonly WorkEvidence[]): void {
    this.leases.set(session, { ...this.require(session), evidence })
  }
  /** 创建受控弹窗，保持同一会话已有未确认草稿。 */
  async open(session: string, content: DailyContent, refs: readonly EvidenceRef[], signal: AbortSignal): Promise<DailyForm> {
    const lease = this.require(session)
    if (!lease.identity.canWrite) throw new ReportRequestError(403)
    const date = beijingDay()
    if (lease.evidence === undefined) throw new ReportRequestError(409)
    const known = lease.evidence.filter(item => Date.parse(item.time) >= Date.now() - 86_400_000)
    if (refs.length > 100 || refs.some(ref => !known.some(item => item.session_id === ref.session_id && item.seq === ref.seq))) {
      throw new ReportRequestError(400)
    }
    const saved = await this.records.get(date, lease.credential, signal)
    // 等待后台期间租约可能失效，返回回执或查找草稿前再次验证。
    this.browser(session, lease.credential)
    if (saved?.status === 'submitted') throw new DailyReportAlreadySubmitted(saved.work_date, saved.submitted_at)
    const concurrent = this.pending(session)
    if (concurrent?.work_date === date) return concurrent
    if (concurrent !== null) throw new ReportRequestError(409)
    const body: DailyContent = saved ?? content
    const evidence = saved?.evidence_refs ?? refs
    const form: DailyForm = { id: randomUUID(), schema_id: 'daily-report.v1', work_date: date,
      template_id: EDIT_TEMPLATE.id, template_version: EDIT_TEMPLATE.version,
      expected_version: saved?.version ?? 0, content: {
        completed_work: body.completed_work, in_progress_work: body.in_progress_work, planned_work: body.planned_work,
        issues_and_risks: body.issues_and_risks, need_support: body.need_support,
      }, evidence_refs: evidence.map(ref => ({ session_id: ref.session_id, seq: ref.seq })),
      coverage: 'verified-active-workbench-sessions', expires_at: Date.now() + 30 * 60_000 }
    this.forms.set(form.id, { form, session, owner: lease.identity, status: 'pending' })
    return form
  }

  /** 创建本周周报待确认表单，保留后台已有草稿正文并校验本地依据出处。 */
  async openWeekly(session: string, start: string, content: WeeklyContent, refs: readonly EvidenceRef[], signal: AbortSignal): Promise<WeeklyForm> {
    const lease = this.require(session)
    if (!lease.identity.canWrite) throw new ReportRequestError(403)
    if (this.pendingWeekly(session) !== null || lease.evidence === undefined) throw new ReportRequestError(409)
    const parsed = parseWeeklyContent(content)
    if (parsed.period_start !== start || refs.length > 200 || refs.some(ref => !lease.evidence?.some(item => item.session_id === ref.session_id && item.seq === ref.seq))) throw new ReportRequestError(400)
    const [saved, projects] = await Promise.all([this.records.weekly(start, lease.credential, signal), this.records.projects(lease.credential, signal)])
    if (saved.status === 'submitted') throw new ReportRequestError(409)
    const report = saved.report
    const projectNames = new Map(projects.map(project => [project.code, project.name]))
    const body = report === undefined ? parsed : { ...report, period_start: start,
      items: report.items.map(item => ({ ...item, project_name: projectNames.get(item.project_code) ?? '' })) }
    const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6)
    const form: WeeklyForm = { id: randomUUID(), schema_id: 'weekly-report.v1', template_id: 'weekly-edit', template_version: 1,
      period_start: start, period_end: end.toISOString().slice(0, 10), expected_version: saved.version,
      ...(saved.revision === undefined ? {} : { base_revision: saved.revision }),
      content: body, projects, evidence_refs: refs.map(ref => ({ session_id: ref.session_id, seq: ref.seq })),
      coverage: 'verified-weekly-daily-reports-and-local-workbench-journal', expires_at: Date.now() + 30 * 60_000 }
    this.weeklyForms.set(form.id, { form, session, owner: lease.identity, status: 'pending' })
    return form
  }
  pendingWeekly(session: string): WeeklyForm | null {
    this.prune()
    return [...this.weeklyForms.values()].find(item => item.session === session && item.status === 'pending')?.form ?? null
  }
  async decideWeekly(session: string, decision: WeeklyDecision, signal: AbortSignal): Promise<unknown> {
    const lease = this.require(session), state = this.weeklyForms.get(decision.form_id)
    if (!state || state.session !== session || !sameOwner(state.owner, lease.identity) || state.form.expires_at < Date.now()) throw new ReportRequestError(404)
    if (decision.action !== 'cancel' && !lease.identity.canWrite) throw new ReportRequestError(403)
    const fingerprint = JSON.stringify(decision)
    if (state.decision !== undefined && state.decision !== fingerprint) throw new ReportRequestError(409)
    if (state.status !== 'pending') return state.report ?? null
    this.weeklyForms.set(state.form.id, { ...state, decision: fingerprint })
    if (decision.action === 'cancel') { this.weeklyForms.set(state.form.id, { ...state, decision: fingerprint, status: 'cancelled' }); return null }
    try {
      const report = await this.records.saveWeekly(state.form.period_start, lease.credential, { content: decision.content,
        status: decision.action === 'submit' ? 'submitted' : 'draft' }, signal)
      this.weeklyForms.set(state.form.id, { ...state, decision: fingerprint, status: decision.action === 'submit' ? 'submitted' : 'saved', report })
      return report
    } catch (error) {
      if (error instanceof ReportRequestError && error.status < 500) this.weeklyForms.set(state.form.id, state)
      throw error
    }
  }
  /** 返回本会话尚未处理且未过期的表单。 */
  pending(session: string): DailyForm | null {
    this.prune()
    return [...this.forms.values()].find(item => item.session === session && item.status === 'pending')?.form ?? null
  }
  /** 读取当前账号北京时间当天的已保存日报。 */
  async existingDaily(session: string, signal: AbortSignal): Promise<DailyReport | null> {
    const lease = this.require(session)
    const date = beijingDay()
    const report = await this.records.get(date, lease.credential, signal)
    this.browser(session, lease.credential)
    if (report && report.work_date !== date) throw new ReportRequestError(502)
    return report
  }

  /** 读取当前账号本周已有周报，供创建前检查使用。 */
  async existingWeekly(session: string, start: string, signal: AbortSignal) {
    const lease = this.require(session)
    const monday = new Date(start + 'T00:00:00Z')
    if (monday.getUTCDay() !== 1 || monday.toISOString().slice(0, 10) !== start) throw new ReportRequestError(400)
    const saved = await this.records.weekly(start, lease.credential, signal)
    this.browser(session, lease.credential)
    if (saved.report && saved.report.period_start !== start) throw new ReportRequestError(502)
    return saved
  }

  /** 模型只读真实回执，不能伪造保存结果。 */
  status(session: string, id: string): object {
    const lease = this.require(session), state = this.forms.get(id)
    if (!state || state.session !== session || !sameOwner(state.owner, lease.identity)) throw new ReportRequestError(404)
    return { status: state.status, work_date: state.form.work_date, report: state.report ?? null }
  }
  /** 读取本周已提交日报，供周报技能生成依据。 */
  async weekDailyReports(lease: FormLease, start: string, signal: AbortSignal): Promise<readonly DailyReport[]> {
    this.require(lease.session.id)
    return this.records.weekDailyReports(start, lease.credential, signal)
  }
  async projects(lease: FormLease, signal: AbortSignal) { this.require(lease.session.id); return this.records.projects(lease.credential, signal) }
  /** 读取周报人工决定和后台回执。 */
  weeklyStatus(session: string, id: string): object {
    const lease = this.require(session), state = this.weeklyForms.get(id)
    if (!state || state.session !== session || !sameOwner(state.owner, lease.identity)) throw new ReportRequestError(404)
    return { status: state.status, period_start: state.form.period_start, report: state.report ?? null }
  }
  /** 人工事件入口；相同内容的并发重试合并，不同内容拒绝抢占。 */
  async decide(session: string, decision: DailyDecision, signal: AbortSignal): Promise<DailyReport | null> {
    const lease = this.require(session), state = this.forms.get(decision.form_id)
    if (!state || state.session !== session || !sameOwner(state.owner, lease.identity) || state.form.expires_at < Date.now()) {
      throw new ReportRequestError(404)
    }
    if (decision.action !== 'cancel' && !lease.identity.canWrite) throw new ReportRequestError(403)
    const fingerprint = JSON.stringify(decision)
    if (state.decision !== undefined && state.decision !== fingerprint) throw new ReportRequestError(409)
    if (state.status !== 'pending') return state.report ?? null
    const active = this.writes.get(state.form.id)
    if (active) return active
    const operation = this.persist(lease, state, decision, fingerprint, signal)
    this.writes.set(state.form.id, operation)
    try { return await operation } finally { this.writes.delete(state.form.id) }
  }
  private async persist(lease: FormLease, state: FormState, decision: DailyDecision,
    fingerprint: string, signal: AbortSignal): Promise<DailyReport | null> {
    this.forms.set(state.form.id, { ...state, decision: fingerprint })
    if (decision.action === 'cancel') {
      this.forms.set(state.form.id, { ...state, decision: fingerprint, status: 'cancelled' })
      return null
    }
    try {
      const report = await this.records.save(state.form.work_date, lease.credential, { content: decision.content,
        evidence: state.form.evidence_refs, version: state.form.expected_version, request: decision.request_id,
        status: decision.action === 'submit' ? 'submitted' : 'draft' }, signal)
      if (!this.closing) this.forms.set(state.form.id, { ...state, decision: fingerprint, status: report.status === 'submitted' ? 'submitted' : 'saved', report })
      return report
    } catch (error) {
      // 服务端可能已提交而响应丢失，只能重试相同幂等请求，不能改正文后覆盖。
      if (!this.closing && error instanceof ReportRequestError && error.status < 500) this.forms.set(state.form.id, state)
      throw error
    }
  }
  private prune(): void {
    const now = Date.now()
    for (const [id, state] of this.forms) if (state.form.expires_at < now && !this.writes.has(id)) this.forms.delete(id)
    for (const [id, lease] of this.leases) if (now - lease.verifiedAt > 120_000) this.leases.delete(id)
    for (const [id, state] of this.weeklyForms) if (state.form.expires_at < now) this.weeklyForms.delete(id)
  }
}
