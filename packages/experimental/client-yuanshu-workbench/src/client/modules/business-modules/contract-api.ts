/** 通过工作台同源代理读取合同台账，不依赖 React。 */
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

/** 获取后台过滤和排序后的合同分页。 */
export async function fetchContractPage(query: {
  readonly page: number
  readonly pageSize: number
  readonly filters: ContractFilters
  readonly sort: ContractSort | undefined
}, signal: AbortSignal): Promise<ContractPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
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
  return { items: list(field(data, 'items')).map(parseContract), total, archiveTotal, pageSize }
}
