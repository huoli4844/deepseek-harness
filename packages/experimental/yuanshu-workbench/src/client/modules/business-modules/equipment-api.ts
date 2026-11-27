/** 通过工作台同源代理读写设备台账与登记表单，不依赖 React。 */
import {
  equipmentFields, type EquipmentDraft, type EquipmentFilters, type EquipmentPage, type EquipmentRecord, type EquipmentSort,
} from './equipment-model.ts'
import { recordDefinitions, type RecordContent, type RecordKind } from '../../../business-forms/record-create.ts'
import { parseCustomerRegistrationPage } from './customer-api.ts'
import { contractProjectCode } from '../../../business-forms/sales-contract-create.ts'
import { projectCodePattern } from '../../../business-forms/project-create.ts'

/** 保存后台可展示的业务错误，不把原始响应或 HTML 传给界面。 */
export class EquipmentRequestError extends Error {
  constructor(readonly status: number, readonly code?: string, readonly detail?: string) {
    super('YuanShu equipment request failed')
  }
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function cell(value: unknown): number | string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function list(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  throw new Error('Invalid YuanShu equipment list')
}

function parseEquipment(value: unknown): EquipmentRecord {
  const id = integer(field(value, 'id'))
  if (!id) throw new Error('Invalid YuanShu equipment record')
  const values: Partial<Record<typeof equipmentFields[number], string | number>> = {}
  for (const key of equipmentFields) {
    const entry = cell(field(value, key))
    if (entry !== undefined) values[key] = entry
  }
  return { id, values }
}

async function requestEnvelope(path: string, init: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/${path}`, { ...init, headers })
  const body: unknown = await response.json().catch(() => undefined)
  const directRecord = (path === 'customers' || path === 'projects' || path.startsWith('projects/') || path.endsWith('/contracts')) &&
    integer(field(body, 'id')) &&
    typeof field(body, 'code') === 'string'
  const code = directRecord ? undefined : field(body, 'code')
  const errorCode = field(body, 'error_code') ?? code
  if (!response.ok || (code !== undefined && code !== 0 && code !== 200 && code !== 201)) {
    const detail = field(body, 'message') ?? field(body, 'msg') ?? field(body, 'error')
    throw new EquipmentRequestError(response.status, typeof errorCode === 'number' || typeof errorCode === 'string' ? String(errorCode).slice(0, 80) : undefined,
      typeof detail === 'string' ? detail.slice(0, 400) : undefined)
  }
  return body
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  return field(await requestEnvelope(path, init), 'data')
}

/** 把编辑草稿转换为后台写入契约，空日期与空文本按可空字段发送 null。 */
function payload(draft: EquipmentDraft): Readonly<Record<string, unknown>> {
  return {
    code: draft.code.trim(), name: draft.name.trim(), equipment_type: draft.equipmentType.trim(),
    workshop: draft.workshop.trim(), model: draft.model.trim() || null, manufacturer: draft.manufacturer.trim(),
    purchase_date: draft.purchaseDate || null, arrival_date: draft.arrivalDate || null,
    lifecycle_status: draft.lifecycleStatus, runtime_status: draft.runtimeStatus,
    maint_interval_days: Number(draft.maintIntervalDays),
    serial_no: draft.serialNo.trim(), qr_code: draft.qrCode.trim(),
    category_code: draft.categoryCode.trim(), category_name: draft.categoryName.trim(),
    subcategory_code: draft.subcategoryCode.trim(), subcategory_name: draft.subcategoryName.trim(),
    remark: draft.remark.trim(),
  }
}

/** 获取后台过滤和排序后的设备台账页。 */
export async function fetchEquipmentPage(query: {
  readonly page: number
  readonly pageSize: number
  readonly filters: EquipmentFilters
  readonly sort: EquipmentSort | undefined
}, signal: AbortSignal): Promise<EquipmentPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  const keyword = query.filters.keyword.trim()
  if (keyword !== '') params.set('keyword', keyword)
  if (query.sort !== undefined) {
    params.set('sort_by', query.sort.key)
    params.set('sort_direction', query.sort.direction)
  }
  const data = await request(`equipments?${params}`, { signal })
  const total = integer(field(data, 'total'))
  const archiveTotal = integer(field(data, 'archive_total'))
  const pageSize = integer(field(data, 'page_size'))
  if (total === undefined || !pageSize) throw new Error('Invalid YuanShu equipment pagination')
  return { items: list(field(data, 'items')).map(parseEquipment), total, archiveTotal: archiveTotal ?? (keyword === '' ? total : undefined), pageSize }
}

/** 新建设备档案。 */
export async function createEquipment(draft: EquipmentDraft, signal: AbortSignal): Promise<void> {
  await request('equipments', { method: 'POST', signal, body: JSON.stringify(payload(draft)) })
}

/** 逐页读取当前租户可见档案，不假定云端支持关键词筛选。 */
async function scanRecords(kind: RecordKind, match: (row: unknown) => boolean, signal: AbortSignal): Promise<unknown> {
  if (kind === 'customer') return scanCustomers(match, signal)
  const path = recordDefinitions[kind].path
  const ids = new Set<number>()
  for (let page = 1; page <= 100; page += 1) {
    const data = await request(`${path}?page=${page}&page_size=100`, { signal })
    const items = list(field(data, 'items'))
    const total = integer(field(data, 'total'))
    const pageSize = integer(field(data, 'page_size'))
    if (total === undefined || !pageSize || field(data, 'page') !== page && field(data, 'page') !== undefined) break
    for (const item of items) {
      const id = integer(field(item, 'id'))
      if (!id || ids.has(id)) throw new EquipmentRequestError(502)
      ids.add(id)
      if (match(item)) return item
    }
    if (ids.size >= total) return undefined
    if (!items.length) break
  }
  throw new EquipmentRequestError(502)
}

async function scanCustomers(match: (row: unknown) => boolean, signal: AbortSignal): Promise<unknown> {
  const ids = new Set<number>()
  const size = 200
  for (let page = 1; page <= 100; page += 1) {
    const body = await requestEnvelope(`customers?page=${page}&page_size=${size}`, { signal })
    const result = parseCustomerRegistrationPage(body, page, size)
    if (!result) break
    for (const item of result.items) {
      if (ids.has(item.id)) throw new EquipmentRequestError(502)
      ids.add(item.id)
      if (match(item)) return item
    }
    if (result.total !== undefined && ids.size > result.total) break
    if (ids.size === result.total) return undefined
    if (result.items.length === 0 && result.total === undefined) return undefined
    if (result.items.length === 0) break
  }
  throw new EquipmentRequestError(502)
}

/** 通过同一租户的客户档案，把项目合同的对方名称或客户编码解析成唯一客户。 */
export async function resolveSalesCustomer(content: RecordContent, signal: AbortSignal): Promise<RecordContent | undefined> {
  const name = content.counterparty_name?.trim().toLowerCase()
  const id = content.counterparty_id?.trim()
  let matched: RecordContent | undefined
  const ambiguous = await scanCustomers((row) => {
    const candidate = integer(field(row, 'id'))
    const label = field(row, 'name')
    const code = field(row, 'code')
    if (!candidate || typeof label !== 'string') return false
    const matchesName = name === label.trim().toLowerCase() || (typeof code === 'string' && name === code.trim().toLowerCase())
    if (id ? id !== String(candidate) || (name && !matchesName) : !matchesName) return false
    if (matched) return true
    matched = { ...content, counterparty_id: String(candidate), counterparty_name: label }
    return Boolean(id)
  }, signal)
  return ambiguous && !id ? undefined : matched
}

/** 核实当前租户可访问选定项目的合同列表。新增权限由云端写入接口独立校验。 */
export async function checkSalesProject(content: RecordContent, signal: AbortSignal): Promise<void> {
  const code = content.project_code?.trim() ?? ''
  if (!contractProjectCode.test(code)) throw new EquipmentRequestError(400)
  await requestEnvelope(`projects/${code}/contracts?page=1&page_size=1`, { signal })
}

/** 批量预检时只扫描一次云端列表，返回首个重复的行号和字段。 */
export async function findRecordDuplicate(kind: RecordKind, records: readonly RecordContent[], signal: AbortSignal) {
  if (kind === 'project') {
    for (const [index, record] of records.entries()) {
      if (await readProject(record.code?.trim() ?? '', signal)) return { index, key: 'code' }
    }
    return undefined
  }
  const keys = new Map<string, { index: number; key: string }>()
  for (const [index, content] of records.entries()) {
    for (const key of recordDefinitions[kind].unique) {
      const value = content[key]?.trim().toLowerCase()
      if (value) keys.set(`${key}:${value}`, { index, key })
    }
  }
  if (keys.size === 0) return undefined
  let duplicate: { index: number; key: string } | undefined
  await scanRecords(kind, (row) => {
    for (const key of recordDefinitions[kind].unique) {
      const value = field(row, key)
      if (typeof value !== 'string') continue
      duplicate = keys.get(`${key}:${value.trim().toLowerCase()}`)
      if (duplicate) return true
    }
    return false
  }, signal)
  return duplicate
}

/** 校验新增回执；仅返回 ID 时按 ID 和业务编号回查。 */
export async function submitRecordContent(kind: RecordKind, content: RecordContent, signal: AbortSignal): Promise<string | undefined> {
  if (kind === 'sales-contract') return submitSalesContract(content, signal)
  if (kind === 'project') return submitProject(content, signal)
  const def = recordDefinitions[kind]
  const envelope = await requestEnvelope(def.path, { method: 'POST', signal, body: JSON.stringify(def.payload(content)) })
  const data = field(envelope, 'data') ?? (kind === 'customer' ? envelope : undefined)
  const id = integer(field(data, 'id'))
  const key = def.receiptKey
  const expected = content[key]?.trim()
  if (id && field(data, key) === expected) return
  const acknowledged = kind === 'customer' && (field(envelope, 'code') === 0 || field(envelope, 'code') === 200 || field(envelope, 'code') === 201)
  if (!id && !acknowledged) throw new EquipmentRequestError(502)
  try {
    const row = await scanRecords(kind, item => field(item, key) === expected &&
      (id ? field(item, 'id') === id : field(item, 'name') === content.name?.trim()), signal)
    if (row) return
  } catch (error) {
    throw new EquipmentRequestError(502, undefined, error instanceof EquipmentRequestError ? error.detail : undefined)
  }
  throw new EquipmentRequestError(502)
}

async function readProject(code: string, signal: AbortSignal): Promise<unknown> {
  if (!projectCodePattern.test(code)) throw new EquipmentRequestError(400)
  try {
    const body = await requestEnvelope(`projects/${encodeURIComponent(code)}`, { signal })
    const row = field(body, 'data') ?? body
    if (!integer(field(row, 'id')) || field(row, 'code') !== code) throw new EquipmentRequestError(502)
    return row
  } catch (error) {
    if (error instanceof EquipmentRequestError && error.status === 404) return undefined
    throw error
  }
}

async function submitProject(content: RecordContent, signal: AbortSignal): Promise<string> {
  const definition = recordDefinitions.project
  const code = content.code?.trim() ?? ''
  const name = content.name?.trim()
  if (definition.invalid(content).length) throw new EquipmentRequestError(400)
  const body = await requestEnvelope(definition.path, { method: 'POST', signal, body: JSON.stringify(definition.payload(content)) })
  const row = field(body, 'data') ?? body
  const id = integer(field(row, 'id'))
  if (id && field(row, 'code') === code && field(row, 'name') === name) return code
  const status = field(body, 'code')
  if (id || status === 0 || status === 200 || status === 201) {
    try {
      const confirmed = await readProject(code, signal)
      if (field(confirmed, 'name') === name && (!id || field(confirmed, 'id') === id)) return code
    } catch {
      // 写入已发出，回查失败时保留表单，避免重复创建。
    }
  }
  throw new EquipmentRequestError(502)
}

async function submitSalesContract(content: RecordContent, signal: AbortSignal): Promise<string> {
  const project = content.project_code?.trim() ?? ''
  const customer = Number(content.counterparty_id)
  const definition = recordDefinitions['sales-contract']
  if (!contractProjectCode.test(project) || !Number.isSafeInteger(customer) || customer <= 0 ||
      definition.invalid(content).length > 0) throw new EquipmentRequestError(400)
  const path = `projects/${project}/contracts`
  const envelope = await requestEnvelope(path, { method: 'POST', signal, body: JSON.stringify(definition.payload(content)) })
  const receipt = field(envelope, 'data') ?? envelope
  const created = integer(field(receipt, 'id'))
  if (!created) throw new EquipmentRequestError(502)
  const direct = salesReceiptCode(receipt, created, customer)
  if (direct) return direct
  try {
    const result = await requestEnvelope(`${path}?page=1&page_size=100`, { signal })
    const data = field(result, 'data') ?? result
    const entries = Array.isArray(data) ? data : field(data, 'items') ?? field(data, 'list')
    if (Array.isArray(entries)) {
      for (const row of entries) {
        const code = salesReceiptCode(row, created, customer)
        if (code) return code
      }
    }
  } catch {
    // 写入已发出，回查失败不能当作后台明确拒绝。
  }
  throw new EquipmentRequestError(502)
}

function salesReceiptCode(row: unknown, id: number, customer: number): string | undefined {
  const code = field(row, 'code')
  return field(row, 'id') === id && field(row, 'contract_type') === 'sales' &&
    field(row, 'status') === 'draft' && field(row, 'counterparty_id') === customer &&
    typeof code === 'string' && code.trim() ? code : undefined
}

/** 更新同一租户内设备档案的可编辑字段。 */
export async function updateEquipment(id: number, draft: EquipmentDraft, signal: AbortSignal): Promise<void> {
  await request(`equipments/${id}`, { method: 'PUT', signal, body: JSON.stringify(payload(draft)) })
}

/** 软删除同一租户内的设备档案。 */
export async function deleteEquipment(id: number, signal: AbortSignal): Promise<void> {
  await request(`equipments/${id}`, { method: 'DELETE', signal })
}
