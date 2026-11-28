/** 从授权项目合同构建卡片分页与整体财务指标；不发请求，不依赖客户端。 */
import type { ContractCatalogRow, ProjectContractCatalog } from './contract-catalog.ts'
import type { contractListQuery } from './contract-list.ts'

function number(value: unknown): number | undefined {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function total(portfolio: readonly ProjectContractCatalog[], key: string): number | undefined {
  let sum = 0
  for (const item of portfolio) {
    const value = number(item.finance?.[key])
    if (value === undefined) return undefined
    sum += value
  }
  return sum
}

/** 全局毛利率按项目财务收入加权，收入缺失或为零时不返回百分比。 */
export function portfolioFinance(portfolio: readonly ProjectContractCatalog[]) {
  const gross = total(portfolio, 'gross_margin')
  const revenue = total(portfolio, 'contract_amount')
  return {
    ...(gross === undefined ? {} : { gross_margin: gross }),
    ...(gross === undefined || revenue === undefined || revenue === 0 ? {} : { gross_margin_rate: gross / revenue * 100 }),
  }
}

function match(row: ContractCatalogRow, keys: readonly string[], keyword: string) {
  return keys.some(key => typeof row[key] === 'string' && row[key].toLowerCase().includes(keyword))
}

/** 从完整项目集合检索后分页；匹配合同相对方时保留所属项目的全部合同。 */
export function contractProjectPage(
  portfolio: readonly ProjectContractCatalog[], query: NonNullable<ReturnType<typeof contractListQuery>>,
) {
  const matches = portfolio.filter(item => !query.keyword
    || match(item.project, ['code', 'name', 'customer_name', 'manager_name'], query.keyword)
    || item.contracts.some(contract => match(contract, ['code', 'counterparty_name'], query.keyword)))
  matches.sort((a, b) => String(a.project.code).localeCompare(String(b.project.code), 'zh-CN', { numeric: true }))
  const start = (query.page - 1) * query.pageSize
  return {
    items: [], projects: matches.slice(start, start + query.pageSize), total: matches.length,
    archive_total: portfolio.reduce((sum, item) => sum + item.contracts.length, 0),
    page: query.page, page_size: query.pageSize,
  }
}
