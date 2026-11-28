/** 整理项目合同卡片的显示字段，不发请求，不计算未经定义的财务口径。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ContractProjectRecord } from './contract-project-model.ts'
import { contractAmount, contractPercent, contractStatusLabel, sumContractAmount } from './contract-viewmodel.ts'

/** 卡片中的完整值同时用于显示和悬停提示。 */
export interface ProjectCardField {
  readonly label: string
  readonly value: string
}

/** 组织卡片的摘要、金融指标和补充信息；未知字段显示占位符。 */
export function contractProjectCard(record: ContractProjectRecord, t: WorkbenchT) {
  const values = record.values, finance = record.finance
  const money = (value: string | number | undefined) => contractAmount(value) ?? '—'
  const text = (value: string | number | undefined) => value === undefined || value === '' ? '—' : String(value)
  const entry = (label: string, value: string): ProjectCardField => ({ label, value })
  const type = String(values.project_type ?? '')
  const projectType = ['engineering', 'rd', 'contract', 'operation', 'preresearch', 'maintenance', 'new_build', 'retrofit']
    .includes(type) ? t(`project.intake.${type}` as Parameters<WorkbenchT>[0]) : text(values.project_type)
  return {
    title: text(values.name ?? record.code), code: record.code,
    status: contractStatusLabel(t, values.status) ?? '—',
    overview: [
      entry(t('contract.projectCustomer'), text(values.customer_name)),
      entry(t('contract.projectManager'), text(values.manager_name)),
      entry(t('contract.projectStart'), text(values.start_date)),
      entry(t('contract.projectEnd'), text(values.end_date)),
      entry(t('contract.projectProgress'), contractPercent(Number.isFinite(Number(values.progress_percent))
        && values.progress_percent !== undefined && values.progress_percent !== '' ? Number(values.progress_percent) : undefined) ?? '—'),
    ],
    metrics: [
      entry(t('contract.projectAmount'), money(values.contract_amount)),
      entry(t('contract.statsTotal'), String(record.contracts.length)),
      entry(t('contract.statsTotalAmount'), money(sumContractAmount(record.contracts, 'total_amount'))),
      entry(t('contract.statsTaxAmount'), money(sumContractAmount(record.contracts, 'tax_amount'))),
      entry(t('contract.warranty_amount'), money(sumContractAmount(record.contracts, 'warranty_amount'))),
      entry(t('contract.projectBudget'), money(finance.budget_amount ?? values.budget_amount)),
      entry(t('contract.projectActualCost'), money(finance.actual_cost)),
      entry(t('contract.grossMargin'), money(finance.gross_margin)),
      entry(t('contract.grossMarginRate'), contractPercent(finance.gross_margin_rate) ?? '—'),
    ],
    details: [
      entry(t('project.intake.type'), projectType),
      entry(t('contract.projectStage'), text(values.stage)),
      entry(t('contract.projectRisk'), text(values.risk_level)),
      entry(t('project.intake.priority'), text(values.priority)),
      entry(t('contract.projectForecast'), money(finance.forecast_total)),
      entry(t('contract.projectCommitted'), money(finance.committed_total)),
      entry(t('contract.projectInvoiced'), money(finance.invoiced_total)),
      entry(t('contract.projectPaid'), money(finance.paid_total)),
      entry(t('contract.projectPending'), money(finance.pending_payment)),
      entry(t('contract.projectSettledPaid'), money(finance.settled_paid)),
      entry(t('contract.projectSettledUnpaid'), money(finance.settled_unpaid)),
      entry(t('contract.projectLaborCost'), money(finance.labor_cost)),
      entry(t('contract.projectLaborHours'), text(finance.labor_hours)),
    ],
  }
}
