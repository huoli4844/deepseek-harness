/** 供应商管理数据层，负责同源请求、响应解析和后台写操作。 */

import type { SupplierCatalog, SupplierDraft, SupplierErrorKind, SupplierPage, SupplierRecord } from './supplier-model.ts'
import { recordListParams, type RecordListFilters, type RecordListSort } from './record-list-query.ts'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function text(value: unknown): string { return typeof value === 'string' ? value : '' }
function integer(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}
function decimal(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined
}
function rows(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  const body = record(value)
  const data = body?.data
  if (Array.isArray(data)) return data
  const dataRecord = record(data)
  for (const container of [dataRecord, body]) {
    for (const key of ['list', 'items', 'records', 'suppliers', 'rows'] as const) {
      if (Array.isArray(container?.[key])) return container[key] as readonly unknown[]
    }
  }
  throw new Error('Unexpected YuanShu supplier list response')
}
function metadata(value: unknown): readonly Record<string, unknown>[] {
  const body = record(value)
  const data = record(body?.data)
  return [body, data, record(body?.pagination), record(data?.pagination), record(body?.meta), record(data?.meta)]
    .filter((item): item is Record<string, unknown> => item !== undefined)
}
function metadataNumber(containers: readonly Record<string, unknown>[], keys: readonly string[]): number | undefined {
  for (const container of containers) for (const key of keys) {
    const value = integer(container[key])
    if (value !== undefined) return value
  }
  return undefined
}
function supplier(value: unknown): SupplierRecord | undefined {
  const row = record(value)
  const id = integer(row?.id)
  if (row === undefined || id === undefined || id === 0 || text(row.name).trim() === '') return undefined
  return {
    id, code: text(row.code), name: text(row.name), shortName: text(row.short_name),
    supplierType: text(row.supplier_type), category: text(row.category), contactPerson: text(row.contact_person),
    contactPhone: text(row.contact_phone), contactEmail: text(row.contact_email), address: text(row.address),
    bankInfo: text(row.bank_info), paymentTerms: text(row.payment_terms),
    qualityRating: decimal(row.quality_rating), deliveryRating: decimal(row.delivery_rating),
    priceRating: decimal(row.price_rating), serviceRating: decimal(row.service_rating),
    totalScore: decimal(row.total_score), admissionStatus: text(row.admission_status),
    ownerUserId: integer(row.owner_user_id), remark: text(row.remark), status: integer(row.status),
    createdBy: integer(row.created_by), createdAt: text(row.created_at) || undefined,
    updatedAt: text(row.updated_at) || undefined,
    deletedAt: text(row.deleted_at) || undefined, sourceBucket: text(row.source_bucket),
    sourceObjectKey: text(row.source_object_key), sourceSheet: text(row.source_sheet),
    sourceRowNo: integer(row.source_row_no), ingestionBatchId: integer(row.ingestion_batch_id),
    evidenceRefId: integer(row.evidence_ref_id), confidence: decimal(row.confidence),
    reviewStatus: text(row.review_status), businessTenantId: integer(row.business_tenant_id),
  }
}

/** 解析供应商列表响应。 */
export function parseSupplierPage(value: unknown, requestedPage: number, requestedPageSize: number): SupplierPage {
  const containers = metadata(value)
  const total = metadataNumber(containers, ['total', 'total_count', 'totalCount', 'total_size', 'totalSize', 'total_records'])
  return {
    items: rows(value).map(supplier).filter((item): item is SupplierRecord => item !== undefined),
    total,
    archiveTotal: metadataNumber(containers, ['archive_total']),
    page: metadataNumber(containers, ['page', 'current_page', 'currentPage']) ?? requestedPage,
    pageSize: metadataNumber(containers, ['page_size', 'pageSize', 'per_page', 'perPage']) ?? requestedPageSize,
  }
}
function requestError(kind: SupplierErrorKind, status?: number): Error {
  return Object.assign(new Error(`YuanShu supplier request failed: ${status ?? kind}`), { kind })
}

async function request(path: string, init: RequestInit, endpoint = 'suppliers'): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw requestError('login')
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/${endpoint}${path}`, { ...init, headers })
  if (response.status === 401) throw requestError('login', response.status)
  if (response.status === 403) throw requestError('denied', response.status)
  if (!response.ok) throw requestError('failure', response.status)
  return response.status === 204 ? undefined : response.json()
}

/** 按筛选条件和排序拉取指定页供应商档案。 */
export async function fetchSupplierPage(
  page: number,
  pageSize: number,
  filters: RecordListFilters,
  sort: RecordListSort | undefined,
  signal: AbortSignal,
): Promise<SupplierPage> {
  const params = recordListParams(page, pageSize, filters, sort)
  return parseSupplierPage(await request(`?${params}`, { signal }), page, pageSize)
}

/** 统计用的每页条数，与后台 page_size 上限一致；请求更大时响应会被截到 100 条。 */
const STATS_PAGE_SIZE = 100
/** 统计最多拉取的页数，避免超大租户长时间占用请求。 */
const STATS_MAX_PAGES = 20

/** 用空筛选逐页读取全量供应商档案，供页面统计聚合；超过页数上限时标记截断。 */
export async function fetchSupplierCatalog(signal: AbortSignal): Promise<SupplierCatalog> {
  const items: SupplierRecord[] = []
  let total: number | undefined
  let truncated = false
  for (let page = 1; page <= STATS_MAX_PAGES; page += 1) {
    const data = await fetchSupplierPage(page, STATS_PAGE_SIZE, {}, undefined, signal)
    items.push(...data.items)
    total ??= data.total
    const size = data.pageSize > 0 ? data.pageSize : STATS_PAGE_SIZE
    if (data.items.length < size) break
    if (total !== undefined && page >= Math.ceil(total / size)) break
    if (page === STATS_MAX_PAGES) truncated = true
  }
  return { items, total, truncated }
}

/** 读取当前租户供应商分类选项。 */
export async function fetchSupplierCategories(signal: AbortSignal): Promise<readonly string[]> {
  const value = await request('', { signal }, 'supplier-categories')
  return rows(value).map(item => text(record(item)?.category)).filter(Boolean)
}
/** 创建供应商档案。 */
export async function createSupplier(draft: SupplierDraft, signal: AbortSignal): Promise<void> {
  await request('', { method: 'POST', body: JSON.stringify(toPayload(draft)), signal })
}
/** 更新供应商档案。 */
export async function updateSupplier(id: number, draft: SupplierDraft, signal: AbortSignal): Promise<void> {
  await request(`/${id}`, { method: 'PUT', body: JSON.stringify(toPayload(draft)), signal })
}
/** 删除供应商档案。 */
export async function deleteSupplier(id: number, signal: AbortSignal): Promise<void> {
  await request(`/${id}`, { method: 'DELETE', signal })
}
function toPayload(draft: SupplierDraft): Record<string, unknown> {
  return {
    code: draft.code.trim(),
    name: draft.name.trim(),
    short_name: draft.shortName,
    supplier_type: draft.supplierType,
    category: draft.category,
    contact_person: draft.contactPerson,
    contact_phone: draft.contactPhone,
    contact_email: draft.contactEmail,
    address: draft.address,
    admission_status: draft.admissionStatus,
    status: draft.status,
  }
}
