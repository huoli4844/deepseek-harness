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
export type Availability = 'ready' | 'schema-pending' | 'not-connected' | 'demo'

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

/** KPI 完成率的颜色档位：达标 / 接近达标 / 明显落后。 */
export type AttainmentTone = 'ok' | 'warn' | 'risk'

/** KPI 分组：经营数据（钱）/ 人力资源（人）/ 项目任务（任务）/ 质量总览（履约与达成率）。 */
export type KpiGroup = 'finance' | 'people' | 'task' | 'quality'

/** 经营总览上的键值卡片。 */
export interface KpiCardModel {
  readonly id: string
  /** 指标名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  /** 所属分组（决定卡片落在哪个分区）。 */
  readonly group: KpiGroup
  readonly value: Field<string>
  /** 目标值（全年目标按时间范围平均分配）；「当前进展 / 总览」档位无目标。 */
  readonly target?: Field<string>
  /** 完成率 = 当前值 / 目标值，如 '81%'；无目标的档位为 undefined。 */
  readonly attainment?: string
  /** 完成率的颜色档位（≥100% 绿、≥85% 琥珀、<85% 红）。 */
  readonly attainmentTone?: AttainmentTone
  /** 为 true 时点击卡片打开详情弹窗（人员总工时）。 */
  readonly interactive: boolean
}

/** `workbench_briefing` 提供的四类异常计数之一。 */
export interface AnomalyQueueModel {
  readonly id: string
  /** 异常名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly count: Field<string>
}

/** 风险与决策队列中的一行。 */
export interface QueueItemModel {
  readonly id: string
  /** 事项类别：风险事件 / 异常事件 / 决策。 */
  readonly kind: 'risk' | 'anomaly' | 'decision'
  /** 队列分类的文案 key。 */
  readonly categoryKey: OperatorLocaleKey
  readonly title: Field<string>
  readonly meta: Field<string>
  readonly severity: Severity
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

/** 穿透面板中的键值补充信息（如合同编号、签订时间、对接人、甲方信息）。 */
export interface PanelFieldModel {
  readonly label: string
  readonly value: string
}

/** 穿透面板中的业务事件行（如「2026-06-12 合同签订 · 双方用印完成」）。 */
export interface PanelEventModel {
  readonly time: string
  readonly title: string
  readonly detail: string
}

/** 穿透节点：时间线上的一个节点，status 决定颜色（完成绿 / 进行中蓝 / 待处理灰 / 风险红）。 */
export interface PanelNodeModel {
  readonly label: string
  readonly status: 'done' | 'active' | 'pending' | 'risk'
  readonly detail: string
}

/** 穿透面板中的可点击原件（如合同原件，点击后弹窗预览）。 */
export interface PanelLinkModel {
  readonly id: string
  readonly label: string
  readonly meta: string
}

/** 单项目 360 摘要中的一个穿透面板：概览指标 + 补充字段 + 事件 + 节点 + 原件。 */
export interface PanelModel {
  readonly id: string
  /** 面板名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly metrics: readonly Field<string>[]
  readonly fields: readonly PanelFieldModel[]
  readonly events: readonly PanelEventModel[]
  readonly nodes: readonly PanelNodeModel[]
  readonly links: readonly PanelLinkModel[]
}

/** 选中项目后展示的 360 摘要。 */
export interface ProjectDetailModel {
  readonly projectId: string
  readonly projectName: Field<string>
  readonly panels: readonly PanelModel[]
}

/** 职能部门的综合健康档位（决定状态标签颜色）。 */
export type DepartmentHealth = 'good' | 'watch' | 'risk'

/** 职能部门的优化调整建议。 */
export interface DepartmentSuggestion {
  readonly priority: 'high' | 'medium' | 'low'
  readonly text: string
  /** 建议依据（数据或事实来源说明）。 */
  readonly basis: string
}

/** 职能专题中的单个职能部门视图：综合状态 + 优化建议。 */
export interface DepartmentModel {
  readonly id: string
  /** 部门名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly health: DepartmentHealth
  /** 综合状态指标行（label 为演示中文文案，与事件要素的 label 同约定）。 */
  readonly metrics: readonly { readonly label: string; readonly value: string }[]
  readonly suggestions: readonly DepartmentSuggestion[]
}

/** 决策 → 记录 → 文档 → 知识 证据链中的一个节点。 */
export interface EvidenceLinkModel {
  readonly id: string
  /** 链节名称的文案 key。 */
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly field: Field<string>
}

/** 工时详情弹窗中的单项目工时行。 */
export interface LaborProjectRowModel {
  readonly id: string
  readonly project: string
  readonly inputHours: string
  readonly leaveHours: string
  readonly netHours: string
}

/** 经营总览的工时区块：只在弹窗中展示各项目工时，总览图不出现人员级明细。 */
export interface LaborHoursModel {
  readonly projectRows: readonly LaborProjectRowModel[]
}

/** 经营总览的时间范围档位（当前进展 / 当月 / 本季度 / 本年 / 总览）。 */
export type OperatorPeriod = 'progress' | 'month' | 'quarter' | 'year' | 'all'

/** 经营总览（首屏）：分组 KPI 卡（今日决策已移至异常与决策中心）。 */
export interface OverviewModel {
  readonly kpis: readonly KpiCardModel[]
  readonly laborHours: LaborHoursModel
}

/** 决策抽屉中的治理操作（Action 适配前保持禁用）。 */
export interface DecisionActionModel {
  readonly id: string
  readonly labelKey: OperatorLocaleKey
  readonly disabled: boolean
  readonly noteKey: OperatorLocaleKey
}

/** 风险与决策中心：队列 + 详情抽屉。 */
export interface DecisionCenterModel {
  readonly filters: readonly { readonly id: string; readonly nameKey: OperatorLocaleKey; readonly count: Field<string> }[]
  readonly queue: readonly QueueItemModel[]
  readonly selected: QueueItemModel | undefined
  readonly detail: {
    /** 事件要素：预计/已发生时间、建议处理人、建议闭环时间等键值行。 */
    readonly facts: readonly { readonly label: string; readonly value: string }[]
    /** 影响域分析：财务 / 人员 / 交付等维度的逐项分析。 */
    readonly impacts: readonly { readonly dimension: string; readonly detail: string }[]
    readonly suggestion: Field<string>
    readonly actions: readonly DecisionActionModel[]
  } | undefined
}

/** 项目穿透页。 */
export interface ProjectScreenModel {
  readonly cards: readonly ProjectCardModel[]
  readonly detail: ProjectDetailModel | undefined
}

/** 职能专题页：公司运营视角的部门综合状态 + 优化调整建议。 */
export interface FunctionalScreenModel {
  readonly departments: readonly DepartmentModel[]
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

/** 五屏 ViewId 前缀，外层导航与内层屏幕 id 之间靠它互转。 */
const VIEW_PREFIX = 'operator-'

/** 把外层导航的 ViewId 转成内层屏幕 id。 */
export function screenOfView(view: `operator-${OperatorScreenId}`): OperatorScreenId {
  return view.slice(VIEW_PREFIX.length) as OperatorScreenId
}

/** 把内层屏幕 id 转回外层导航的 ViewId（供内容区切换菜单项）。 */
export function viewOfScreen(screen: OperatorScreenId): `operator-${OperatorScreenId}` {
  return `${VIEW_PREFIX}${screen}`
}

/** 由 briefing 驱动的异常计数的静态定义。 */
export interface RawAnomalySeed {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  /** 用于匹配 briefing 行的文本（与语言无关）。 */
  readonly match: string
}
