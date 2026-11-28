/** 通过工作台同源代理读取合同台账，不依赖 React。 */
import { contractFinanceFields, contractProjectFields, type ContractProjectRecord, type ContractView, type ContractFinanceTotals } from './contract-project-model.ts'
import {
  contractFields, type ContractFilters, type ContractPage, type ContractRecord, type ContractSort,
} from './contract-model.ts'

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
  throw new Error('Invalid YuanShu contract list')
}

function parseContract(value: unknown): ContractRecord {
  const id = integer(field(value, 'id'))
  if (!id) throw new Error('Invalid YuanShu contract record')
  const values: Partial<Record<typeof contractFields[number], string | number>> = {}
  for (const key of contractFields) {
    const entry = cell(field(value, key))
    if (entry !== undefined) values[key] = entry
  }
  return { id, values }
}

function numeric(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseProject(value: unknown): ContractProjectRecord {
  const project = field(value, 'project')
  const code = field(project, 'code')
  if (typeof code !== 'string' || !code) throw new Error('Invalid project contract record')
  const values: Partial<Record<typeof contractProjectFields[number], string | number>> = {}
  for (const key of contractProjectFields) {
    const entry = cell(field(project, key))
    if (entry !== undefined) values[key] = entry
  }
  const finance: Partial<Record<typeof contractFinanceFields[number], number>> = {}
  for (const key of contractFinanceFields) {
    const entry = numeric(field(field(value, 'finance'), key))
    if (entry !== undefined) finance[key] = entry
  }
  return { code, values, finance, contracts: list(field(value, 'contracts')).map(parseContract) }
}

function financeTotals(value: unknown): ContractFinanceTotals {
  const grossMargin = numeric(field(value, 'gross_margin'))
  const grossMarginRate = numeric(field(value, 'gross_margin_rate'))
  return { ...(grossMargin === undefined ? {} : { grossMargin }), ...(grossMarginRate === undefined ? {} : { grossMarginRate }) }
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  const response = await fetch(`/yuanshu-workbench/${path}`, { ...init, headers })
  if (!response.ok) throw Object.assign(new Error('YuanShu contract request failed'), { status: response.status })
  return field(await response.json(), 'data')
}

/** 统计用每页大小：宿主合同代理允许的 page_size 上限为 200。 */
const STATS_PAGE_SIZE = 200

/** 统计最多读取的页数，避免超大租户拖慢页面。 */
const STATS_MAX_PAGES = 20

/** 全量合同：用于统计总量与分布，超出读取上限时标记截断。 */
export interface ContractCatalog {
  readonly items: readonly ContractRecord[]
  readonly total: number
  readonly truncated: boolean
  readonly finance: ContractFinanceTotals
}

/** 读取全部合同（每页 200 条，最多 20 页），供页面统计聚合。 */
export async function fetchContractCatalog(signal: AbortSignal): Promise<ContractCatalog> {
  const filters: ContractFilters = { keyword: '' }
  const first = await fetchContractPage({ page: 1, pageSize: STATS_PAGE_SIZE, filters, sort: undefined }, signal)
  const lastPage = Math.min(Math.max(1, Math.ceil(first.total / STATS_PAGE_SIZE)), STATS_MAX_PAGES)
  const rest = await Promise.all(Array.from({ length: lastPage - 1 }, (_, index) =>
    fetchContractPage({ page: index + 2, pageSize: STATS_PAGE_SIZE, filters, sort: undefined }, signal)))
  return {
    items: [first, ...rest].flatMap(page => page.items),
    total: first.total,
    finance: first.finance ?? {},
    truncated: first.total > lastPage * STATS_PAGE_SIZE,
  }
}

/** 获取后台过滤和排序后的合同分页。 */
export async function fetchContractPage(query: {
  readonly view?: ContractView
  readonly page: number
  readonly pageSize: number
  readonly filters: ContractFilters
  readonly sort: ContractSort | undefined
}, signal: AbortSignal): Promise<ContractPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  if (query.view !== undefined) params.set('view', query.view)
  const keyword = query.filters.keyword.trim()
  if (keyword !== '') params.set('keyword', keyword)
  if (query.sort !== undefined) {
    params.set('sort_by', query.sort.key)
    params.set('sort_direction', query.sort.direction)
  }
  const data = await request(`contracts?${params}`, { signal })
  const total = integer(field(data, 'total'))
  const archiveTotal = integer(field(data, 'archive_total'))
  const pageSize = integer(field(data, 'page_size'))
  if (total === undefined || archiveTotal === undefined || !pageSize) throw new Error('Invalid YuanShu contract pagination')
  return { items: list(field(data, 'items')).map(parseContract), total, archiveTotal, pageSize,
    projects: query.view === 'cards' ? list(field(data, 'projects')).map(parseProject) : [],
    finance: financeTotals(field(data, 'finance')) }
}
