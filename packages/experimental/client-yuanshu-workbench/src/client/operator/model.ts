/**
 * 运营者工作台的领域类型定义。
 *
 * 本模块刻意不依赖 React，也不包含任何数据获取代码。
 * 它是数据层（`source.ts`）、视图模型层（`viewmodel.ts`）与展示层（`components/`）
 * 之间的共享词汇表。
 */
import type { operatorEn } from './operator-locales.ts'

/** 运营者工作台自有的文案 key；拼错会在编译期报错。 */
export type OperatorLocaleKey = keyof typeof operatorEn

/**
 * 展示字段的可用性档位。
 *
 * - `ready`          A 档：投影端点及其字段均存在。
 *                    若值缺失，在抓到线上样本前显示标注为
 *                    "接口就绪 · 待抓样" 的占位符。
 * - `schema-pending` B 档：接口路径存在但响应未定义类型，值始终为占位符。
 *                    （对应状态标签「字段待定」。）
 * - `not-connected`  C 档：完全没有接口可以提供该值（标签「待接入」）。
 */
export type Availability = 'ready' | 'schema-pending' | 'not-connected'

/** 异常与决策队列的严重度（决定颜色语义）。 */
export type Severity = 'overdue' | 'pending' | 'none'

/**
 * 单个展示字段，值与其来源信息绑定在一起。
 * `value === undefined` 表示该字段必须渲染为占位符：
 * 由 `tier` 决定状态标签，由 `source` 标明数据来源。
 */
export interface Field<T> {
  readonly value: T | undefined
  readonly tier: Availability
  /** 来源标识：MCP 工具名、表名或接口路径。 */
  readonly source: string
}

/** 经营总览上的键值卡片。 */
export interface KpiCardModel {
  readonly id: string
  /** 指标名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly value: Field<string>
  /** 指标口径的文案 key；可能落到「口径定义待发布」文案。 */
  readonly definitionKey: OperatorLocaleKey
}

/** `workbench_briefing` 提供的四类异常计数之一。 */
export interface AnomalyQueueModel {
  readonly id: string
  /** 异常名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly count: Field<string>
}

/** 决策 / 异常队列中的一行。 */
export interface QueueItemModel {
  readonly id: string
  /** 队列分类的文案 key。 */
  readonly categoryKey: OperatorLocaleKey
  readonly title: Field<string>
  readonly meta: Field<string>
  readonly severity: Severity
  readonly source: string
}

/** 经营总览上的「今日决策」条目。 */
export interface DecisionItemModel {
  readonly id: string
  readonly title: Field<string>
  readonly impact: Field<string>
  readonly suggestion: Field<string>
  readonly source: string
}

/** 项目组合视图中的项目卡片。 */
export interface ProjectCardModel {
  readonly id: string
  readonly name: Field<string>
  readonly stage: Field<string>
  readonly progress: Field<string>
  readonly risk: Field<string>
}

/** 单项目 360 摘要中的一个明细面板。 */
export interface PanelModel {
  readonly id: string
  /** 面板名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly metrics: readonly Field<string>[]
}

/** 选中项目后展示的 360 摘要。 */
export interface ProjectDetailModel {
  readonly projectId: string
  readonly projectName: Field<string>
  readonly panels: readonly PanelModel[]
}

/** 职能专题账本（质量 / 供应 / 交付 / 财务）。 */
export interface LedgerModel {
  readonly id: string
  /** 账本名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly table: string
  /** 表头文案的 key 列表。 */
  readonly columnKeys: readonly OperatorLocaleKey[]
  readonly rows: readonly (readonly Field<string>[])[]
}

/** 决策 → 记录 → 文档 → 知识 证据链中的一个节点。 */
export interface EvidenceLinkModel {
  readonly id: string
  /** 链节名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly field: Field<string>
}

/** 经营总览（首屏）。 */
export interface OverviewModel {
  readonly kpis: readonly KpiCardModel[]
  readonly anomalies: readonly AnomalyQueueModel[]
  readonly decisions: readonly DecisionItemModel[]
  /** 固定数据健康提示的文案 key。 */
  readonly healthNoticeKey: OperatorLocaleKey
  readonly freshness: Field<string>
  readonly role: Field<string>
}

/** 决策抽屉中的治理操作（Action 适配前保持禁用）。 */
export interface DecisionActionModel {
  readonly id: string
  readonly labelKey: OperatorLocaleKey
  readonly disabled: boolean
  readonly noteKey: OperatorLocaleKey
}

/** 异常与决策中心：队列 + 详情抽屉。 */
export interface DecisionCenterModel {
  readonly filters: readonly { readonly id: string; readonly nameKey: OperatorLocaleKey; readonly count: Field<string> }[]
  readonly queue: readonly QueueItemModel[]
  readonly selected: QueueItemModel | undefined
  readonly detail: {
    readonly facts: readonly Field<string>[]
    readonly evidence: readonly Field<string>[]
    readonly suggestion: Field<string>
    readonly actions: readonly DecisionActionModel[]
  } | undefined
}

/** 项目穿透页。 */
export interface ProjectScreenModel {
  readonly cards: readonly ProjectCardModel[]
  readonly detail: ProjectDetailModel | undefined
}

/** 职能专题页。 */
export interface FunctionalScreenModel {
  readonly ledgers: readonly LedgerModel[]
}

/** 证据与追溯页。 */
export interface EvidenceScreenModel {
  readonly chain: readonly EvidenceLinkModel[]
}

/** 五屏数据汇总在一个不可变快照中。 */
export interface OperatorViewModel {
  readonly overview: OverviewModel
  readonly decisions: DecisionCenterModel
  readonly projects: ProjectScreenModel
  readonly functional: FunctionalScreenModel
  readonly evidence: EvidenceScreenModel
}

/** 外壳导航使用的稳定页面标识。 */
export type OperatorScreenId =
  | 'overview'
  | 'decisions'
  | 'projects'
  | 'functional'
  | 'evidence'

/** 由 briefing 驱动的异常计数的静态定义。 */
export interface RawAnomalySeed {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  /** 用于匹配 briefing 行的文本（与语言无关）。 */
  readonly match: string
}
