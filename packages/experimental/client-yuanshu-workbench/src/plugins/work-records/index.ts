/** 日报业务插件的数据适配；只访问配置的后台白名单路径，不依赖 UI、模型或数据库。 */
import { DAILY_FIELDS, field, parseContent, type DailyContent, type DailyIdentity, type DailyReport, type EvidenceRef } from '../../business-forms/model.ts'

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
