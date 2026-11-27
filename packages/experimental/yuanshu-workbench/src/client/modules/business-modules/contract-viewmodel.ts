/** 整理合同台账的展示字段和排序切换，不依赖 React 或请求。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import {
  contractColumns, contractStatuses, contractTypes, type ContractRecord, type ContractSort,
} from './contract-model.ts'

/** 把后台合同类型转换为本地文案，未知取值原样展示。 */
export function contractTypeLabel(t: WorkbenchT, value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const type = contractTypes.find(item => item === value)
  return type === undefined ? value : t(`contract.type.${type}`)
}

/** 把后台合同状态转换为本地文案，未知取值原样展示。 */
export function contractStatusLabel(t: WorkbenchT, value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const status = contractStatuses.find(item => item === value)
  return status === undefined ? value : t(`contract.status.${status}`)
}

/** 按人民币展示合同金额，非数值返回空值以显示占位符。 */
export function contractAmount(value: string | number | undefined): string | undefined {
  const amount = typeof value === 'number' ? value : value === undefined || value.trim() === '' ? NaN : Number(value)
  if (!Number.isFinite(amount)) return undefined
  return `¥${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 转换类型、状态、金额与项目名称，业务日期保持后台原值。 */
export function contractCells(record: ContractRecord, t: WorkbenchT): Readonly<Record<string, string | number | undefined>> {
  const values = record.values
  return {
    ...values,
    contract_type: contractTypeLabel(t, values.contract_type),
    project_name: values.project_name ?? values.project_code,
    total_amount: contractAmount(values.total_amount),
    tax_amount: contractAmount(values.tax_amount),
    owed_amount: contractAmount(values.owed_amount),
    warranty_amount: contractAmount(values.warranty_amount),
    status: contractStatusLabel(t, values.status),
  }
}

/** 切换后端白名单中的排序项，同一表头按升序、降序切换。 */
export function nextContractSort(current: ContractSort | undefined, key: string): ContractSort | undefined {
  const column = contractColumns.find(column => column.key === key)
  if (column === undefined) return current
  return { key: column.key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' }
}

/** 单个统计分组：取值为空时 key 为空字符串，界面按未填写展示。 */
export interface ContractStatBucket {
  readonly key: string
  readonly count: number
}

/** 合同页面顶部的统计结果，来自全量合同聚合。 */
export interface ContractStats {
  readonly total: number
  readonly active: number
  readonly expiringSoon: number
  readonly expired: number
  readonly totalAmount: number
  readonly owedAmount: number
  readonly types: readonly ContractStatBucket[]
  readonly statuses: readonly ContractStatBucket[]
  readonly truncated: boolean
}

const beijingDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** 合同到期判断只用日期部分，带时间戳时取前 10 位。 */
function datePart(value: string | number | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^\d{4}-\d{2}-\d{2}/u.exec(value)
  return match?.[0]
}

/** 在日期字符串上加减天数，非日期原样返回。 */
function shiftDate(value: string, days: number): string {
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed)) return value
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10)
}

/** 汇总金额，非数值按零处理。 */
function amount(value: string | number | undefined): number {
  const parsed = typeof value === 'number' ? value : value === undefined || value.trim() === '' ? NaN : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function countBy(records: readonly ContractRecord[], key: 'contract_type' | 'status'): readonly ContractStatBucket[] {
  const counts = new Map<string, number>()
  for (const record of records) {
    const value = record.values[key]
    const bucket = typeof value === 'string' ? value : ''
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }
  return [...counts].map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

/**
 * 汇总合同总数、状态指标、金额与类型/状态分布。
 * @param records 已加载的全量合同。
 * @param total 后台返回的合同总数。
 * @param truncated 是否因读取上限未取全量。
 * @param today 今天日期（北京时间，YYYY-MM-DD），默认取当前时刻。
 * @returns 页面统计结果。
 */
export function contractStats(
  records: readonly ContractRecord[],
  total: number,
  truncated: boolean,
  today: string = beijingDate.format(new Date()),
): ContractStats {
  const horizon = shiftDate(today, 30)
  let active = 0
  let expiringSoon = 0
  let expired = 0
  let totalAmount = 0
  let owedAmount = 0
  for (const record of records) {
    if (record.values.status === 'active') active += 1
    const expiry = datePart(record.values.expiry_date)
    if (expiry !== undefined) {
      if (expiry < today) expired += 1
      else if (expiry <= horizon) expiringSoon += 1
    }
    totalAmount += amount(record.values.total_amount)
    owedAmount += amount(record.values.owed_amount)
  }
  return {
    total,
    active,
    expiringSoon,
    expired,
    totalAmount,
    owedAmount,
    types: countBy(records, 'contract_type'),
    statuses: countBy(records, 'status'),
    truncated,
  }
}
