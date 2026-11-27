/** 通过工作台同源代理读取和新增物料档案资源，不依赖 React。 */
import { materialColumns, type MaterialCategory, type MaterialCategoryDraft, type MaterialDraft, type MaterialFilters, type MaterialPage, type MaterialRecord, type MaterialSort } from './material-model.ts'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function cell(value: unknown): number | string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function options(value: unknown): readonly string[] {
  const values: readonly unknown[] = Array.isArray(value) ? value : []
  return [...new Set(values.map(cell).filter(value => value !== undefined && value !== '').map(String))]
}

function list(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  throw new Error('Invalid YuanShu material list')
}

function parseMaterial(value: unknown): MaterialRecord {
  const id = integer(field(value, 'id'))
  if (!id) throw new Error('Invalid YuanShu material record')
  const values: Partial<Record<typeof materialColumns[number]['key'], string | number>> = {}
  for (const column of materialColumns) {
    const entry = cell(field(value, column.key))
    if (entry !== undefined) values[column.key] = entry
  }
  return { id, values }
}

function parseCategory(value: unknown): MaterialCategory {
  const id = integer(field(value, 'id'))
  const code = text(field(value, 'code'))
  const name = text(field(value, 'name'))
  if (!id || !code || !name) throw new Error('Invalid YuanShu material category')
  return { id, code, name, parentId: integer(field(value, 'parent_id')) || undefined }
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
  if (!response.ok) throw Object.assign(new Error('YuanShu material request failed'), { status: response.status })
  return field(await response.json(), 'data')
}

/** 获取后台过滤和排序后的物料档案页。 */
export async function fetchMaterialPage(query: {
  readonly page: number
  readonly pageSize: number
  readonly filters: MaterialFilters
  readonly categoryId: number | undefined
  readonly sort: MaterialSort | undefined
}, signal: AbortSignal): Promise<MaterialPage> {
  const { filters, categoryId, sort } = query
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  for (const [key, value] of Object.entries({
    code: filters.code.trim(), name: filters.name.trim(),
    material_type: filters.materialType, critical_level: filters.criticalLevel,
  })) {
    if (value !== '') params.set(key, value)
  }
  if (categoryId !== undefined) params.set('category_id', String(categoryId))
  if (sort !== undefined) {
    params.set('sort_by', sort.key)
    params.set('sort_dir', sort.direction)
  }
  const data = await request(`materials?${params}`, { signal })
  const total = integer(field(data, 'total'))
  // 线上后台只返回 items/total，档案总数与页大小在这里按缺省值兜底。
  const archiveTotal = integer(field(data, 'archive_total')) ?? total
  const pageSize = integer(field(data, 'page_size')) ?? query.pageSize
  if (total === undefined || archiveTotal === undefined || !pageSize) throw new Error('Invalid YuanShu material pagination')
  const items = list(field(data, 'items')).map(parseMaterial)
  const materialTypes = options(field(data, 'material_types'))
  const criticalLevels = options(field(data, 'critical_levels'))
  return {
    items,
    total,
    archiveTotal,
    pageSize,
    // 下拉选项缺失时按当前页数据去重，保证筛选控件仍可使用。
    materialTypes: materialTypes.length > 0 ? materialTypes : distinctColumn(items, 'material_type'),
    criticalLevels: criticalLevels.length > 0 ? criticalLevels : distinctColumn(items, 'critical_level'),
  }
}

/** 按列去重当前页中出现的非空取值。 */
function distinctColumn(records: readonly MaterialRecord[], key: 'material_type' | 'critical_level'): readonly string[] {
  const values = new Set<string>()
  for (const record of records) {
    const value = record.values[key]
    if (typeof value === 'string' && value.trim() !== '') values.add(value)
  }
  return [...values]
}

/** 统计用每页大小：后台对 page_size 的上限为 100。 */
const STATS_PAGE_SIZE = 100
/** 统计最多读取的页数，避免超大租户拖慢页面。 */
const STATS_MAX_PAGES = 20

/** 全量物料档案：用于统计总量与分布，超出上限时标记截断。 */
export interface MaterialCatalog {
  readonly items: readonly MaterialRecord[]
  readonly total: number
  readonly truncated: boolean
}

/** 读取全部物料档案（每页 100 条，最多 20 页），供页面统计聚合。 */
export async function fetchMaterialCatalog(signal: AbortSignal): Promise<MaterialCatalog> {
  const filters: MaterialFilters = { code: '', name: '', materialType: '', criticalLevel: '' }
  const items: MaterialRecord[] = []
  let total = 0
  let truncated = false
  // 串行翻页：并发请求会触发云端限流，导致统计整体失败。
  for (let page = 1; page <= STATS_MAX_PAGES; page += 1) {
    const data = await fetchMaterialPage({ page, pageSize: STATS_PAGE_SIZE, filters, categoryId: undefined, sort: undefined }, signal)
    items.push(...data.items)
    if (page === 1) total = data.total
    if (data.items.length < STATS_PAGE_SIZE || page * STATS_PAGE_SIZE >= total) break
    if (page === STATS_MAX_PAGES) truncated = true
  }
  return { items, total, truncated }
}

/** 获取物料分类及匹配分类的祖先。 */
export async function fetchMaterialCategories(keyword: string, signal: AbortSignal): Promise<readonly MaterialCategory[]> {
  const query = keyword === '' ? '' : `?${new URLSearchParams({ keyword })}`
  const data = await request(`material-categories${query}`, { signal })
  return list(field(data, 'items')).map(parseCategory)
}

/** 新建物料分类，父级可选。 */
export async function createMaterialCategory(draft: MaterialCategoryDraft, signal: AbortSignal): Promise<MaterialCategory> {
  const data = await request('material-categories', { method: 'POST', signal, body: JSON.stringify({
    code: draft.code.trim(), name: draft.name.trim(), parent_id: draft.parentId,
    description: draft.description.trim() || undefined,
  }) })
  return parseCategory(data)
}

/** 更新同一租户内物料档案的业务字段。 */
export async function updateMaterial(id: number, draft: MaterialDraft, signal: AbortSignal): Promise<void> {
  await request(`materials/${id}`, { method: 'PUT', signal, body: JSON.stringify({
    code: draft.code.trim(), name: draft.name.trim(), spec: draft.spec?.trim() || null,
    material_type: draft.materialType.trim(), category_code: draft.categoryCode.trim(),
    category_code2: draft.categoryCode2.trim(), unit: draft.unit.trim(), brand: draft.brand.trim(),
    model: draft.model.trim(), drawing_no: draft.drawingNo?.trim() || null,
    price_suggested: Number(draft.priceSuggested), safety_stock: Number(draft.safetyStock),
    lead_time_days: Number(draft.leadTimeDays), critical_level: draft.criticalLevel.trim(),
    remark: draft.remark.trim(), status: Number(draft.status),
  }) })
}

/** 软删除同一租户内的物料档案。 */
export async function deleteMaterial(id: number, signal: AbortSignal): Promise<void> {
  await request(`materials/${id}`, { method: 'DELETE', signal })
}
