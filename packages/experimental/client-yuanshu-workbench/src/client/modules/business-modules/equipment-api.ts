/** 通过工作台同源代理读写设备台账，不依赖 React。 */
import {
  equipmentFields, type EquipmentDraft, type EquipmentFilters, type EquipmentPage, type EquipmentRecord, type EquipmentSort,
} from './equipment-model.ts'

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

async function request(path: string, init: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/${path}`, { ...init, headers })
  if (!response.ok) throw Object.assign(new Error('YuanShu equipment request failed'), { status: response.status })
  return field(await response.json(), 'data')
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
  if (total === undefined || archiveTotal === undefined || !pageSize) throw new Error('Invalid YuanShu equipment pagination')
  return { items: list(field(data, 'items')).map(parseEquipment), total, archiveTotal, pageSize }
}

/** 新建设备档案。 */
export async function createEquipment(draft: EquipmentDraft, signal: AbortSignal): Promise<void> {
  await request('equipments', { method: 'POST', signal, body: JSON.stringify(payload(draft)) })
}

/** 更新同一租户内设备档案的可编辑字段。 */
export async function updateEquipment(id: number, draft: EquipmentDraft, signal: AbortSignal): Promise<void> {
  await request(`equipments/${id}`, { method: 'PUT', signal, body: JSON.stringify(payload(draft)) })
}

/** 软删除同一租户内的设备档案。 */
export async function deleteEquipment(id: number, signal: AbortSignal): Promise<void> {
  await request(`equipments/${id}`, { method: 'DELETE', signal })
}
