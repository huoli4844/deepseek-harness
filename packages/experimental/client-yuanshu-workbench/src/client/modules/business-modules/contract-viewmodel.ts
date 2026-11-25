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
