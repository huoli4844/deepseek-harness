/** 客户资源数据层，负责同源请求、响应解析和后台写操作。 */
import { recordListParams, type RecordListFilters, type RecordListSort } from './record-list-query.ts'

/** 客户档案在页面中使用的字段。 */
export interface CustomerRecord {
  readonly id: number
  readonly code: string
  readonly name: string
  readonly shortName: string
  readonly industry: string
  readonly level: string
  readonly contactPerson: string
  readonly contactPhone: string
  readonly contactEmail: string
  readonly address: string
  readonly creditLimit: number
  readonly creditUsed: number
  readonly status: number
  readonly createdAt: string | undefined
  readonly createdBy: number | undefined
}

/** 新建或更新客户的表单字段。 */
export type CustomerDraft = Omit<CustomerRecord, 'id' | 'creditUsed' | 'createdAt' | 'createdBy'>

/** 客户列表接口的一页记录与分页总数。 */
export interface CustomerPage {
  readonly items: readonly CustomerRecord[]
  readonly total: number | undefined
  readonly archiveTotal: number | undefined
  readonly page: number
  readonly pageSize: number
}

/** 客户请求失败的分类，供页面映射状态文案。 */
export type CustomerErrorKind = 'login' | 'denied' | 'failure'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function rows(value: unknown): readonly unknown[] | undefined {
  if (isList(value)) return value
  const body = record(value)
  const data = body?.data
  if (isList(data)) return data
  const dataRecord = record(data)
  for (const container of [dataRecord, body]) {
    for (const key of ['list', 'items', 'records', 'customers', 'rows'] as const) {
      const entries = container?.[key]
      if (isList(entries)) return entries
    }
  }
  return undefined
}

function metadata(value: unknown): readonly Record<string, unknown>[] {
  const body = record(value)
  const data = record(body?.data)
  const containers = [
    body,
    data,
    record(body?.pagination),
    record(data?.pagination),
    record(body?.meta),
    record(data?.meta),
  ]
  return containers.filter((item): item is Record<string, unknown> => item !== undefined)
}

function metadataNumber(containers: readonly Record<string, unknown>[], keys: readonly string[]): number | undefined {
  for (const container of containers) {
    for (const key of keys) {
      const value = container[key]
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
      if (typeof value === 'string' && /^\d+$/u.test(value)) return Number(value)
    }
  }
  return undefined
}

function customer(value: unknown): CustomerRecord | undefined {
  const row = record(value)
  if (row === undefined || number(row.id) <= 0 || text(row.name).trim() === '') return undefined
  return {
    id: number(row.id),
    code: text(row.code),
    name: text(row.name),
    shortName: text(row.short_name),
    industry: text(row.industry),
    level: text(row.level),
    contactPerson: text(row.contact_person),
    contactPhone: text(row.contact_phone),
    contactEmail: text(row.contact_email),
    address: text(row.address),
    creditLimit: number(row.credit_limit),
    creditUsed: number(row.credit_used),
    status: number(row.status),
    createdAt: text(row.created_at) || undefined,
    createdBy: optionalNumber(row.created_by),
  }
}

/** 解析客户列表响应，忽略缺少主键或名称的无效记录。 */
export function parseCustomerList(value: unknown): readonly CustomerRecord[] {
  return (rows(value) ?? []).map(customer).filter((item): item is CustomerRecord => item !== undefined)
}

/** 解析客户记录、两个总数和分页元数据。 */
export function parseCustomerPage(value: unknown, requestedPage: number, requestedPageSize: number): CustomerPage {
  const rawRows = rows(value) ?? []
  const containers = metadata(value)
  const page = metadataNumber(containers, ['page', 'current_page', 'currentPage']) ?? requestedPage
  const pageSize = metadataNumber(containers, ['page_size', 'pageSize', 'per_page', 'perPage']) ?? requestedPageSize
  const total = metadataNumber(containers, ['total', 'total_count', 'totalCount', 'total_size', 'totalSize', 'total_records'])
  return {
    items: rawRows.map(customer).filter((item): item is CustomerRecord => item !== undefined),
    total,
    archiveTotal: metadataNumber(containers, ['archive_total']),
    page,
    pageSize,
  }
}

/** 登记查重需要完整可识别的客户列表，不能把无效响应当空列表。 */
export function parseCustomerRegistrationPage(value: unknown, page: number, size: number): CustomerPage | undefined {
  const entries = rows(value)
  if (!entries) return undefined
  const parsed = parseCustomerPage(value, page, size)
  if (parsed.page !== page || parsed.items.length !== entries.length ||
      parsed.items.some(row => !Number.isSafeInteger(row.id) || row.code.trim() === '')) return undefined
  return parsed
}

function headers(): Headers {
  const result = new Headers({
    authorization: `Bearer ${localStorage.getItem('workbench-client-token') ?? ''}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  return result
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' as const })
  const requestHeaders = headers()
  if (init?.body !== undefined) requestHeaders.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/customers${path}`, { ...init, headers: requestHeaders })
  if (response.status === 401) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' as const })
  if (response.status === 403) throw Object.assign(new Error('YuanShu access denied'), { kind: 'denied' as const })
  if (!response.ok) throw Object.assign(new Error(`YuanShu customer request failed: ${response.status}`), { kind: 'failure' as const })
  if (response.status === 204) return undefined
  return response.json()
}

/** 拉取当前租户的客户档案。 */
export async function fetchCustomers(signal: AbortSignal): Promise<readonly CustomerRecord[]> {
  return (await fetchCustomerPage(1, 200, {}, undefined, signal)).items
}

/** 按筛选条件和排序拉取指定页客户档案。 */
export async function fetchCustomerPage(
  page: number,
  pageSize: number,
  filters: RecordListFilters,
  sort: RecordListSort | undefined,
  signal: AbortSignal,
): Promise<CustomerPage> {
  const params = recordListParams(page, pageSize, filters, sort)
  const body = await request(`?${params}`, { signal })
  return parseCustomerPage(body, page, pageSize)
}

/** 创建客户档案。 */
export async function createCustomer(draft: CustomerDraft, signal: AbortSignal): Promise<void> {
  await request('', { method: 'POST', body: JSON.stringify(toPayload(draft)), signal })
}

/** 更新客户档案。 */
export async function updateCustomer(id: number, draft: CustomerDraft, signal: AbortSignal): Promise<void> {
  await request(`/${id}`, { method: 'PUT', body: JSON.stringify(toPayload(draft)), signal })
}

/** 删除客户档案。 */
export async function deleteCustomer(id: number, signal: AbortSignal): Promise<void> {
  await request(`/${id}`, { method: 'DELETE', signal })
}

function toPayload(draft: CustomerDraft): Record<string, unknown> {
  return {
    code: draft.code,
    name: draft.name,
    short_name: draft.shortName,
    industry: draft.industry,
    level: draft.level,
    contact_person: draft.contactPerson,
    contact_phone: draft.contactPhone,
    contact_email: draft.contactEmail,
    address: draft.address,
    credit_limit: draft.creditLimit,
    status: draft.status,
  }
}
