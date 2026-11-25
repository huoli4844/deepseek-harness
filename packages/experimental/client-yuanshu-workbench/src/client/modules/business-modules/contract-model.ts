/** 合同台账的列定义、类型与状态枚举，不依赖界面或网络。 */

/** 合同列表展示并可排序的字段，顺序与后台排序白名单一致。 */
export const contractColumns = [
  { key: 'code', width: 170 }, { key: 'contract_type', width: 110 },
  { key: 'counterparty_name', width: 200 }, { key: 'project_name', width: 180 },
  { key: 'signed_date', width: 110 }, { key: 'effective_date', width: 110 }, { key: 'expiry_date', width: 110 },
  { key: 'total_amount', width: 130 }, { key: 'tax_amount', width: 120 },
  { key: 'owed_amount', width: 120 }, { key: 'warranty_amount', width: 120 },
  { key: 'status', width: 110 },
] as const

/** 可与后台排序参数对应的合同列。 */
export type ContractColumn = typeof contractColumns[number]['key']

/** 列表行需要保留的字段：表格列加上项目编号，供项目名称缺失时回退展示。 */
export const contractFields = [...contractColumns.map(column => column.key), 'project_code'] as const

/** 合同记录中用于展示的字段。 */
export type ContractField = typeof contractFields[number]

/** 列表行的稳定标识与后台单元格值。 */
export interface ContractRecord {
  readonly id: number
  readonly values: Readonly<Partial<Record<ContractField, string | number>>>
}

/** 来自后台的当前页、匹配总数与合同档案总数。 */
export interface ContractPage {
  readonly items: readonly ContractRecord[]
  readonly total: number
  readonly archiveTotal: number
  readonly pageSize: number
}

/** 已应用到后台检索的合同条件。 */
export interface ContractFilters {
  readonly keyword: string
}

/** 当前排序字段与方向。 */
export interface ContractSort {
  readonly key: ContractColumn
  readonly direction: 'asc' | 'desc'
}

/** 后台合同类型取值。 */
export const contractTypes = ['purchase', 'sales', 'service', 'engineering', 'outsourcing', 'lease', 'other'] as const

/** 后台合同状态取值。 */
export const contractStatuses = ['draft', 'active', 'completed', 'closed', 'terminated', 'void'] as const
