/** 访问工作台同源的项目、工时和周报接口，不依赖 React。 */
import type {
  LaborDraft, LaborRecord, RegistrationPage, RegistrationProject, RegistrationRange,
  RegistrationTask, WeeklyDraft, WeeklyReport, WeeklySnapshot,
} from './project-registration-model.ts'

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined
}

function string(value: unknown, key: string): string {
  const result = field(value, key)
  return typeof result === 'string' ? result : ''
}

function integer(value: unknown, key: string): number | undefined {
  const number = field(value, key)
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : undefined
}

function id(value: unknown, key: string): number {
  const result = integer(value, key)
  if (!result) throw new Error('Invalid response identifier')
  return result
}

function hours(value: unknown, key: string): string {
  const result = field(value, key)
  if (typeof result === 'string' && /^-?\d+(?:\.\d+)?$/u.test(result)) return result
  if (typeof result === 'number' && Number.isFinite(result)) return String(result)
  throw new Error('Invalid response labor hours')
}

function list(value: unknown, key: string): readonly unknown[] {
  const result = field(value, key)
  if (Array.isArray(result)) return result
  throw new Error('Invalid response list')
}

function page<T>(value: unknown, parse: (item: unknown) => T): RegistrationPage<T> {
  const total = integer(value, 'total')
  if (total === undefined) throw new Error('Invalid response total')
  const archiveTotal = integer(value, 'archive_total')
  return {
    items: list(value, 'items').map(parse), total, page: id(value, 'page'), pageSize: id(value, 'page_size'),
    ...(archiveTotal === undefined ? {} : { archiveTotal }),
  }
}

function project(value: unknown): RegistrationProject {
  const code = string(value, 'code')
  const name = string(value, 'name')
  if (!code || !name) throw new Error('Invalid response project')
  return { id: id(value, 'id'), code, name }
}

function labor(value: unknown): LaborRecord {
  const completion = string(value, 'completion_status')
  const task = integer(value, 'task_id')
  const approver = integer(value, 'approved_by')
  const dateKeys = ['work_date', 'submitted_at', 'approved_at', 'created_at', 'updated_at'] as const
  const dates: Partial<Record<typeof dateKeys[number], string>> = {}
  for (const key of dateKeys) {
    const date = string(value, key)
    if (date) dates[key] = date
  }
  return {
    id: id(value, 'id'), user_id: id(value, 'user_id'), project_id: id(value, 'project_id'),
    hours: hours(value, 'hours'), work_type: string(value, 'work_type'), description: string(value, 'description'),
    status: string(value, 'status'), can_edit: field(value, 'can_edit') === true, can_submit: field(value, 'can_submit') === true,
    ...(completion ? { completion_status: completion } : {}),
    ...(task ? { task_id: task } : {}), ...(approver ? { approved_by: approver } : {}), ...dates,
  }
}

function report(value: unknown): WeeklyReport {
  const status = string(value, 'status')
  if (status !== 'draft' && status !== 'submitted') throw new Error('Invalid response report status')
  const submitter = integer(value, 'submitted_by')
  const dateKeys = ['submitted_at', 'created_at', 'updated_at'] as const
  const dates: Partial<Record<typeof dateKeys[number], string>> = {}
  for (const key of dateKeys) {
    const date = string(value, key)
    if (date) dates[key] = date
  }
  return {
    id: id(value, 'id'), project_id: id(value, 'project_id'), status, created_by: id(value, 'created_by'),
    period_start: string(value, 'period_start'), period_end: string(value, 'period_end'),
    progress_summary: string(value, 'progress_summary'), completed_work: string(value, 'completed_work'),
    planned_work: string(value, 'planned_work'), issues_and_risks: string(value, 'issues_and_risks'),
    need_support: string(value, 'need_support'), ...(submitter ? { submitted_by: submitter } : {}), ...dates,
  }
}

function weekly(value: unknown): WeeklySnapshot {
  const record = field(value, 'report')
  const summary = field(value, 'labor')
  return {
    ...(record === null ? {} : { report: report(record) }),
    totalHours: hours(summary, 'total_hours'),
    employees: list(summary, 'employees').map(item => ({ user_id: id(item, 'user_id'), hours: hours(item, 'hours') })),
  }
}

async function request(path: string, signal: AbortSignal, method = 'GET', body?: object): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401 })
  const headers = new Headers({
    authorization: `Bearer ${token}`, 'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  if (body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/projects${path}`, {
    method, headers, signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw Object.assign(new Error('YuanShu project request failed'), { status: response.status })
  return field(await response.json(), 'data')
}

/** 查询租户内可选择的项目。 */
export async function listRegistrationProjects(keyword: string, pageNumber: number, signal: AbortSignal) {
  const query = new URLSearchParams({ keyword, page: String(pageNumber), page_size: '20' })
  return page(await request(`?${query}`, signal), project)
}

/** 查询选定项目可登记的工作事项。 */
export async function listProjectTasks(
  projectCode: string, keyword: string, pageNumber: number, signal: AbortSignal,
): Promise<RegistrationPage<RegistrationTask>> {
  const query = new URLSearchParams({ keyword, page: String(pageNumber), page_size: '20' })
  return page(await request(`/${encodeURIComponent(projectCode)}/tasks?${query}`, signal), value => ({
    ...project(value), status: string(value, 'status'),
  }))
}

/** 按日期和当前排序获取项目工时页。 */
export async function listLabor(range: RegistrationRange, pageNumber: number, sort: {
  readonly key: string
  readonly direction: 'asc' | 'desc'
} | undefined, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(pageNumber), page_size: '20' })
  if (range.dateFrom) query.set('date_from', range.dateFrom)
  if (range.dateTo) query.set('date_to', range.dateTo)
  if (range.status) query.set('status', range.status)
  if (sort) {
    query.set('sort_by', sort.key)
    query.set('sort_dir', sort.direction)
  }
  return page(await request(`/${encodeURIComponent(range.projectCode)}/labor-hours?${query}`, signal), labor)
}

/** 某月本人工时记录与项目目录；供月历着色、月度汇总和当日明细共用一次加载。 */
export interface LaborMonthData {
  readonly projects: readonly RegistrationProject[]
  readonly records: readonly LaborRecord[]
}

/** 一条待整批写入的工时事项；recordId 存在表示改写已有草稿。 */
export interface LaborBatchEntry {
  readonly projectCode: string
  readonly recordId?: number
  readonly draft: LaborDraft
}

/**
 * 读取本人在某月的全部工时记录和可选项目。
 *
 * 后台只有按项目的工时列表，因此先取全部项目，再按项目各查一次整月数据；
 * 单页上限 200 条，逐页取完即可，不会为每个日历格单独请求。
 * 任一项目失败时返回 undefined，调用方据此放弃“缺填”标红和月度汇总，避免显示假数据。
 */
export async function listLaborMonth(
  range: { readonly dateFrom: string; readonly dateTo: string; readonly userId?: number | undefined },
  signal: AbortSignal,
): Promise<LaborMonthData | undefined> {
  const projects: RegistrationProject[] = []
  for (let pageNumber = 1; pageNumber <= 5; pageNumber++) {
    const query = new URLSearchParams({ keyword: '', page: String(pageNumber), page_size: '100' })
    const value = page(await request(`?${query}`, signal), project)
    projects.push(...value.items)
    if (value.items.length < value.pageSize || projects.length >= value.total) break
  }
  const results = await Promise.allSettled(projects.map(item => laborMonthRecords(item.code, range, signal)))
  if (results.some(result => result.status === 'rejected')) return undefined
  const records: LaborRecord[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') records.push(...result.value)
  }
  return { projects, records }
}

/** 逐页读取某项目整月工时记录。 */
async function laborMonthRecords(
  code: string, range: { readonly dateFrom: string; readonly dateTo: string; readonly userId?: number | undefined },
  signal: AbortSignal,
): Promise<readonly LaborRecord[]> {
  const records: LaborRecord[] = []
  for (let pageNumber = 1; pageNumber <= 5; pageNumber++) {
    const query = new URLSearchParams({
      page: String(pageNumber), page_size: '100', date_from: range.dateFrom, date_to: range.dateTo,
    })
    if (range.userId !== undefined) query.set('user_id', String(range.userId))
    const value = page(await request(`/${encodeURIComponent(code)}/labor-hours?${query}`, signal), labor)
    records.push(...value.items)
    if (value.items.length < value.pageSize) break
  }
  return records
}

/** 依次写入整批工时并返回后台记录；任一条失败即停止并抛出。 */
export async function saveLaborBatch(entries: readonly LaborBatchEntry[], signal: AbortSignal): Promise<readonly LaborRecord[]> {
  const records: LaborRecord[] = []
  for (const entry of entries) records.push(await saveLabor(entry.projectCode, entry.recordId, entry.draft, signal))
  return records
}

/** 新增或更新工时草稿。 */
export async function saveLabor(projectCode: string, recordId: number | undefined, draft: LaborDraft, signal: AbortSignal) {
  const path = `/${encodeURIComponent(projectCode)}/labor-hours`
  return labor(await request(recordId === undefined ? path : `${path}/${recordId}`, signal, recordId === undefined ? 'POST' : 'PUT', draft))
}

/** 提交当前员工的工时草稿。 */
export async function submitLabor(projectCode: string, recordId: number, signal: AbortSignal) {
  return labor(await request(`/${encodeURIComponent(projectCode)}/labor-hours/${recordId}/submit`, signal, 'POST'))
}

/** 读取当前项目周报和已批准工时汇总。 */
export async function loadWeekly(projectCode: string, start: string, signal: AbortSignal) {
  return weekly(await request(`/${encodeURIComponent(projectCode)}/weekly-reports?period_start=${encodeURIComponent(start)}`, signal))
}

/** 保存当前项目的周报草稿。 */
export async function saveWeekly(projectCode: string, start: string, draft: WeeklyDraft, signal: AbortSignal) {
  return weekly(await request(`/${encodeURIComponent(projectCode)}/weekly-reports`, signal, 'PUT', {
    period_start: start, progress_summary: draft.progress_summary, completed_work: draft.completed_work,
    planned_work: draft.planned_work, issues_and_risks: draft.issues_and_risks.trim() || null,
    need_support: draft.need_support.trim() || null,
  }))
}

/** 提交当前项目的周报草稿。 */
export async function submitWeekly(projectCode: string, start: string, signal: AbortSignal) {
  return weekly(await request(`/${encodeURIComponent(projectCode)}/weekly-reports/submit`, signal, 'POST', { period_start: start }))
}
