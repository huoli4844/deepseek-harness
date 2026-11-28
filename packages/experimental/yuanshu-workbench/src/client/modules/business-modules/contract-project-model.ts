/** 项目合同卡片字段：仅列出项目及财务接口已核实的字段，不依赖网络或界面。 */
import type { ContractRecord } from './contract-model.ts'

/** 云端项目列表提供的展示字段。 */
export const contractProjectFields = [
  'code', 'name', 'customer_name', 'manager_name', 'project_type', 'stage', 'status', 'priority',
  'risk_level', 'start_date', 'end_date', 'budget_amount', 'contract_amount', 'progress_percent',
] as const

/** 云端项目财务汇总提供的金额、工时和百分比字段。 */
export const contractFinanceFields = [
  'actual_cost', 'budget_amount', 'budget_total', 'committed_total', 'contract_amount', 'contract_total',
  'forecast_total', 'gross_margin', 'gross_margin_rate', 'invoiced_total', 'labor_cost', 'labor_hours',
  'paid_total', 'pending_payment', 'settled_invoiced', 'settled_paid', 'settled_payable', 'settled_unpaid',
] as const

/** 项目卡片保留已授权的项目、合同和财务字段；缺失值不补零。 */
export interface ContractProjectRecord {
  readonly code: string
  readonly values: Readonly<Partial<Record<typeof contractProjectFields[number], string | number>>>
  readonly finance: Readonly<Partial<Record<typeof contractFinanceFields[number], number>>>
  readonly contracts: readonly ContractRecord[]
}

/** 顶部毛利指标来自所有可见项目的财务汇总，毛利率使用收入加权。 */
export interface ContractFinanceTotals {
  readonly grossMargin?: number
  readonly grossMarginRate?: number
}

/** 合同页面的两种展示模式。 */
export type ContractView = 'cards' | 'list'
