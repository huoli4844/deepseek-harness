/** 业务流程静态模板：节点结构与文案键，不依赖 React 与网络；采购、质量、行政、物资、财务、研发、供应商与人力资源模板共用。 */
import type { WorkbenchKey } from '../../core/locales/locales.ts'

/** 节点图标的呈现键，组件层映射到具体图标组件。 */
export type ChainIcon =
  | 'inquiry' | 'compare' | 'order' | 'arrival' | 'inspection' | 'stock' | 'ledger' | 'inbound'
  | 'plan' | 'process' | 'nonconform' | 'qarchive' | 'car' | 'report'

/** 单个流程节点卡片：序号、图标与三段文案键。 */
export interface ChainNode {
  /** 两位序号，用于卡片左上角与排序。 */
  readonly step: string
  readonly icon: ChainIcon
  readonly title: WorkbenchKey
  /** 卡片蓝色小字：单据类型名（静态模板不含计数）。 */
  readonly doc: WorkbenchKey
  readonly description: WorkbenchKey
}

/** 模板中的一行链路：首行为主链路，后续行带分组标题；条件分支行用橙色主题。 */
export interface FlowRow {
  /** 行标题文案键；缺省表示主链路首行。 */
  readonly label?: WorkbenchKey
  readonly nodes: readonly ChainNode[]
  /** 条件分支行：卡片带橙色主题标记。 */
  readonly branch?: boolean
}

/** 一张业务流程模板：标题、副标题与若干行链路节点。 */
export interface FlowTemplate {
  readonly title: WorkbenchKey
  readonly subtitle: WorkbenchKey
  readonly rows: readonly FlowRow[]
}

/** 采购业务链路：从需求提出到库存台账的建议顺序。 */
export const PROCUREMENT_TEMPLATE: FlowTemplate = {
  title: 'procurementChain.title',
  subtitle: 'procurementChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'inquiry', title: 'procurementChain.node.inquiry.title', doc: 'procurementChain.node.inquiry.doc', description: 'procurementChain.node.inquiry.description' },
        { step: '02', icon: 'compare', title: 'procurementChain.node.compare.title', doc: 'procurementChain.node.compare.doc', description: 'procurementChain.node.compare.description' },
        { step: '03', icon: 'order', title: 'procurementChain.node.order.title', doc: 'procurementChain.node.order.doc', description: 'procurementChain.node.order.description' },
        { step: '04', icon: 'arrival', title: 'procurementChain.node.arrival.title', doc: 'procurementChain.node.arrival.doc', description: 'procurementChain.node.arrival.description' },
        { step: '05', icon: 'inspection', title: 'procurementChain.node.inspection.title', doc: 'procurementChain.node.inspection.doc', description: 'procurementChain.node.inspection.description' },
        { step: '06', icon: 'stock', title: 'procurementChain.node.stock.title', doc: 'procurementChain.node.stock.doc', description: 'procurementChain.node.stock.description' },
      ],
    },
    {
      label: 'procurementChain.branchLabel',
      branch: true,
      nodes: [
        { step: '01', icon: 'ledger', title: 'procurementChain.node.ledger.title', doc: 'procurementChain.node.ledger.doc', description: 'procurementChain.node.ledger.description' },
        { step: '02', icon: 'inbound', title: 'procurementChain.node.inbound.title', doc: 'procurementChain.node.inbound.doc', description: 'procurementChain.node.inbound.description' },
      ],
    },
  ],
}

/** 质量业务链路：从检验计划到质量档案的建议顺序。 */
export const QUALITY_TEMPLATE: FlowTemplate = {
  title: 'qualityChain.title',
  subtitle: 'qualityChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'plan', title: 'qualityChain.node.plan.title', doc: 'qualityChain.node.plan.doc', description: 'qualityChain.node.plan.description' },
        { step: '02', icon: 'inspection', title: 'qualityChain.node.incoming.title', doc: 'qualityChain.node.incoming.doc', description: 'qualityChain.node.incoming.description' },
        { step: '03', icon: 'process', title: 'qualityChain.node.process.title', doc: 'qualityChain.node.process.doc', description: 'qualityChain.node.process.description' },
        { step: '04', icon: 'inspection', title: 'qualityChain.node.final.title', doc: 'qualityChain.node.final.doc', description: 'qualityChain.node.final.description' },
        { step: '05', icon: 'nonconform', title: 'qualityChain.node.nonconform.title', doc: 'qualityChain.node.nonconform.doc', description: 'qualityChain.node.nonconform.description' },
        { step: '06', icon: 'qarchive', title: 'qualityChain.node.qarchive.title', doc: 'qualityChain.node.qarchive.doc', description: 'qualityChain.node.qarchive.description' },
      ],
    },
    {
      label: 'procurementChain.branchLabel',
      branch: true,
      nodes: [
        { step: '01', icon: 'report', title: 'qualityChain.node.report.title', doc: 'qualityChain.node.report.doc', description: 'qualityChain.node.report.description' },
      ],
    },
  ],
}

/** 物资业务链路：入库登记、上架、出库与齐套管理的建议顺序。 */
export const MATERIALS_TEMPLATE: FlowTemplate = {
  title: 'materialsChain.title',
  subtitle: 'materialsChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'inbound', title: 'materialsChain.node.inbound.title', doc: 'materialsChain.node.inbound.doc', description: 'materialsChain.node.inbound.description' },
        { step: '02', icon: 'process', title: 'materialsChain.node.inboundDetail.title', doc: 'materialsChain.node.inboundDetail.doc', description: 'materialsChain.node.inboundDetail.description' },
        { step: '03', icon: 'plan', title: 'materialsChain.node.racking.title', doc: 'materialsChain.node.racking.doc', description: 'materialsChain.node.racking.description' },
        { step: '04', icon: 'stock', title: 'materialsChain.node.stock.title', doc: 'materialsChain.node.stock.doc', description: 'materialsChain.node.stock.description' },
        { step: '05', icon: 'order', title: 'materialsChain.node.picking.title', doc: 'materialsChain.node.picking.doc', description: 'materialsChain.node.picking.description' },
        { step: '06', icon: 'report', title: 'materialsChain.node.outbound.title', doc: 'materialsChain.node.outbound.doc', description: 'materialsChain.node.outbound.description' },
      ],
    },
    {
      label: 'materialsChain.row.inbound',
      nodes: [
        { step: '01', icon: 'inquiry', title: 'materialsChain.node.source.title', doc: 'materialsChain.node.source.doc', description: 'materialsChain.node.source.description' },
        { step: '02', icon: 'process', title: 'materialsChain.node.inboundLine.title', doc: 'materialsChain.node.inboundLine.doc', description: 'materialsChain.node.inboundLine.description' },
        { step: '03', icon: 'plan', title: 'materialsChain.node.rackingTask.title', doc: 'materialsChain.node.rackingTask.doc', description: 'materialsChain.node.rackingTask.description' },
      ],
    },
    {
      label: 'materialsChain.row.outbound',
      nodes: [
        { step: '01', icon: 'report', title: 'materialsChain.node.outboundSheet.title', doc: 'materialsChain.node.outboundSheet.doc', description: 'materialsChain.node.outboundSheet.description' },
        { step: '02', icon: 'process', title: 'materialsChain.node.outboundLine.title', doc: 'materialsChain.node.outboundLine.doc', description: 'materialsChain.node.outboundLine.description' },
        { step: '03', icon: 'order', title: 'materialsChain.node.pickTask.title', doc: 'materialsChain.node.pickTask.doc', description: 'materialsChain.node.pickTask.description' },
      ],
    },
    {
      label: 'materialsChain.row.kit',
      nodes: [
        { step: '01', icon: 'inspection', title: 'materialsChain.node.kitList.title', doc: 'materialsChain.node.kitList.doc', description: 'materialsChain.node.kitList.description' },
        { step: '02', icon: 'process', title: 'materialsChain.node.kitDetail.title', doc: 'materialsChain.node.kitDetail.doc', description: 'materialsChain.node.kitDetail.description' },
      ],
    },
  ],
}

/** 员工全生命周期链路：从招聘入职到月度绩效与薪酬的建议顺序（截图截断，按可见 18 节点构建）。 */
export const HR_TEMPLATE: FlowTemplate = {
  title: 'hrChain.title',
  subtitle: 'hrChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'inquiry', title: 'hrChain.node.candidate.title', doc: 'hrChain.node.candidate.doc', description: 'hrChain.node.candidate.description' },
        { step: '02', icon: 'report', title: 'hrChain.node.hire.title', doc: 'hrChain.node.hire.doc', description: 'hrChain.node.hire.description' },
        { step: '03', icon: 'plan', title: 'hrChain.node.onboarding.title', doc: 'hrChain.node.onboarding.doc', description: 'hrChain.node.onboarding.description' },
        { step: '04', icon: 'ledger', title: 'hrChain.node.lifecycle.title', doc: 'hrChain.node.lifecycle.doc', description: 'hrChain.node.lifecycle.description' },
        { step: '05', icon: 'order', title: 'hrChain.node.contract.title', doc: 'hrChain.node.contract.doc', description: 'hrChain.node.contract.description' },
        { step: '06', icon: 'inspection', title: 'hrChain.node.probation.title', doc: 'hrChain.node.probation.doc', description: 'hrChain.node.probation.description' },
      ],
    },
    {
      label: 'hrChain.row.prep',
      nodes: [
        { step: '01', icon: 'plan', title: 'hrChain.node.cycle.title', doc: 'hrChain.node.cycle.doc', description: 'hrChain.node.cycle.description' },
        { step: '02', icon: 'report', title: 'hrChain.node.target.title', doc: 'hrChain.node.target.doc', description: 'hrChain.node.target.description' },
        { step: '03', icon: 'process', title: 'hrChain.node.scoreTask.title', doc: 'hrChain.node.scoreTask.doc', description: 'hrChain.node.scoreTask.description' },
      ],
    },
    {
      label: 'hrChain.row.scoring',
      nodes: [
        { step: '01', icon: 'car', title: 'hrChain.node.scoring.title', doc: 'hrChain.node.scoring.doc', description: 'hrChain.node.scoring.description' },
        { step: '02', icon: 'compare', title: 'hrChain.node.dimension.title', doc: 'hrChain.node.dimension.doc', description: 'hrChain.node.dimension.description' },
        { step: '03', icon: 'stock', title: 'hrChain.node.result.title', doc: 'hrChain.node.result.doc', description: 'hrChain.node.result.description' },
      ],
    },
    {
      label: 'hrChain.row.improve',
      nodes: [
        { step: '01', icon: 'report', title: 'hrChain.node.improvePlan.title', doc: 'hrChain.node.improvePlan.doc', description: 'hrChain.node.improvePlan.description' },
        { step: '02', icon: 'plan', title: 'hrChain.node.improveTask.title', doc: 'hrChain.node.improveTask.doc', description: 'hrChain.node.improveTask.description' },
        { step: '03', icon: 'car', title: 'hrChain.node.clawback.title', doc: 'hrChain.node.clawback.doc', description: 'hrChain.node.clawback.description' },
      ],
    },
    {
      label: 'hrChain.row.payroll',
      nodes: [
        { step: '01', icon: 'ledger', title: 'hrChain.node.payrollBatch.title', doc: 'hrChain.node.payrollBatch.doc', description: 'hrChain.node.payrollBatch.description' },
        { step: '02', icon: 'process', title: 'hrChain.node.payrollDetail.title', doc: 'hrChain.node.payrollDetail.doc', description: 'hrChain.node.payrollDetail.description' },
        { step: '03', icon: 'order', title: 'hrChain.node.salaryItem.title', doc: 'hrChain.node.salaryItem.doc', description: 'hrChain.node.salaryItem.description' },
      ],
    },
  ],
}

/** 供应商与主数据管理链路：从供应商建档准入到基础档案与计量质量基础的建议顺序。 */
export const SUPPLIER_TEMPLATE: FlowTemplate = {
  title: 'supplierChain.title',
  subtitle: 'supplierChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'ledger', title: 'supplierChain.node.archive.title', doc: 'supplierChain.node.archive.doc', description: 'supplierChain.node.archive.description' },
        { step: '02', icon: 'inspection', title: 'supplierChain.node.admission.title', doc: 'supplierChain.node.admission.doc', description: 'supplierChain.node.admission.description' },
        { step: '03', icon: 'stock', title: 'supplierChain.node.supplyItems.title', doc: 'supplierChain.node.supplyItems.doc', description: 'supplierChain.node.supplyItems.description' },
        { step: '04', icon: 'compare', title: 'supplierChain.node.performance.title', doc: 'supplierChain.node.performance.doc', description: 'supplierChain.node.performance.description' },
      ],
    },
    {
      label: 'supplierChain.row.master',
      nodes: [
        { step: '01', icon: 'inquiry', title: 'supplierChain.node.customer.title', doc: 'supplierChain.node.customer.doc', description: 'supplierChain.node.customer.description' },
        { step: '02', icon: 'plan', title: 'supplierChain.node.material.title', doc: 'supplierChain.node.material.doc', description: 'supplierChain.node.material.description' },
      ],
    },
    {
      label: 'supplierChain.row.metrology',
      nodes: [
        { step: '01', icon: 'order', title: 'supplierChain.node.unit.title', doc: 'supplierChain.node.unit.doc', description: 'supplierChain.node.unit.description' },
        { step: '02', icon: 'car', title: 'supplierChain.node.conversion.title', doc: 'supplierChain.node.conversion.doc', description: 'supplierChain.node.conversion.description' },
        { step: '03', icon: 'nonconform', title: 'supplierChain.node.defectCode.title', doc: 'supplierChain.node.defectCode.doc', description: 'supplierChain.node.defectCode.description' },
      ],
    },
  ],
}

/** 研发业务链路：从需求基线到验证证据、工程变更与 BOM 生效的建议顺序。 */
export const DEV_TEMPLATE: FlowTemplate = {
  title: 'devChain.title',
  subtitle: 'devChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'inquiry', title: 'devChain.node.requirement.title', doc: 'devChain.node.requirement.doc', description: 'devChain.node.requirement.description' },
        { step: '02', icon: 'plan', title: 'devChain.node.techSpec.title', doc: 'devChain.node.techSpec.doc', description: 'devChain.node.techSpec.description' },
        { step: '03', icon: 'compare', title: 'devChain.node.designReview.title', doc: 'devChain.node.designReview.doc', description: 'devChain.node.designReview.description' },
        { step: '04', icon: 'stock', title: 'devChain.node.bom.title', doc: 'devChain.node.bom.doc', description: 'devChain.node.bom.description' },
        { step: '05', icon: 'process', title: 'devChain.node.routing.title', doc: 'devChain.node.routing.doc', description: 'devChain.node.routing.description' },
        { step: '06', icon: 'inspection', title: 'devChain.node.testVerify.title', doc: 'devChain.node.testVerify.doc', description: 'devChain.node.testVerify.description' },
      ],
    },
    {
      label: 'devChain.row.ecn',
      nodes: [
        { step: '01', icon: 'car', title: 'devChain.node.change.title', doc: 'devChain.node.change.doc', description: 'devChain.node.change.description' },
        { step: '02', icon: 'compare', title: 'devChain.node.impactReview.title', doc: 'devChain.node.impactReview.doc', description: 'devChain.node.impactReview.description' },
        { step: '03', icon: 'inspection', title: 'devChain.node.changeVerify.title', doc: 'devChain.node.changeVerify.doc', description: 'devChain.node.changeVerify.description' },
      ],
    },
    {
      label: 'devChain.row.bomAlt',
      nodes: [
        { step: '01', icon: 'plan', title: 'devChain.node.substitute.title', doc: 'devChain.node.substitute.doc', description: 'devChain.node.substitute.description' },
        { step: '02', icon: 'order', title: 'devChain.node.bomEffect.title', doc: 'devChain.node.bomEffect.doc', description: 'devChain.node.bomEffect.description' },
      ],
    },
  ],
}

/** 财务业务链路：从合同、预算、成本到回款与发票的建议顺序，末行为条件分支。 */
export const FINANCE_TEMPLATE: FlowTemplate = {
  title: 'financeChain.title',
  subtitle: 'financeChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'report', title: 'financeChain.node.contract.title', doc: 'financeChain.node.contract.doc', description: 'financeChain.node.contract.description' },
        { step: '02', icon: 'plan', title: 'financeChain.node.budget.title', doc: 'financeChain.node.budget.doc', description: 'financeChain.node.budget.description' },
        { step: '03', icon: 'car', title: 'financeChain.node.timesheet.title', doc: 'financeChain.node.timesheet.doc', description: 'financeChain.node.timesheet.description' },
        { step: '04', icon: 'stock', title: 'financeChain.node.cost.title', doc: 'financeChain.node.cost.doc', description: 'financeChain.node.cost.description' },
        { step: '05', icon: 'arrival', title: 'financeChain.node.payment.title', doc: 'financeChain.node.payment.doc', description: 'financeChain.node.payment.description' },
        { step: '06', icon: 'process', title: 'financeChain.node.invoice.title', doc: 'financeChain.node.invoice.doc', description: 'financeChain.node.invoice.description' },
      ],
    },
    {
      label: 'financeChain.row.receivable',
      nodes: [
        { step: '01', icon: 'plan', title: 'financeChain.node.receivablePlan.title', doc: 'financeChain.node.receivablePlan.doc', description: 'financeChain.node.receivablePlan.description' },
        { step: '02', icon: 'inbound', title: 'financeChain.node.receipt.title', doc: 'financeChain.node.receipt.doc', description: 'financeChain.node.receipt.description' },
        { step: '03', icon: 'compare', title: 'financeChain.node.writeOff.title', doc: 'financeChain.node.writeOff.doc', description: 'financeChain.node.writeOff.description' },
      ],
    },
    {
      label: 'financeChain.row.standard',
      nodes: [
        { step: '01', icon: 'stock', title: 'financeChain.node.standardCost.title', doc: 'financeChain.node.standardCost.doc', description: 'financeChain.node.standardCost.description' },
      ],
    },
    {
      label: 'procurementChain.branchLabel',
      branch: true,
      nodes: [
        { step: '01', icon: 'report', title: 'financeChain.node.invoicePass.title', doc: 'financeChain.node.invoicePass.doc', description: 'financeChain.node.invoicePass.description' },
      ],
    },
  ],
}

/** 行政业务链路：从采购申请到付款、归档、用品与固定资产的日常事务顺序。 */
export const ADMIN_TEMPLATE: FlowTemplate = {
  title: 'adminChain.title',
  subtitle: 'adminChain.subtitle',
  rows: [
    {
      nodes: [
        { step: '01', icon: 'inquiry', title: 'adminChain.node.requisition.title', doc: 'adminChain.node.requisition.doc', description: 'adminChain.node.requisition.description' },
        { step: '02', icon: 'plan', title: 'adminChain.node.plan.title', doc: 'adminChain.node.plan.doc', description: 'adminChain.node.plan.description' },
        { step: '03', icon: 'process', title: 'adminChain.node.planDetail.title', doc: 'adminChain.node.planDetail.doc', description: 'adminChain.node.planDetail.description' },
        { step: '04', icon: 'compare', title: 'adminChain.node.quote.title', doc: 'adminChain.node.quote.doc', description: 'adminChain.node.quote.description' },
        { step: '05', icon: 'order', title: 'adminChain.node.order.title', doc: 'adminChain.node.order.doc', description: 'adminChain.node.order.description' },
      ],
    },
    {
      label: 'adminChain.row.accept',
      nodes: [
        { step: '01', icon: 'report', title: 'adminChain.node.orderDetail.title', doc: 'adminChain.node.orderDetail.doc', description: 'adminChain.node.orderDetail.description' },
        { step: '02', icon: 'inspection', title: 'adminChain.node.accept.title', doc: 'adminChain.node.accept.doc', description: 'adminChain.node.accept.description' },
        { step: '03', icon: 'process', title: 'adminChain.node.acceptDetail.title', doc: 'adminChain.node.acceptDetail.doc', description: 'adminChain.node.acceptDetail.description' },
        { step: '04', icon: 'car', title: 'adminChain.node.payment.title', doc: 'adminChain.node.payment.doc', description: 'adminChain.node.payment.description' },
      ],
    },
    {
      label: 'adminChain.row.archive',
      nodes: [
        { step: '01', icon: 'ledger', title: 'adminChain.node.archive.title', doc: 'adminChain.node.archive.doc', description: 'adminChain.node.archive.description' },
        { step: '02', icon: 'inbound', title: 'adminChain.node.archiveDetail.title', doc: 'adminChain.node.archiveDetail.doc', description: 'adminChain.node.archiveDetail.description' },
      ],
    },
    {
      label: 'adminChain.row.supplies',
      nodes: [
        { step: '01', icon: 'stock', title: 'adminChain.node.supplyLedger.title', doc: 'adminChain.node.supplyLedger.doc', description: 'adminChain.node.supplyLedger.description' },
        { step: '02', icon: 'inquiry', title: 'adminChain.node.claim.title', doc: 'adminChain.node.claim.doc', description: 'adminChain.node.claim.description' },
        { step: '03', icon: 'process', title: 'adminChain.node.flow.title', doc: 'adminChain.node.flow.doc', description: 'adminChain.node.flow.description' },
        { step: '04', icon: 'plan', title: 'adminChain.node.check.title', doc: 'adminChain.node.check.doc', description: 'adminChain.node.check.description' },
        { step: '05', icon: 'report', title: 'adminChain.node.checkDetail.title', doc: 'adminChain.node.checkDetail.doc', description: 'adminChain.node.checkDetail.description' },
      ],
    },
    {
      label: 'adminChain.row.assets',
      nodes: [
        { step: '01', icon: 'ledger', title: 'adminChain.node.assetLedger.title', doc: 'adminChain.node.assetLedger.doc', description: 'adminChain.node.assetLedger.description' },
        { step: '02', icon: 'car', title: 'adminChain.node.borrow.title', doc: 'adminChain.node.borrow.doc', description: 'adminChain.node.borrow.description' },
        { step: '03', icon: 'nonconform', title: 'adminChain.node.scrap.title', doc: 'adminChain.node.scrap.doc', description: 'adminChain.node.scrap.description' },
        { step: '04', icon: 'qarchive', title: 'adminChain.node.history.title', doc: 'adminChain.node.history.doc', description: 'adminChain.node.history.description' },
      ],
    },
  ],
}
