/** 日报业务插件的数据适配；只访问配置的后台白名单路径，不依赖 UI、模型或数据库。 */
/* oxlint-disable @stylistic/max-len, @stylistic/arrow-parens */
import { weeklyPayload } from '../../business-forms/recovery.ts'
import { DAILY_FIELDS, field, parseContent, parseWeeklyContent, type DailyContent, type DailyIdentity, type DailyReport, type EvidenceRef, isWeeklyCompletionStatus, isWeeklyWorkType, type WeeklyContent, type WeeklyItem, type WeeklyProject } from '../../business-forms/model.ts'

/** 经浏览器绑定的凭证；仅保存在宿主内存，不返回模型或写入会话。 */
export interface Credential { readonly authorization: string; readonly tenant: string }
/** 把受控后台错误映射到业务状态，禁止向界面泄露响应正文。 */
export class ReportRequestError extends Error {
  constructor(readonly status: number) { super(`Daily report request failed (${status})`) }
}
/** 日报适配器，依赖可注入请求以便隔离测试。 */
export class WorkRecords {
  constructor(private readonly api: string, private readonly request: typeof fetch = fetch) {}
  private async call(path: string, credential: Credential, signal: AbortSignal, input?: object): Promise<unknown> {
    const response = await this.request(`${this.api.replace(/\/$/u, '')}/api/v1/apps/deepseek-harness/daily-reports/${path}`, {
      method: input === undefined ? 'GET' : 'PUT', redirect: 'error', signal,
      headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, 'content-type': 'application/json' },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    })
    if (!response.ok) throw new ReportRequestError(response.status)
    return field(await response.json(), 'data')
  }
  /** 用后台实际鉴权结果取得本人、租户和可编辑契约。 */
  async identity(credential: Credential, signal: AbortSignal): Promise<DailyIdentity> {
    const data = await this.call('schema', credential, signal)
    const user = field(data, 'user_id'), tenant = field(data, 'business_tenant_id')
    const fields = field(data, 'fields')
    if (field(data, 'schema_id') !== 'daily-report.v1' || !Number.isSafeInteger(user) || typeof user !== 'number' || user <= 0
      || !Number.isSafeInteger(tenant) || typeof tenant !== 'number' || tenant <= 0
      || !Array.isArray(fields) || fields.length !== DAILY_FIELDS.length || DAILY_FIELDS.some(key => !fields.includes(key))) {
      throw new ReportRequestError(502)
    }
    return { user, tenant, canWrite: field(data, 'can_write') === true }
  }
  /** 读取当前用户的日报；日期须来自受控流程。 */
  async get(date: string, credential: Credential, signal: AbortSignal): Promise<DailyReport | null> {
    return parseReport(field(await this.call(encodeURIComponent(date), credential, signal), 'report'))
  }
  /** 仅供人工确认回调调用，不注册为模型可执行工具。 */
  async save(date: string, credential: Credential, input: {
    readonly content: DailyContent
    readonly evidence: readonly EvidenceRef[]
    readonly version: number
    readonly request: string
    readonly status: 'draft' | 'submitted'
  }, signal: AbortSignal): Promise<DailyReport> {
    const data = await this.call(encodeURIComponent(date), credential, signal, { ...input.content,
      evidence_refs: input.evidence, expected_version: input.version, request_id: input.request, status: input.status })
    const report = parseReport(field(data, 'report'))
    if (report === null) throw new ReportRequestError(502)
    return report
  }

  /** 读取本人周报草稿及审计字段；周报事项由工作台正文白名单承载。 */
  async weekly(start: string, credential: Credential, signal: AbortSignal): Promise<{ readonly report?: WeeklyContent; readonly status?: string; readonly version: number; readonly revision?: string; readonly receipt?: unknown }> {
    const response = await this.request(`${this.api.replace(/\/$/u, '')}/api/v1/apps/deepseek-harness/weekly-reports?period_start=${encodeURIComponent(start)}`, {
      method: 'GET', redirect: 'error', signal,
      headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, 'content-type': 'application/json' },
    })
    if (!response.ok) throw new ReportRequestError(response.status)
    const data = field(await response.json(), 'data'), raw = field(data, 'report')
    if (raw === null || raw === undefined) return { version: 0 }
    const completed = field(raw, 'completed_work')
    const decoded = typeof completed === 'string' ? parseWeeklyRows(completed) : { items: [] }
    const content = parseWeeklyContent({ period_start: field(raw, 'period_start'), progress_summary: field(raw, 'progress_summary'),
      completed_work: '',
      planned_work: field(raw, 'planned_work'), issues_and_risks: field(raw, 'issues_and_risks') ?? '',
      need_support: field(raw, 'need_support') ?? '', items: decoded.items })
    const version = field(raw, 'version')
    const status = field(raw, 'status')
    const revision = field(raw, 'updated_at')
    return { report: content, receipt: raw, ...(typeof revision === 'string' ? { revision } : {}), ...(typeof status === 'string' ? { status } : {}),
      version: typeof version === 'number' && Number.isSafeInteger(version) ? version : 0 }
  }

  /** 保存或提交周报，按后台契约先保存草稿，再由提交端点确认。 */
  async saveWeekly(start: string, credential: Credential, input: {
    readonly content: WeeklyContent
    readonly recoveryRevision?: string | null
    readonly previousContent?: WeeklyContent
    readonly status: 'draft' | 'submitted'
  }, signal: AbortSignal): Promise<unknown> {
    const body = weeklyPayload(start, input.content)
    const path = `${this.api.replace(/\/$/u, '')}/api/v1/apps/deepseek-harness/weekly-reports`
    const write = async (url: string, method: 'PUT' | 'POST', value: object): Promise<unknown> => {
      const response = await this.request(url, { method, redirect: 'error', signal,
        headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, 'content-type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (!response.ok) throw new ReportRequestError(response.status)
      const report = field(field(await response.json(), 'data'), 'report')
      const status = method === 'PUT' ? 'draft' : 'submitted'
      if (field(report, 'status') !== status || field(report, 'period_start') !== start
        || typeof field(report, 'id') !== 'number') throw new ReportRequestError(502)
      return report
    }
    const matches = (receipt: unknown, expected = body): boolean => Object.entries(expected).every(([key, value]) =>
      field(receipt, key) === value)
    const recoverSubmitted = async (error: unknown): Promise<unknown> => {
      if (input.status !== 'submitted' || !(error instanceof ReportRequestError) || error.status !== 409) throw error
      const saved = await this.weekly(start, credential, signal)
      if (saved.status !== 'submitted' || !matches(saved.receipt)) throw error
      return saved.receipt
    }
    if (input.recoveryRevision !== undefined) {
      const saved = await this.weekly(start, credential, signal)
      if (matches(saved.receipt)) {
        if (saved.status === input.status) return saved.receipt
        if (saved.status === 'draft' && input.status === 'submitted') return write(`${path}/submit`, 'POST', { period_start: start })
      }
      const isPreviousAttempt = saved.status === 'draft' && input.previousContent !== undefined
        && matches(saved.receipt, weeklyPayload(start, input.previousContent))
      const revisionMatches = (saved.revision ?? null) === input.recoveryRevision
        && (saved.report === undefined || saved.revision !== undefined)
      if (saved.status === 'submitted' || (!revisionMatches && !isPreviousAttempt)) throw new ReportRequestError(409)
    }
    let draft: unknown
    try {
      draft = await write(path, 'PUT', body)
    } catch (error) {
      return recoverSubmitted(error)
    }
    if (input.status === 'draft') return draft
    try {
      return await write(`${path}/submit`, 'POST', { period_start: start })
    } catch (error) {
      return recoverSubmitted(error)
    }
  }

  /** 读取本周已提交日报，供周报自动归纳使用。 */
  async weekDailyReports(start: string, credential: Credential, signal: AbortSignal, includeDrafts = false): Promise<readonly DailyReport[]> {
    const result: DailyReport[] = []
    const day = new Date(`${start}T00:00:00Z`)
    for (let index = 0; index < 7; index++) {
      const date = new Date(day)
      date.setUTCDate(day.getUTCDate() + index)
      const report = await this.get(date.toISOString().slice(0, 10), credential, signal)
      if (report && (includeDrafts || report.status === 'submitted')) result.push(report)
    }
    return result
  }

  /** 读取当前租户项目主数据，供周报匹配和表单下拉框使用。 */
  async projects(credential: Credential, signal: AbortSignal): Promise<readonly WeeklyProject[]> {
    const response = await this.request(`${this.api.replace(/\/$/u, '')}/api/v1/apps/shaoshi/projects?page=1&page_size=200`, {
      method: 'GET', redirect: 'error', signal,
      headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, accept: 'application/json' },
    })
    if (!response.ok) throw new ReportRequestError(response.status)
    const data = field(await response.json(), 'data'), rows = field(data, 'items')
    if (!Array.isArray(rows)) throw new ReportRequestError(502)
    return rows.flatMap(item => {
      const id = field(item, 'id'), code = field(item, 'code'), name = field(item, 'name')
      return typeof id === 'number' && Number.isSafeInteger(id) && typeof code === 'string' && typeof name === 'string' ? [{ id, code, name }] : []
    })
  }
}

/** 将兼容存入周报完成字段的事项 JSON 还原为编辑模型。 */
function parseWeeklyRows(value: string): { readonly items: readonly WeeklyItem[] } {
  if (!value.trimStart().startsWith('[')) {
    if (value.trim() === '') return { items: [] }
    return { items: [{ id: 'saved-item-1', project_code: '', project_name: '', work_type: '',
      description: value, completion_status: '', has_risk: false, risk_details: '' }] }
  }
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) throw new ReportRequestError(502)
    const values: readonly unknown[] = parsed
    const keys = ['project_code', 'work_type', 'description', 'completion_status', 'has_risk', 'risk_details']
    const items = values.map((row, index): WeeklyItem => {
      const id = `saved-item-${index + 1}`
      const legacy = readLegacyWeeklyItem(row, id)
      if (legacy !== undefined) return legacy
      if (typeof row !== 'object' || row === null || Array.isArray(row)
        || Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw new ReportRequestError(502)
      const projectCode = field(row, 'project_code'), workType = field(row, 'work_type')
      const description = field(row, 'description'), completion = field(row, 'completion_status')
      const risk = field(row, 'has_risk'), details = field(row, 'risk_details')
      if (typeof projectCode !== 'string' || typeof workType !== 'string' || typeof description !== 'string'
        || typeof completion !== 'string' || typeof risk !== 'boolean' || (details !== null && typeof details !== 'string')) throw new ReportRequestError(502)
      if (!isWeeklyWorkType(workType) || !isWeeklyCompletionStatus(completion)) throw new ReportRequestError(502)
      return { id, project_code: projectCode, project_name: '', work_type: workType,
        description, completion_status: completion, has_risk: risk, risk_details: typeof details === 'string' ? details : '' }
    })
    return { items }
  } catch {
    throw new ReportRequestError(502)
  }
}

/** 读取原登记页保存的事项，把缺失的选项留给本人确认。 */
function readLegacyWeeklyItem(row: unknown, id: string): WeeklyItem | undefined {
  if (typeof field(row, 'project_name') !== 'string' || typeof field(row, 'task_name') !== 'string') return undefined
  const project = field(row, 'project_code'), description = field(row, 'description')
  const type = field(row, 'work_type'), status = field(row, 'completion_status'), risk = field(row, 'risk_details')
  if (typeof project !== 'string' || typeof description !== 'string' || typeof status !== 'string') return undefined
  const details = typeof risk === 'string' ? risk : ''
  return { id, project_code: project, project_name: '',
    work_type: typeof type === 'string' && isWeeklyWorkType(type) ? type : '',
    description, completion_status: isWeeklyCompletionStatus(status) ? status : '',
    has_risk: field(row, 'has_risk') === true || details.trim() !== '', risk_details: details }
}

/** 校验后台成功响应；缺少版本和审计数据时不报告成功。 */
export function parseReport(value: unknown): DailyReport | null {
  if (value === null) return null
  const getString = (key: string): string => {
    const result = field(value, key)
    if (typeof result !== 'string') throw new ReportRequestError(502)
    return result
  }
  const status = field(value, 'status'), version = field(value, 'version'), id = field(value, 'id')
  if ((status !== 'draft' && status !== 'submitted') || typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0
    || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) throw new ReportRequestError(502)
  const content = parseContent(Object.fromEntries(DAILY_FIELDS.map(key => [key, field(value, key)])))
  const refs = field(value, 'evidence_refs')
  if (!Array.isArray(refs)) throw new ReportRequestError(502)
  const evidence = refs.map((item) => {
    const session = field(item, 'session_id'), seq = field(item, 'seq')
    if (typeof session !== 'string' || typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) throw new ReportRequestError(502)
    return { session_id: session, seq }
  })
  const submitted = field(value, 'submitted_at')
  if (submitted !== null && typeof submitted !== 'string') throw new ReportRequestError(502)
  return { ...content, id, version, status, evidence_refs: evidence, work_date: getString('work_date'),
    created_at: getString('created_at'), updated_at: getString('updated_at'), submitted_at: submitted }
}
