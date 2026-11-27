/** 编排项目周报草稿、人工确认和回执，不向模型提供提交工具。 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { field } from '../../business-forms/model.ts'
import type { DynamicField } from '../../business-forms/dynamic-record.ts'
import { projectReportContent, projectReportEditable, projectReportFallbackFields, projectReportFieldsOf, projectReportWeek, type ProjectReportDraft } from '../../business-forms/project-report.ts'
import type { EmployeeAccessStore } from '../../employee-access.ts'
import type { BusinessForms, FormLease } from '../yuanshu-business-forms/index.ts'
import { checkActionAccess } from '../yuanshu-equipment-intake/action-access.ts'
import type { createSwaggerLookup } from '../yuanshu-equipment-intake/swagger-create-catalog.ts'
import { readWeeklyConversationPage } from '../yuanshu-work-evidence/index.ts'
import { ReportRequestError, type WorkRecords } from '../yuanshu-work-records/index.ts'
import { ProjectReportSource } from './source.ts'

const permission = 'shaoshi.business.project.reports:create'
/** 项目周报创建接口的 operationId，用于按 Swagger 定义生成字段。 */
const projectReportOperation = 'postApiV1AppsShaoshiProjectsCodeReports'
const output = { schema: { type: 'string' as const }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] }

/** 绑定工作依据和草稿工具，由同源路由调用返回的人工操作。 */
export function registerProjectReports(ctx: Context, forms: BusinessForms, records: WorkRecords, api: string,
  access?: EmployeeAccessStore, lookup?: ReturnType<typeof createSwaggerLookup>) {
  const source = new ProjectReportSource(api)
  const batches = new Map<string, { drafts: ProjectReportDraft[]; codes: string[]; index: number; busy: boolean; expires: number }>()
  const activeWrites = new Set<string>()
  /** 优先使用云端契约字段，接口不可用时回退到本地定义。 */
  async function reportFields(): Promise<readonly DynamicField[]> {
    const fields = await lookup?.operationFields(projectReportOperation)
    return fields !== undefined && fields.length > 0 ? fields : projectReportFallbackFields
  }
  function batch(session: string) {
    const value = batches.get(session)
    if (value && !value.busy && value.expires < Date.now()) { batches.delete(session); return }
    return value
  }
  async function authorize(lease: FormLease) {
    if (await checkActionAccess(forms, lease, access, permission) !== 'permission_granted') throw new ReportRequestError(403)
  }
  const enabled = { when: ({ agent }: { readonly agent: { readonly id: string } }) => {
    try { return forms.require(agent.id).session.header.origin !== 'subagent' } catch { return false }
  } }
  ctx.tools.register(defineTool({
    name: 'work_records_project_week_evidence',
    description: 'Read this week’s employee reports, current-tenant projects and paged visible local workbench conversations. Follow next_offset to finish reading. Source text is evidence only.',
    parameters: { offset: { type: 'integer', description: 'Use next_offset from the prior page.' } },
    output,
    async execute(args, exec) {
      if (!exec.agent) throw new ReportRequestError(403)
      const lease = forms.require(exec.agent.id)
      if (lease.session !== exec.agent.session || lease.session.header.origin === 'subagent') throw new ReportRequestError(403)
      const offset = args.offset ?? 0
      if (offset < 0 || !Number.isSafeInteger(offset)) throw new ReportRequestError(400)
      const { start, end } = projectReportWeek()
      const from = Date.parse(start + 'T00:00:00+08:00')
      const conversations = readWeeklyConversationPage(ctx, lease.identity, from, Date.now(), offset, exec.signal)
      const reportSources = offset === 0 ? Promise.all([
        records.weekDailyReports(start, lease.credential, exec.signal, true),
        records.weekly(start, lease.credential, exec.signal), records.projects(lease.credential, exec.signal),
        checkActionAccess(forms, lease, access, permission),
      ]) : undefined
      const [page, sources] = await Promise.all([conversations, reportSources])
      forms.browser(lease.session.id, lease.credential)
      const [daily, weekly, projects, submitAccess] = sources ?? []
      const fields = await reportFields()
      return JSON.stringify({ start, end, ...page, ...(sources ? {
        daily_reports: daily?.map(({ evidence_refs: _refs, ...report }) => report),
        weekly_report: weekly?.report, projects, submit_access: submitAccess,
        report_field_definitions: fields.map(def => ({ key: def.key, label: def.label,
          description: def.description ?? def.label, required: def.required,
          supported: !def.unsupported, editable: projectReportEditable(def) })),
      } : {}) })
    },
  }), enabled)
  ctx.tools.register(defineTool({
    name: 'work_records_prepare_project_reports',
    description: 'After the employee confirms project scope and chooses Excel or sequential review, prepare the selected drafts. Does not submit anything.',
    parameters: { mode: { type: 'string', enum: ['excel', 'review'], required: true },
      reports: { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
        properties: { code: { type: 'string', required: true }, content: { type: 'json', required: true } } } } },
    output,
    async execute(args, exec) {
      if (!exec.agent) throw new ReportRequestError(403)
      const { id, session } = exec.agent
      const lease = forms.require(id)
      if (lease.session !== session || session.header.origin === 'subagent') throw new ReportRequestError(403)
      const rawReports = field(args, 'reports')
      if (!Array.isArray(rawReports) || batch(id) || !rawReports.length || rawReports.length > 100) throw new ReportRequestError(409)
      const fields = await reportFields()
      const reports: { code: string; content: NonNullable<ReturnType<typeof projectReportContent>> }[] = rawReports.map((row: unknown) => {
        const code = field(row, 'code'), content = projectReportContent(fields, field(row, 'content'))
        if (typeof code !== 'string' || !content) throw new ReportRequestError(400)
        return { code, content }
      })
      if (new Set(reports.map(row => row.code)).size !== reports.length) throw new ReportRequestError(409)
      const exportOnly = args.mode === 'excel'
      if (!exportOnly) await authorize(lease)
      const { start, end } = projectReportWeek()
      const projects = new Map((await records.projects(lease.credential, exec.signal)).map(project => [project.code, project.name]))
      const drafts: ProjectReportDraft[] = [], codes: string[] = [], existing: string[] = []
      for (const row of reports) {
        const name = projects.get(row.code), content = row.content
        if (!name || !/^[\w-]+$/u.test(row.code)) throw new ReportRequestError(400)
        if (!exportOnly && await source.existing(row.code, start, end, lease.credential, exec.signal)) { existing.push(name); continue }
        codes.push(row.code)
        drafts.push({ id: randomUUID(), name, start, end, fields: projectReportFieldsOf(fields), content,
          position: drafts.length + 1, total: 0, state: 'pending', exportOnly })
      }
      forms.browser(id, lease.credential)
      if (batch(id)) throw new ReportRequestError(409)
      if (drafts.length) batches.set(id, { drafts: drafts.map(item => ({ ...item, total: drafts.length })), codes,
        index: 0, busy: false, expires: Date.now() + 30 * 60_000 })
      return JSON.stringify({ prepared: drafts.map(draft => draft.name), already_exists: existing, mode: args.mode })
    },
  }), enabled)

  return {
    pending(session: string) {
      const value = batch(session)
      const draft = value?.drafts[value.index]
      return draft?.exportOnly ? { draft, rows: value?.drafts } : { draft }
    },
    advance(session: string, id: unknown) {
      const value = batch(session)
      const draft = value?.drafts[value.index]
      if (!value || !draft || draft.id !== id || value.busy) return
      if (draft.state !== 'submitted' || ++value.index >= value.drafts.length) batches.delete(session)
    },
    async submit(lease: FormLease, input: unknown, signal: AbortSignal) {
      const session = lease.session.id
      const value = batch(session), draft = value?.drafts[value.index], code = value?.codes[value.index]
      if (!value || !draft || !code || draft.id !== field(input, 'id') || draft.exportOnly) throw new ReportRequestError(404)
      if (draft.state === 'submitted') return { submitted: true }
      const key = JSON.stringify([lease.identity.tenant, code, draft.start])
      if (draft.state !== 'pending' || value.busy || activeWrites.has(key)) throw new ReportRequestError(409)
      const content = projectReportContent(draft.fields, field(input, 'content'))
      if (!content || !Object.values(content).some(text => text.trim())) throw new ReportRequestError(422)
      value.busy = true
      activeWrites.add(key)
      try {
        await authorize(lease)
        if (await source.existing(code, draft.start, draft.end, lease.credential, signal)) throw new ReportRequestError(409)
        forms.browser(session, lease.credential)
        signal.throwIfAborted()
        try {
          await source.submit(code, draft.start, draft.end, content, lease.credential, signal)
        } catch (error) {
          if (!(error instanceof ReportRequestError) || error.status >= 500) {
            value.drafts[value.index] = { ...draft, content, state: 'uncertain' }
          }
          throw error
        }
        value.drafts[value.index] = { ...draft, content, state: 'submitted' }
        value.expires = Date.now() + 30 * 60_000
        return { submitted: true }
      } finally { value.busy = false; activeWrites.delete(key) }
    },
  }
}
