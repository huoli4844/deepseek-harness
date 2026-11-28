/** 合同台账的汇总筛选、排序和分页。只消费已授权读取的数据，不执行网络请求。 */
import type { ContractCatalogRow } from './contract-catalog.ts'

const sortable = new Set(['code', 'contract_type', 'counterparty_name', 'project_name', 'signed_date',
  'effective_date', 'expiry_date', 'total_amount', 'tax_amount', 'owed_amount', 'warranty_amount', 'status'])
const numeric = new Set(['total_amount', 'tax_amount', 'owed_amount', 'warranty_amount'])
const collator = new Intl.Collator('zh-CN', { numeric: true })

/** 解析受支持的查询条件；非法页码和排序字段不执行后台查询。 */
export function contractListQuery(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('page_size') ?? 20)
  const sortBy = params.get('sort_by') ?? 'code'
  const direction = params.get('sort_direction') ?? 'asc'
  const view = params.get('view') ?? 'list'
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200
    || !sortable.has(sortBy) || !['asc', 'desc'].includes(direction) || !['cards', 'list'].includes(view)) return undefined
  return { page, pageSize, sortBy, direction, view, keyword: (params.get('keyword') ?? '').trim().toLowerCase() }
}

/** 对完整可见合同先搜索排序，再截取页码，同时保留未筛选的总数。 */
export function contractListPage(rows: readonly ContractCatalogRow[], query: NonNullable<ReturnType<typeof contractListQuery>>) {
  const matches = rows.filter(row => !query.keyword || ['code', 'counterparty_name', 'project_name', 'project_code']
    .some(key => typeof row[key] === 'string' && row[key].toLowerCase().includes(query.keyword)))
  const text = (value: unknown) => typeof value === 'number' || typeof value === 'string' ? String(value) : ''
  matches.sort((a, b) => {
    const result = numeric.has(query.sortBy)
      ? Number(a[query.sortBy] ?? 0) - Number(b[query.sortBy] ?? 0)
      : collator.compare(text(a[query.sortBy]), text(b[query.sortBy]))
    return (query.direction === 'desc' ? -result : result) || Number(a.id) - Number(b.id)
  })
  const start = (query.page - 1) * query.pageSize
  return { items: matches.slice(start, start + query.pageSize), total: matches.length,
    archive_total: rows.length, page: query.page, page_size: query.pageSize }
}
