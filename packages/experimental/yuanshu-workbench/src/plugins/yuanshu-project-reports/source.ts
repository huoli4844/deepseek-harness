/** 少仕项目报告接口适配，不依赖模型或界面。 */
import { field } from '../../business-forms/model.ts'
import type { ProjectReportContent } from '../../business-forms/project-report.ts'
import { DynamicValidationError } from '../yuanshu-equipment-intake/dynamic-registry.ts'
import { ReportRequestError, type Credential } from '../yuanshu-work-records/index.ts'

const rejected = new Set([400, 401, 403, 404, 409, 422, 429])

/** 只使用已公布的项目报告地址，成功须有同周期已提交记录。 */
export class ProjectReportSource {
  constructor(private readonly api: string, private readonly request: typeof fetch = fetch) {}

  private async call(code: string, credential: Credential, signal: AbortSignal, query = '', body?: object) {
    const response = await this.request(new URL('/api/v1/apps/shaoshi/projects/' + encodeURIComponent(code) + '/reports' + query, this.api), {
      method: body ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const json: unknown = await response.json().catch(() => null)
    const business = field(json, 'code')
    if (!response.ok || field(json, 'success') === false || (business !== undefined && ![0, 200, 201, '0', '200', '201'].includes(business as number | string))) {
      const code = typeof business === 'number' || typeof business === 'string' ? Number(business) : 502
      const status = !response.ok ? response.status : rejected.has(code) ? code : 502
      const message = field(json, 'message')
      if (rejected.has(status) && typeof message === 'string' && message.trim() && message.length <= 500
        && !/[<>\p{Cc}]|https?:\/\/|\bbearer\b|\bSQLSTATE\b/iu.test(message)) throw new DynamicValidationError(status, message)
      throw new ReportRequestError(status)
    }
    const data = field(json, 'data')
    if (typeof data !== 'object' || data === null) throw new ReportRequestError(502)
    return data
  }

  /** 查询该项目全部分页，防止重复创建当周报告。 */
  async existing(code: string, start: string, end: string, credential: Credential, signal: AbortSignal) {
    for (let page = 1; page <= 100; page++) {
      const data = await this.call(code, credential, signal, '?page_size=100&page=' + String(page))
      const items = field(data, 'items')
      const total = field(data, 'total')
      if (!Array.isArray(items) || typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw new ReportRequestError(502)
      for (const row of items) {
        const kind = field(row, 'report_type')
        const period = field(row, 'period_start')
        if (typeof kind !== 'string' || (period !== null && typeof period !== 'string')) throw new ReportRequestError(502)
        if (kind === 'weekly' && typeof period === 'string' && period.slice(0, 10) >= start && period.slice(0, 10) <= end) return true
      }
      if (page * 100 >= total) return false
      if (items.length !== 100) throw new ReportRequestError(502)
    }
    throw new ReportRequestError(502)
  }

  /** 仅由人工确认触发创建，并以实际记录状态和标识核验提交结果。 */
  async submit(code: string, start: string, end: string, content: ProjectReportContent, credential: Credential, signal: AbortSignal) {
    const data = await this.call(code, credential, signal, '', {
      ...content, report_type: 'weekly', status: 'submitted', period_start: start, period_end: end,
    })
    const row = field(data, 'report') ?? data
    const id = field(row, 'id')
    const status = field(row, 'report_status') ?? field(row, 'status')
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || status !== 'submitted'
      || field(row, 'report_type') !== 'weekly' || String(field(row, 'period_start')).slice(0, 10) !== start
      || String(field(row, 'period_end')).slice(0, 10) !== end) throw new ReportRequestError(502)
    return id
  }
}
