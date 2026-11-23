/**
 * 运营者工作台的视图模型层。
 *
 * 本模块用纯函数把校验后的原始投影组装成不可变的五屏视图模型，供展示层消费。
 * 它不依赖 React、不做数据请求、也没有副作用。
 * 所有占位符规则与来源标注（档位 + 来源）都集中在这里，
 * 因此 UI 可统一渲染字段，测试无需挂载组件即可断言规则。
 *
 *
 * 档位策略（与 operator-workbench-ui-spec.zh.md 一致）：
 *   A / `ready`          — 投影存在：有值展示真实值，无值显示
 *                          "接口就绪·待抓样" 占位符。
 *   B / `schema-pending` — 接口路径存在但响应未定义类型：始终显示
 *                          "字段待定" 占位符。
 *   C / `not-connected`  — 没有对应接口：始终显示 "待接入" 占位符。
 */

import type {
  Availability,
  DecisionCenterModel,
  DecisionItemModel,
  EvidenceScreenModel,
  Field,
  FunctionalScreenModel,
  KpiCardModel,
  OperatorViewModel,
  OverviewModel,
  PanelModel,
  ProjectCardModel,
  ProjectDetailModel,
  ProjectScreenModel,
  OperatorLocaleKey,
  QueueItemModel,
  RawAnomalySeed,
  Severity,
} from './model.ts'
import type { RawProjections, RawRow } from './source.ts'

/** 来源标识：集中为常量，避免与规格文档产生偏差。 */
const SOURCE = {
  briefing: 'workbench_briefing',
  decisions: 'workbench_decisions',
  home: 'workbench_home',
  profile: 'workbench_profile',
  records: 'workbench_records',
  ontology: 'ontology_context',
  contracts: 'fin_contracts',
  projectTasks: 'prj_project_tasks',
  inspections: 'qwh_quality_inspections',
  shipments: 'srv_shipments',
} as const

/** 构造一个带明确档位与来源的字段。 */
function field<T>(value: T | undefined, tier: Availability, source: string): Field<T> {
  return { value, tier, source }
}

/** A 档字段：有值展示真实值，否则显示「接口就绪·待抓样」。 */
function live<T>(value: T | undefined, source: string): Field<T> {
  return field(value, 'ready', source)
}

/** B 档字段：有路径无契约，始终显示「字段待定」。 */
function pending<T>(source: string): Field<T> {
  return field<T>(undefined, 'schema-pending', source)
}

/** C 档字段：完全没有接口，始终显示「待接入」。 */
function absent<T>(source: string): Field<T> {
  return field<T>(undefined, 'not-connected', source)
}

/** 取以 ` · ` 分隔的第一个明细片段；行内无值时返回 undefined。 */
function firstDetail(row: RawRow): string | undefined {
  const head = row.detail.split('·')[0]?.trim() ?? ''
  return head === '' ? undefined : head
}

/** 按标题中编码的语言无关 key 查找对应的 briefing 行。 */
function briefingValue(rows: readonly RawRow[] | undefined, key: string): string | undefined {
  if (rows === undefined) return undefined
  const match = rows.find(row => row.title === key || row.title.includes(key))
  return match === undefined ? undefined : firstDetail(match)
}

/** 保守处理计数字段：只透出确实存在的文本。 */
function countField(rows: readonly RawRow[] | undefined, key: string): Field<string> {
  return live(briefingValue(rows, key), SOURCE.briefing)
}

/** 四类固定的异常种子，顺序与规格文档一致。 */
const ANOMALIES: readonly RawAnomalySeed[] = [
  { id: 'overdue-decision', nameKey: 'operator.anomaly.overdueDecision', match: '逾期决策' },
  { id: 'delayed-purchase', nameKey: 'operator.anomaly.delayedPurchase', match: '延迟采购' },
  { id: 'inspection-backlog', nameKey: 'operator.anomaly.inspectionBacklog', match: '检验积压' },
  { id: 'open-quality', nameKey: 'operator.anomaly.openQuality', match: '质量异常' },
]

/** 公司级 KPI 卡片的静态定义。 */
interface KpiSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  readonly definitionKey: OperatorLocaleKey
  readonly source: string
}

/** 单项目 360 摘要面板的静态定义。 */
interface PanelSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly metrics: readonly OperatorLocaleKey[]
}

/** 职能专题账本的静态定义。 */
interface LedgerSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  readonly table: string
  readonly columns: readonly OperatorLocaleKey[]
  readonly rowCount: number
}

/** 本版本中四张公司级 KPI 卡片均为 C 档占位。 */
const KPIS: readonly KpiSpec[] = [
  { id: 'contract-total', nameKey: 'operator.kpi.contractTotal', definitionKey: 'operator.kpi.contractTotal.def', source: SOURCE.contracts },
  { id: 'task-on-time', nameKey: 'operator.kpi.taskOnTime', definitionKey: 'operator.kpi.taskOnTime.def', source: SOURCE.projectTasks },
  { id: 'inspection-first-pass', nameKey: 'operator.kpi.inspectionFirstPass', definitionKey: 'operator.kpi.inspectionFirstPass.def', source: SOURCE.inspections },
  { id: 'shipment-on-time', nameKey: 'operator.kpi.shipmentOnTime', definitionKey: 'operator.kpi.shipmentOnTime.def', source: SOURCE.shipments },
]

/** 单项目 360 摘要的六个固定明细面板，均为 B 档。 */
const PROJECT_PANELS: readonly PanelSpec[] = [
  { id: 'stage-tree', nameKey: 'operator.panel.stageTree', source: 'projects/{code}/stage-tree', metrics: ['operator.metric.currentStage', 'operator.metric.stageProgress'] },
  { id: 'gates', nameKey: 'operator.panel.gates', source: 'projects/{code}/gates', metrics: ['operator.metric.passedGates', 'operator.metric.openGates'] },
  { id: 'risks', nameKey: 'operator.panel.risks', source: 'projects/{code}/risks', metrics: ['operator.metric.openRisks', 'operator.metric.overdueRisks'] },
  { id: 'finance', nameKey: 'operator.panel.finance', source: 'projects/{code}/finance-summary', metrics: ['operator.metric.contractAmount', 'operator.metric.receivedAmount'] },
  { id: 'quality', nameKey: 'operator.panel.quality', source: 'projects/{code}/quality-exceptions', metrics: ['operator.metric.openExceptions', 'operator.metric.inspections'] },
  { id: 'next-action', nameKey: 'operator.panel.nextAction', source: 'projects/{code}/decision-queue', metrics: ['operator.metric.pendingDecisions'] },
]

/** 各职能账本的列名 key；所有单元格均为 B 档占位。 */
const LEDGER_SPECS: readonly LedgerSpec[] = [
  { id: 'quality', nameKey: 'operator.ledger.quality', table: SOURCE.inspections, columns: ['operator.col.date', 'operator.col.object', 'operator.col.result', 'operator.col.owner'], rowCount: 3 },
  { id: 'supply', nameKey: 'operator.ledger.supply', table: 'pur_purchase_orders', columns: ['operator.col.order', 'operator.col.supplier', 'operator.col.amount', 'operator.col.status'], rowCount: 3 },
  { id: 'delivery', nameKey: 'operator.ledger.delivery', table: SOURCE.shipments, columns: ['operator.col.project', 'operator.col.commitDate', 'operator.col.status'], rowCount: 3 },
  { id: 'finance', nameKey: 'operator.ledger.finance', table: SOURCE.contracts, columns: ['operator.col.contract', 'operator.col.amount', 'operator.col.status'], rowCount: 3 },
]

/** 证据链节点：全部依赖本体 / 记录能力的适配。 */
const EVIDENCE_NODES: readonly { readonly id: string; readonly nameKey: OperatorLocaleKey; readonly source: string }[] = [
  { id: 'decision', nameKey: 'operator.evidence.decision', source: SOURCE.decisions },
  { id: 'record', nameKey: 'operator.evidence.record', source: SOURCE.records },
  { id: 'document', nameKey: 'operator.evidence.document', source: 'controlled-documents' },
  { id: 'knowledge', nameKey: 'operator.evidence.knowledge', source: SOURCE.ontology },
]

/** 构造四张公司级 KPI 卡片（均为 C 档占位）。 */
function buildKpis(): readonly KpiCardModel[] {
  return KPIS.map(kpi => ({
    id: kpi.id,
    nameKey: kpi.nameKey,
    definitionKey: kpi.definitionKey,
    value: absent<string>(kpi.source),
  }))
}

/** 从 briefing 投影构造四类异常计数（A 档）。 */
function buildAnomalies(raw: RawProjections) {
  return ANOMALIES.map(seed => ({
    id: seed.id,
    nameKey: seed.nameKey,
    count: countField(raw.briefing, seed.match),
  }))
}

/** 把决策行映射为总览决策卡（标题为 A 档，影响与建议为 C 档）。 */
function buildDecisions(raw: RawProjections): readonly DecisionItemModel[] {
  return (raw.decisions ?? []).slice(0, 6).map((row, index) => {
    const title = row.title.trim() === '' ? undefined : row.title
    return {
      id: `decision-${index}-${title ?? 'placeholder'}`,
      title: live(title, SOURCE.decisions),
      impact: absent<string>('agent-synthesis'),
      suggestion: absent<string>('agent-synthesis'),
      source: SOURCE.decisions,
    }
  })
}

/** 构造异常与决策中心的队列行。 */
function buildQueue(raw: RawProjections): readonly QueueItemModel[] {
  const anomalyRows: QueueItemModel[] = ANOMALIES.flatMap((seed) => {
    const value = briefingValue(raw.briefing, seed.match)
    if (value === undefined) return []
    return [{
      id: `queue-${seed.id}`,
      categoryKey: seed.nameKey,
      title: live(`${seed.match} · ${value}`, SOURCE.briefing),
      meta: live(value, SOURCE.briefing),
      severity: (seed.id === 'overdue-decision' || seed.id === 'open-quality' ? 'overdue' : 'pending') satisfies Severity,
      source: SOURCE.briefing,
    }]
  })
  const decisionRows: QueueItemModel[] = (raw.decisions ?? []).slice(0, 8).map((row, index) => ({
    id: `queue-decision-${index}`,
    categoryKey: 'operator.anomaly.overdueDecision',
    title: live(row.title.trim() === '' ? undefined : row.title, SOURCE.decisions),
    meta: live(firstDetail(row), SOURCE.decisions),
    severity: 'pending' satisfies Severity,
    source: SOURCE.decisions,
  }))
  return [...anomalyRows, ...decisionRows]
}

/** 为选中的队列项构造详情抽屉（纯函数）。 */
function buildDecisionDetail(selected: QueueItemModel | undefined): DecisionCenterModel['detail'] {
  if (selected === undefined) return undefined
  return {
    facts: [
      live(selected.title.value, selected.source),
      pending<string>(selected.source),
    ],
    evidence: [
      absent<string>(SOURCE.records),
      absent<string>(SOURCE.ontology),
    ],
    suggestion: absent<string>('agent-synthesis'),
    actions: [
      { id: 'approve', labelKey: 'operator.action.approve', disabled: true, noteKey: 'operator.action.governancePending' },
      { id: 'reject', labelKey: 'operator.action.reject', disabled: true, noteKey: 'operator.action.governancePending' },
      { id: 'delegate', labelKey: 'operator.action.delegate', disabled: true, noteKey: 'operator.action.governancePending' },
    ],
  }
}

/** 构造异常与决策中心，包括（禁用的）详情抽屉。 */
function buildDecisionCenter(raw: RawProjections, queue: readonly QueueItemModel[]): DecisionCenterModel {
  const anomalyCounts = buildAnomalies(raw)
  const filters: DecisionCenterModel['filters'] = [
    { id: 'all', nameKey: 'operator.filter.all', count: live<string>(undefined, SOURCE.briefing) },
    ...anomalyCounts.map(a => ({ id: a.id, nameKey: a.nameKey, count: a.count })),
  ]
  const selected = queue[0]
  return { filters, queue, selected, detail: buildDecisionDetail(selected) }
}

/**
 * 选中队列项并派生对应的详情抽屉（纯函数）。
 * @param model - 决策中心视图模型。
 * @param id - 要选中的条目 id；undefined 表示沿用默认选中项。
 * @returns 带选中项及其详情的新模型。
 */
export function selectDecisionItem(model: DecisionCenterModel, id: string | undefined): DecisionCenterModel {
  // 未显式选择时，沿用模型默认的（第一项）详情。
  if (id === undefined) return model
  const selected = model.queue.find(item => item.id === id) ?? model.queue[0]
  return { ...model, selected, detail: buildDecisionDetail(selected) }
}

/** 构造项目卡片：名称为 A 档，进度 / 风险为 B 档。 */
function buildProjectCards(raw: RawProjections): readonly ProjectCardModel[] {
  const projects = raw.projects ?? []
  if (projects.length === 0) return []
  return projects.slice(0, 12).map((row, index) => {
    const name = row.title.trim() === '' ? undefined : row.title
    return {
      id: `project-${index}-${name ?? 'placeholder'}`,
      name: live(name, SOURCE.home),
      stage: pending<string>('projects/{code}/stage-tree'),
      progress: pending<string>('projects/{code}'),
      risk: pending<string>('projects/{code}/risks'),
    }
  })
}

/** 构造单项目 360 摘要（所有面板均为 B 档）。 */
function buildProjectDetail(card: ProjectCardModel | undefined): ProjectDetailModel | undefined {
  if (card === undefined) return undefined
  const panels: PanelModel[] = PROJECT_PANELS.map(panel => ({
    id: panel.id,
    nameKey: panel.nameKey,
    source: panel.source,
    metrics: panel.metrics.map(() => pending<string>(panel.source)),
  }))
  // 指标标签由 `metricKeysForPanel` 提供文案 key；视图模型只携带
  // 字段值 / 档位 / 来源，不引入框架特定的文案类型。
  return { projectId: card.id, projectName: card.name, panels }
}

/** 构造职能专题账本（所有单元格均为 B 档占位）。 */
function buildFunctional(): FunctionalScreenModel {
  const ledgers = LEDGER_SPECS.map(spec => ({
    id: spec.id,
    nameKey: spec.nameKey,
    table: spec.table,
    columnKeys: spec.columns,
    rows: Array.from({ length: spec.rowCount }, () =>
      spec.columns.map(() => pending<string>(spec.table))),
  }))
  return { ledgers }
}

/** 构造证据链（均为 C 档）。 */
function buildEvidence(): EvidenceScreenModel {
  return {
    chain: EVIDENCE_NODES.map(node => ({
      id: node.id,
      nameKey: node.nameKey,
      source: node.source,
      field: absent<string>(node.source),
    })),
  }
}

/** 从原始投影快照组装完整的五屏视图模型。 */
export function buildOperatorViewModel(raw: RawProjections): OperatorViewModel {
  const anomalies = buildAnomalies(raw)
  const decisions = buildDecisions(raw)
  const queue = buildQueue(raw)
  const cards = buildProjectCards(raw)

  const overview: OverviewModel = {
    kpis: buildKpis(),
    anomalies,
    decisions,
    healthNoticeKey: 'operator.healthNotice',
    freshness: live(
      raw.fetchedAt === undefined ? undefined : new Date(raw.fetchedAt).toLocaleString(),
      SOURCE.briefing,
    ),
    role: live<string>(undefined, SOURCE.profile),
  }

  return {
    overview,
    decisions: buildDecisionCenter(raw, queue),
    projects: {
      cards,
      detail: buildProjectDetail(cards[0]),
    } satisfies ProjectScreenModel,
    functional: buildFunctional(),
    evidence: buildEvidence(),
  }
}

/**
 * 选中项目卡片并派生其 360 摘要（纯函数）。
 * @param model - 项目穿透页视图模型。
 * @param id - 要选中的卡片 id；undefined 表示沿用默认选中项。
 * @returns 带所选项目详情的新模型。
 */
export function selectProjectCard(model: ProjectScreenModel, id: string | undefined): ProjectScreenModel {
  // 未显式选择时，沿用模型默认的详情。
  if (id === undefined) return model
  const card = model.cards.find(item => item.id === id)
  return { ...model, detail: buildProjectDetail(card) }
}

/**
 * 项目面板中各指标的文案 key，顺序与 `PanelModel.metrics` 一致。
 * 单独导出是为了让展示层翻译指标标签时，
 * 视图模型无需携带框架特定的文案类型。
 */
export function metricKeysForPanel(panelId: string): readonly OperatorLocaleKey[] {
  return PROJECT_PANELS.find(panel => panel.id === panelId)?.metrics ?? []
}
