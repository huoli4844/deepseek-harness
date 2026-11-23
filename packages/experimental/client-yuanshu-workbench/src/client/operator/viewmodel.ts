/**
 * 运营者工作台的视图模型层。
 *
 * 本模块用纯函数把校验后的原始投影组装成不可变的五屏视图模型，供展示层消费。
 * 它不依赖 React、不做数据请求、也没有副作用。
 *
 * 数据策略（当前阶段）：
 *  - 有真实投影（briefing / decisions / projects）时优先展示真实值；
 *  - 其余字段统一回退到明确的演示快照（`demo` 档位），
 *    界面上不再出现「待接入 / 字段待定」等接口状态标签。
 */

import type {
  AttainmentTone,
  Availability,
  DecisionCenterModel,
  EvidenceScreenModel,
  Field,
  FunctionalScreenModel,
  KpiCardModel,
  KpiGroup,
  LaborHoursModel,
  OperatorPeriod,
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
  demo: 'demo-snapshot',
  ontology: 'ontology_context',
  records: 'workbench_records',
  contracts: 'fin_contracts',
  projectTasks: 'prj_project_tasks',
  inspections: 'qwh_quality_inspections',
  shipments: 'srv_shipments',
} as const

/** 构造一个带明确档位与来源的字段。 */
function field<T>(value: T | undefined, tier: Availability, source: string): Field<T> {
  return { value, tier, source }
}

/** A 档字段：投影存在，展示真实值。 */
function live<T>(value: T | undefined, source: string): Field<T> {
  return field(value, 'ready', source)
}

/** 演示字段：接口暂无数据，值来自明确标注的演示快照。 */
function demo<T>(value: T, source: string = SOURCE.demo): Field<T> {
  return field(value, 'demo', source)
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

/** 三类固定的异常种子（风险与决策中心的「异常事件」分类）。 */
const ANOMALIES: readonly RawAnomalySeed[] = [
  { id: 'delayed-purchase', nameKey: 'operator.anomaly.delayedPurchase', match: '延迟采购' },
  { id: 'inspection-backlog', nameKey: 'operator.anomaly.inspectionBacklog', match: '检验积压' },
  { id: 'open-quality', nameKey: 'operator.anomaly.openQuality', match: '质量异常' },
]

/** 异常计数的演示快照（briefing 无对应行时使用）。 */
const DEMO_ANOMALY_COUNTS: Record<string, string> = {
  'delayed-purchase': '2',
  'inspection-backlog': '5',
  'open-quality': '1',
}

/** 风险事件演示数据：标题 + 事件要素（时间 / 建议处理人 / 建议闭环时间）。 */
const DEMO_RISKS: readonly {
  readonly title: string
  readonly expectedAt: string
  readonly owner: string
  readonly closeBy: string
  readonly severity: Severity
}[] = [
  { title: '关键设备到货延迟风险', expectedAt: '预计 2026-12-05', owner: '陈静 · 采购工程师', closeBy: '2026-12-12', severity: 'overdue' },
  { title: '分包进度滞后风险', expectedAt: '预计 2026-12-18', owner: '李娜 · 计划工程师', closeBy: '2026-12-25', severity: 'pending' },
  { title: '设计变更成本超支风险', expectedAt: '预计 2027-01-10', owner: '王强 · 项目经理', closeBy: '2027-01-20', severity: 'pending' },
]

/** 异常事件的事件要素（briefing 计数只影响标题，要素为演示值）。 */
const ANOMALY_FACTS: readonly { readonly occurredAt: string; readonly owner: string; readonly closeBy: string }[] = [
  { occurredAt: '已发生 2026-11-19', owner: '周伟 · 采购经理', closeBy: '2026-11-28' },
  { occurredAt: '已发生 2026-11-21', owner: '赵磊 · 质量工程师', closeBy: '2026-11-30' },
  { occurredAt: '已发生 2026-11-22', owner: '孙敏 · 检验主管', closeBy: '2026-12-02' },
]

/** 影响域分析的通用演示维度（财务 / 人员 / 交付）。 */
const IMPACT_DIMENSIONS: readonly { readonly dimension: string; readonly detail: string }[] = [
  { dimension: '财务', detail: '可能增加采购成本与违约金支出，需财务预留应急预算' },
  { dimension: '人员', detail: '需抽调 2 名工程师支援处置，影响并行任务排期' },
  { dimension: '交付', detail: '关键路径可能滞后，建议提前与甲方沟通形象进度确认节点' },
]

/** 单个时间范围档位下的 KPI 数值（当前值与可选目标值；「总览」档无目标）。 */
interface KpiPeriodValues {
  readonly value: number
  readonly target?: number
}

/** KPI 数值的展示格式（前后缀单位）。 */
interface KpiFormat {
  readonly prefix?: string
  readonly suffix?: string
}

/** 公司级 KPI 卡片的静态定义（数值随时间范围档位给出，目标为全年目标分解）。 */
interface KpiSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  /** 所属分组（经营数据 / 人力资源 / 项目任务 / 质量总览）。 */
  readonly group: KpiGroup
  readonly source: string
  readonly format: KpiFormat
  /** 各时间范围档位的数值；target 为全年目标按档位平均分配（存量型指标除外）。 */
  readonly periods: Record<OperatorPeriod, KpiPeriodValues>
  /** 为 true 时点击卡片打开工时详情弹窗。 */
  readonly interactive?: boolean
}

/** 单项目 360 摘要面板的静态定义。 */
interface PanelSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  readonly source: string
  readonly metrics: readonly OperatorLocaleKey[]
}

/** 各项目穿透面板中每个指标的演示文案 key，顺序与面板指标一致。 */
const PROJECT_PANELS: readonly PanelSpec[] = [
  { id: 'finance', nameKey: 'operator.panel.finance', source: 'projects/{code}/finance-summary', metrics: ['operator.metric.contractAmount', 'operator.metric.receivedAmount'] },
  { id: 'stage', nameKey: 'operator.panel.stage', source: 'projects/{code}/stage-tree', metrics: ['operator.metric.currentStage', 'operator.metric.stageProgress'] },
  { id: 'quality-targets', nameKey: 'operator.panel.qualityTargets', source: 'projects/{code}/quality-exceptions', metrics: ['operator.metric.firstPassRate', 'operator.metric.openExceptions'] },
  { id: 'risks', nameKey: 'operator.panel.risks', source: 'projects/{code}/risks', metrics: ['operator.metric.openRisks', 'operator.metric.overdueRisks'] },
  { id: 'major-decisions', nameKey: 'operator.panel.majorDecisions', source: 'projects/{code}/decision-queue', metrics: ['operator.metric.pendingDecisions', 'operator.metric.latestDecision'] },
  { id: 'run-status', nameKey: 'operator.panel.runStatus', source: 'projects/{code}/run-status', metrics: ['operator.metric.runStatus', 'operator.metric.deliveryRisk'] },
]

/**
 * 项目穿透的演示快照：每个项目一组独立数值，点击不同项目时穿透信息跟随变化。
 * 顺序对应项目卡片列表；真实项目按卡片序号取模循环使用。
 */
const PROJECT_VARIANTS: readonly {
  readonly finance: readonly [string, string]
  readonly stage: readonly [string, string]
  readonly quality: readonly [string, string]
  readonly risks: readonly [string, string]
  readonly decisions: readonly [string, string]
  readonly status: readonly [string, string]
}[] = [
  {
    finance: ['¥ 1,860 万', '¥ 1,120 万'], stage: ['实施阶段', '62%'], quality: ['96.4%', '2'],
    risks: ['4', '1'], decisions: ['3', '二阶段进度款支付审批'], status: ['正常运行', '中'],
  },
  {
    finance: ['¥ 920 万', '¥ 322 万'], stage: ['采购阶段', '38%'], quality: ['94.8%', '3'],
    risks: ['6', '2'], decisions: ['2', '设备采购延期处理'], status: ['预警', '高'],
  },
  {
    finance: ['¥ 480 万', '¥ 456 万'], stage: ['验收阶段', '81%'], quality: ['98.2%', '0'],
    risks: ['1', '0'], decisions: ['1', '验收门禁开放申请'], status: ['正常运行', '低'],
  },
  {
    finance: ['¥ 2,400 万', '¥ 360 万'], stage: ['设计阶段', '15%'], quality: ['95.5%', '1'],
    risks: ['3', '1'], decisions: ['4', '设计方案评审安排'], status: ['正常运行', '中'],
  },
]

/** 甲方单位演示池（按项目序号取模轮换）。 */
const CLIENT_ORGS: readonly string[] = [
  '城建发展集团 · 甲方项目部', '智造产业园开发有限公司', '华东数据科技有限公司', '绿色建材产业园管委会',
]

/** 我方项目组演示池（按项目序号取模轮换）。 */
const OUR_TEAMS: readonly string[] = [
  '王强 · 项目经理 / 李娜 · 计划工程师 / 赵磊 · 质量工程师',
  '陈静 · 项目经理 / 周伟 · 采购工程师 / 孙敏 · 计划工程师',
  '李娜 · 项目经理 / 赵磊 · 现场工程师 / 王强 · 质量工程师',
  '周伟 · 项目经理 / 陈静 · 设计对接 / 孙敏 · 采购工程师',
]

/** 对接人演示池。 */
const PANEL_OWNERS: readonly string[] = ['周伟', '李娜', '王强', '陈静']

/** 合同编号演示：按项目序号生成稳定编号。 */
function contractCode(index: number): string {
  return `HT-2026-${String(18 + index * 4).padStart(3, '0')}`
}

/** 财务穿透面板：合同关键信息 + 资金事件 + 回款节点 + 合同原件。 */
function financePanel(values: readonly [string, string], name: string, index: number): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  const owner = PANEL_OWNERS[index % PANEL_OWNERS.length] ?? '周伟'
  const client = CLIENT_ORGS[index % CLIENT_ORGS.length] ?? '甲方项目部'
  const team = OUR_TEAMS[index % OUR_TEAMS.length] ?? '项目经理 / 计划 / 质量 / 采购全岗协同'
  return {
    fields: [
      { label: '合同编号', value: contractCode(index) },
      { label: '签订时间', value: `2026-0${3 + index % 5}-12` },
      { label: '付款比例', value: '预付 30% · 进度款 60% · 验收款 10%' },
      { label: '特殊注意点', value: index % 2 === 0 ? '进度款以月度形象进度确认为准，需甲方现场代表签认' : '含甲方供料条款，材料价差按季度调差' },
      { label: '对接人 / 甲方信息', value: `对接人 ${owner} · 甲方 ${client}` },
      { label: '我方项目组', value: team },
    ],
    events: [
      { time: `2026-0${3 + index % 5}-12`, title: '合同签订', detail: `${name} · 双方用印完成，合同编号 ${contractCode(index)}` },
      { time: `2026-0${4 + index % 5}-02`, title: '预付款到账', detail: `到账 ${values[0]} × 30%，已登记资金台账` },
      { time: '2026-09-20', title: '二阶段进度款申请', detail: '形象进度确认单已上传，等待甲方签认' },
      { time: '计划 2027-01-15', title: '验收款结算', detail: '待验收门禁通过后提交结算资料' },
    ],
    nodes: [
      { label: '合同签订', status: 'done', detail: '双方用印完成' },
      { label: '预付款', status: 'done', detail: '30% 预付款已到账' },
      { label: '进度款支付', status: 'active', detail: '二阶段进度款审批中' },
      { label: '验收结算', status: 'pending', detail: '待验收门禁通过' },
      { label: '质保金', status: 'pending', detail: '质保期满后返还' },
    ],
    links: [
      { id: 'contract-original', label: `${contractCode(index)} 合同原件扫描件.pdf`, meta: 'PDF · 4.2 MB · 已归档' },
      { id: 'contract-appendix', label: '付款节点确认单.docx', meta: 'Word · 128 KB · 甲乙双方签认版' },
    ],
  }
}

/** 阶段穿透面板：历史阶段事件 + 阶段门禁节点。 */
function stagePanel(values: readonly [string, string]): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  const current = values[0]
  const progress = values[1]
  const atOrAfter = (stage: string): boolean =>
    ['设计阶段', '采购阶段', '实施阶段', '验收阶段'].indexOf(current) >= ['设计阶段', '采购阶段', '实施阶段', '验收阶段'].indexOf(stage)
  return {
    fields: [
      { label: '当前阶段', value: current },
      { label: '阶段进度', value: progress },
      { label: '基线版本', value: 'V1.3 · 2026-10-08 发布' },
      { label: '计划完成', value: '2027-03-30' },
    ],
    events: [
      { time: '2026-02-26', title: '项目立项', detail: '可研评审通过，成立项目组并下达开工令' },
      { time: '2026-04-18', title: '设计阶段完成', detail: '初步设计通过评审，施工图交付并归档' },
      { time: '2026-06-30', title: '采购阶段完成', detail: '主要设备与材料合同签订完毕，供应商入场' },
      { time: '2026-09-01', title: `进入${current}`, detail: '阶段门禁评审通过，转入当前阶段' },
    ],
    nodes: [
      { label: '立项', status: 'done', detail: '2026-02-26 开工令下达' },
      { label: '设计', status: atOrAfter('设计阶段') ? 'done' : 'active', detail: '施工图已归档' },
      { label: '采购', status: atOrAfter('采购阶段') ? 'done' : 'pending', detail: '设备与材料合同签订' },
      { label: '实施', status: current === '实施阶段' ? 'active' : atOrAfter('验收阶段') ? 'done' : 'pending', detail: '现场施工与安装调试' },
      { label: '验收', status: current === '验收阶段' ? 'active' : 'pending', detail: '竣工验收与资料移交' },
    ],
    links: [],
  }
}

/** 质量穿透面板：质量目标 vs 实际 + 检验事件 + 质量节点。 */
function qualityPanel(values: readonly [string, string]): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  const openCount = Number(values[1]) || 0
  return {
    fields: [
      { label: '质量目标', value: '来料一次合格率 ≥ 98%' },
      { label: '目标达成', value: Number(values[0].replace('%', '')) >= 98 ? '达标' : '未达标 · 差距整改中' },
      { label: '本月检验批次', value: '12 批 · 覆盖 8 类主材' },
      { label: '待复检项', value: openCount > 0 ? `${openCount} 项` : '无' },
    ],
    events: [
      { time: '2026-11-18', title: '幕墙铝材来料检验', detail: '一次检验合格，已出具检验报告' },
      { time: '2026-11-20', title: '钢梁焊缝检验待复检', detail: '焊缝探伤存在超标点，已开整改单' },
      { time: '2026-11-12', title: '质量问题闭环', detail: '上一批门窗密封问题已复检关闭' },
    ],
    nodes: [
      { label: '检验计划', status: 'done', detail: '月度检验计划已发布' },
      { label: '来料检验', status: 'done', detail: '主材批次全部覆盖' },
      { label: '过程检验', status: openCount > 0 ? 'risk' : 'done', detail: openCount > 0 ? `${openCount} 项待复检` : '全部合格' },
      { label: '整改闭环', status: openCount > 0 ? 'active' : 'done', detail: openCount > 0 ? '整改单跟踪中' : '无未闭环项' },
    ],
    links: [],
  }
}

/** 风险穿透面板：风险事件 + 处置节点。 */
function risksPanel(values: readonly [string, string]): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  const overdue = Number(values[1]) || 0
  return {
    fields: [
      { label: '最高风险等级', value: overdue > 0 ? '高 · 存在超期风险' : '中 · 均在受控范围' },
      { label: '上次评估', value: '2026-11-18 · 周例会' },
      { label: '风险责任人', value: '项目组全员 · 责任到人' },
    ],
    events: [
      { time: '2026-11-15', title: '新风险识别', detail: '关键设备到货周期拉长，登记为中等风险' },
      { time: '2026-11-08', title: '风险处置措施执行', detail: '供应商产能协调会已召开，锁定备选产能' },
      { time: '2026-10-30', title: '风险升级', detail: `${values[1]} 项风险超期未关闭，已升级至项目例会督办` },
    ],
    nodes: [
      { label: '风险识别', status: 'done', detail: '识别 6 项在册风险' },
      { label: '影响评估', status: 'done', detail: '按进度 / 成本 / 质量三维评估' },
      { label: '处置执行', status: overdue > 0 ? 'risk' : 'active', detail: overdue > 0 ? `${overdue} 项超期督办中` : '措施按计划推进' },
      { label: '关闭复核', status: 'pending', detail: '处置完成后由质量经理复核关闭' },
    ],
    links: [],
  }
}

/** 决策穿透面板：决策事件 + 决策流节点。 */
function decisionsPanel(values: readonly [string, string]): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  return {
    fields: [
      { label: '决策通道', value: '项目治理委员会' },
      { label: '上次决策会', value: '2026-11-15' },
      { label: '待决策事项', value: `${values[0]} 项 · 最高优先级：${values[1]}` },
    ],
    events: [
      { time: '2026-11-15', title: values[1], detail: '已提交关键事实与影响分析，等待上会' },
      { time: '2026-11-02', title: '上月决策执行复核', detail: '2 项已批决策执行到位，证据链完整' },
      { time: '2026-10-20', title: '决策会决议', detail: '设备采购延期方案获批，责任人与节点明确' },
    ],
    nodes: [
      { label: '事项提出', status: 'done', detail: '由职能条线发起并附证据' },
      { label: '评审', status: 'active', detail: '关键事实评审中' },
      { label: '审批', status: 'pending', detail: '治理委员会上会审批' },
      { label: '执行', status: 'pending', detail: '决议分发并跟踪执行' },
    ],
    links: [],
  }
}

/** 运行状态穿透面板：近期运行事件 + 里程碑节点。 */
function statusPanel(values: readonly [string, string]): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  const healthy = values[0] === '正常运行'
  return {
    fields: [
      { label: '运行状态', value: values[0] },
      { label: '交付风险', value: values[1] },
      { label: '本周关键节点', value: healthy ? '形象进度确认 · 周五' : '超期事项督办 · 每日跟进' },
      { label: '下次检查', value: '2026-11-28 · 联合巡检' },
    ],
    events: [
      { time: '2026-11-21', title: '周进度例会', detail: healthy ? '进度符合基线，无新增异常' : '关键路径滞后 5 天，启动追赶计划' },
      { time: '2026-11-19', title: '里程碑达成', detail: '二阶段主体节点按期完成并留证' },
      { time: '2026-11-17', title: '异常处理', detail: healthy ? '1 项现场问题当日闭环' : `${values[1]} 风险项升级跟踪` },
    ],
    nodes: [
      { label: '本周里程碑', status: 'done', detail: '主体节点已完成' },
      { label: '当前冲刺', status: healthy ? 'active' : 'risk', detail: healthy ? '按基线推进' : '关键路径追赶中' },
      { label: '下周计划', status: 'pending', detail: '联合巡检 + 月度形象进度确认' },
    ],
    links: [],
  }
}

/** 按面板 id 派生各项目的穿透明细（补充字段 / 事件 / 节点 / 原件）。 */
function panelDrillDown(panelId: string, values: readonly [string, string], projectName: string, index: number): Pick<PanelModel, 'fields' | 'events' | 'nodes' | 'links'> {
  switch (panelId) {
    case 'finance': return financePanel(values, projectName, index)
    case 'stage': return stagePanel(values)
    case 'quality-targets': return qualityPanel(values)
    case 'risks': return risksPanel(values)
    case 'major-decisions': return decisionsPanel(values)
    default: return statusPanel(values)
  }
}

/** 职能专题账本的静态定义。 */
interface LedgerSpec {
  readonly id: string
  readonly nameKey: OperatorLocaleKey
  readonly table: string
  readonly columns: readonly OperatorLocaleKey[]
}

/** 公司级 KPI 卡片：数值随时间范围切换，目标为全年目标分解，完成率 = 当前值 / 目标值。 */
const KPIS: readonly KpiSpec[] = [
  {
    // 合同目标：全年新签合同 6,000 万；当前进展 = 年初至今累计。
    id: 'contract-total', nameKey: 'operator.kpi.contractTotal', group: 'finance', source: SOURCE.contracts,
    format: { prefix: '¥ ', suffix: ' 万' },
    periods: {
      progress: { value: 4860, target: 6000 },
      month: { value: 405, target: 500 },
      quarter: { value: 1215, target: 1500 },
      year: { value: 5600, target: 6000 },
      all: { value: 12400 },
    },
  },
  {
    // 回款目标：全年回款 5,400 万。
    id: 'received-amount', nameKey: 'operator.kpi.receivedAmount', group: 'finance', source: SOURCE.contracts,
    format: { prefix: '¥ ', suffix: ' 万' },
    periods: {
      progress: { value: 4180, target: 5400 },
      month: { value: 372, target: 450 },
      quarter: { value: 1120, target: 1350 },
      year: { value: 5050, target: 5400 },
      all: { value: 9850 },
    },
  },
  {
    // 正在履约合同（存量型，目标不随周期分摊）。
    id: 'active-contracts', nameKey: 'operator.kpi.activeContracts', group: 'finance', source: SOURCE.contracts,
    format: { suffix: ' 个' },
    periods: {
      progress: { value: 86, target: 90 },
      month: { value: 12, target: 8 },
      quarter: { value: 31, target: 23 },
      year: { value: 88, target: 90 },
      all: { value: 86 },
    },
  },
  {
    id: 'completed-contracts', nameKey: 'operator.kpi.completedContracts', group: 'finance', source: SOURCE.contracts,
    format: { suffix: ' 个' },
    periods: {
      progress: { value: 74, target: 80 },
      month: { value: 9, target: 7 },
      quarter: { value: 26, target: 20 },
      year: { value: 78, target: 80 },
      all: { value: 210 },
    },
  },
  {
    id: 'gross-margin', nameKey: 'operator.kpi.grossMargin', group: 'finance', source: SOURCE.contracts,
    format: { suffix: '%' },
    periods: {
      progress: { value: 31.8, target: 32 },
      month: { value: 30.2, target: 32 },
      quarter: { value: 31.5, target: 32 },
      year: { value: 32.0, target: 32 },
      all: { value: 30.9 },
    },
  },
  {
    // 人员总工时：点击卡片打开各项目工时详情弹窗。
    id: 'labor-total', nameKey: 'operator.kpi.laborTotal', group: 'people', source: SOURCE.demo, interactive: true,
    format: { suffix: ' 小时' },
    periods: {
      progress: { value: 28808, target: 26000 },
      month: { value: 2382.2, target: 2166.7 },
      quarter: { value: 7202, target: 6500 },
      year: { value: 30500, target: 26000 },
      all: { value: 61200 },
    },
  },
  {
    // 人员目标：全年编制 120 人（存量型指标，目标不随周期分摊）。
    id: 'headcount', nameKey: 'operator.kpi.headcount', group: 'people', source: SOURCE.demo,
    format: { suffix: ' 人' },
    periods: {
      progress: { value: 112, target: 120 },
      month: { value: 98, target: 120 },
      quarter: { value: 105, target: 120 },
      year: { value: 118, target: 120 },
      all: { value: 112 },
    },
  },
  {
    id: 'task-on-time', nameKey: 'operator.kpi.taskOnTime', group: 'task', source: SOURCE.projectTasks,
    format: { suffix: '%' },
    periods: {
      progress: { value: 91.9, target: 95 },
      month: { value: 92.4, target: 95 },
      quarter: { value: 91.6, target: 95 },
      year: { value: 92.5, target: 95 },
      all: { value: 93.1 },
    },
  },
  {
    id: 'inspection-first-pass', nameKey: 'operator.kpi.inspectionFirstPass', group: 'quality', source: SOURCE.inspections,
    format: { suffix: '%' },
    periods: {
      progress: { value: 96.0, target: 98 },
      month: { value: 96.1, target: 98 },
      quarter: { value: 95.8, target: 98 },
      year: { value: 96.5, target: 98 },
      all: { value: 96.8 },
    },
  },
  {
    id: 'shipment-on-time', nameKey: 'operator.kpi.shipmentOnTime', group: 'quality', source: SOURCE.shipments,
    format: { suffix: '%' },
    periods: {
      progress: { value: 90.1, target: 95 },
      month: { value: 89.7, target: 95 },
      quarter: { value: 90.4, target: 95 },
      year: { value: 91.0, target: 95 },
      all: { value: 91.6 },
    },
  },
]

/** 各职能账本的列名 key 与演示行。 */
const LEDGER_SPECS: readonly (LedgerSpec & { readonly demoRows: readonly (readonly string[])[] })[] = [
  {
    id: 'quality', nameKey: 'operator.ledger.quality', table: SOURCE.inspections,
    columns: ['operator.col.date', 'operator.col.object', 'operator.col.result', 'operator.col.owner'],
    demoRows: [
      ['2026-11-18', '一期幕墙铝材', '合格', '周伟'],
      ['2026-11-20', '二期钢梁焊缝', '待复检', '李娜'],
      ['2026-11-21', '数据中心机柜', '合格', '王强'],
    ],
  },
  {
    id: 'supply', nameKey: 'operator.ledger.supply', table: 'pur_purchase_orders',
    columns: ['operator.col.order', 'operator.col.supplier', 'operator.col.amount', 'operator.col.status'],
    demoRows: [
      ['PO-1024', '华东建材', '¥ 86 万', '已下单'],
      ['PO-1031', '华南钢构', '¥ 132 万', '延迟'],
      ['PO-1042', '苏州机电', '¥ 45 万', '已到货'],
    ],
  },
  {
    id: 'delivery', nameKey: 'operator.ledger.delivery', table: SOURCE.shipments,
    columns: ['operator.col.project', 'operator.col.commitDate', 'operator.col.status'],
    demoRows: [
      ['智慧园区一期', '2026-11-28', '按时'],
      ['智能工厂二期', '2026-12-05', '风险'],
      ['数据中心改造', '2026-11-30', '按时'],
    ],
  },
  {
    id: 'finance', nameKey: 'operator.ledger.finance', table: SOURCE.contracts,
    columns: ['operator.col.contract', 'operator.col.amount', 'operator.col.status'],
    demoRows: [
      ['HT-2026-018', '¥ 1,860 万', '已回款 60%'],
      ['HT-2026-022', '¥ 920 万', '已回款 35%'],
      ['HT-2026-027', '¥ 480 万', '未回款'],
    ],
  },
]

/** 项目组合的演示快照（投影中没有项目时使用）。 */
const DEMO_PROJECTS: readonly { readonly name: string; readonly stage: string; readonly progress: string; readonly risk: string }[] = [
  { name: '智慧园区一期', stage: '实施阶段', progress: '62%', risk: '中' },
  { name: '智能工厂二期', stage: '采购阶段', progress: '38%', risk: '高' },
  { name: '数据中心改造', stage: '验收阶段', progress: '81%', risk: '低' },
  { name: '绿色建材基地', stage: '设计阶段', progress: '15%', risk: '中' },
]

/** 今日决策的演示快照（投影中没有决策时使用）。 */
const DEMO_DECISIONS: readonly string[] = [
  '智慧园区一期二阶段进度款支付审批',
  '智能工厂二期设备采购延期处理',
  '数据中心改造验收门禁开放申请',
]

/** 证据链各节点的演示摘要。 */
const DEMO_EVIDENCE: Record<string, string> = {
  decision: '3 条待决策',
  record: '48 条作业记录',
  document: '12 份受控文档',
  knowledge: '5 处知识引用',
}

/** 时间范围档位对演示工时的放大系数（当月为基准；进展/总览分别对齐当月/本年）。 */
const PERIOD_FACTOR: Record<OperatorPeriod, number> = {
  progress: 4.3,
  month: 4.3,
  quarter: 13,
  year: 52,
  all: 52,
}

/** 工时数字格式化：四舍五入到 0.1，整数不加小数。 */
function hoursText(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** 按时间范围档位缩放演示工时（单位：小时）。 */
function scaleHours(hours: number, period: OperatorPeriod): string {
  return hoursText(hours * PERIOD_FACTOR[period])
}

/** KPI 数值格式化：千位分隔 + 最多 1 位小数（去掉尾零）。 */
function kpiNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

/** 按 KPI 格式定义把数值转成展示字符串。 */
function formatKpi(n: number, format: KpiFormat): string {
  return `${format.prefix ?? ''}${kpiNumber(n)}${format.suffix ?? ''}`
}

/** 完成率文本：当前值 / 目标值，最多 1 位小数。 */
function attainmentText(value: number, target: number): string {
  const rate = Math.round(value / target * 1000) / 10
  return `${Number.isInteger(rate) ? String(rate) : rate.toFixed(1)}%`
}

/** 完成率颜色档位：≥100% 达标（绿），≥85% 接近（琥珀），<85% 落后（红）。 */
function attainmentToneOf(value: number, target: number): AttainmentTone {
  const rate = value / target * 100
  return rate >= 100 ? 'ok' : rate >= 85 ? 'warn' : 'risk'
}

/** 人员工时演示快照（周为基准；总览图只展示弹窗用的项目维度行）。 */
const DEMO_LABOR = {
  total: 554,
  projects: [
    { project: '智慧园区一期', input: 250, leave: 12 },
    { project: '智能工厂二期', input: 217, leave: 12 },
    { project: '数据中心改造', input: 87, leave: 0 },
  ],
} as const

/** 构造公司级 KPI 卡片：目标为全年目标分解，完成率随数值与目标自动计算（无目标档位不显示）。 */
function buildKpis(period: OperatorPeriod): readonly KpiCardModel[] {
  return KPIS.map((kpi) => {
    const { value, target } = kpi.periods[period]
    return {
      id: kpi.id,
      nameKey: kpi.nameKey,
      group: kpi.group,
      interactive: kpi.interactive === true,
      value: demo(formatKpi(value, kpi.format), kpi.source),
      ...(target === undefined ? {} : {
        target: demo(formatKpi(target, kpi.format), kpi.source),
        attainment: attainmentText(value, target),
        attainmentTone: attainmentToneOf(value, target),
      }),
    }
  })
}

/** 构造风险与决策中心的队列行：风险事件 + 异常事件 + 决策（真实优先，否则演示）。 */
function buildQueue(raw: RawProjections): readonly QueueItemModel[] {
  const riskRows: QueueItemModel[] = DEMO_RISKS.map((risk, index) => ({
    id: `queue-risk-${index}`,
    kind: 'risk',
    categoryKey: 'operator.filter.risk',
    title: demo(risk.title),
    meta: demo(`${risk.expectedAt} · 建议处理人 ${risk.owner}`),
    severity: risk.severity satisfies Severity,
    source: SOURCE.demo,
  }))
  const anomalyRows: QueueItemModel[] = ANOMALIES.map((seed, index) => {
    const realValue = briefingValue(raw.briefing, seed.match)
    const value = realValue ?? DEMO_ANOMALY_COUNTS[seed.id] ?? '0'
    // 有真实 briefing 计数用 live（ready 档），否则用 demo 档兜底。
    const titleField = realValue === undefined
      ? demo(`${seed.match} · ${value}`)
      : live(`${seed.match} · ${value}`, SOURCE.briefing)
    const facts = ANOMALY_FACTS[index % ANOMALY_FACTS.length] ?? ANOMALY_FACTS[0]
    const metaField = realValue === undefined
      ? demo(`${facts?.occurredAt ?? '已发生'} · ${facts?.owner ?? ''}`)
      : live(`${facts?.occurredAt ?? '已发生'} · ${facts?.owner ?? ''}`, SOURCE.briefing)
    return {
      id: `queue-${seed.id}`,
      kind: 'anomaly',
      categoryKey: seed.nameKey,
      title: titleField,
      meta: metaField,
      severity: (seed.id === 'open-quality' ? 'overdue' : 'pending') satisfies Severity,
      source: realValue === undefined ? SOURCE.demo : SOURCE.briefing,
    }
  })
  const realDecisions = (raw.decisions ?? []).slice(0, 8)
  const decisionRows: QueueItemModel[] = realDecisions.length > 0
    ? realDecisions.map((row, index) => ({
      id: `queue-decision-${index}`,
      kind: 'decision',
      categoryKey: 'operator.filter.decision',
      title: live(row.title.trim() === '' ? undefined : row.title, SOURCE.decisions),
      meta: live(firstDetail(row), SOURCE.decisions),
      severity: 'pending' satisfies Severity,
      source: SOURCE.decisions,
    }))
    : DEMO_DECISIONS.map((title, index) => ({
      id: `queue-decision-demo-${index}`,
      kind: 'decision',
      categoryKey: 'operator.filter.decision',
      title: demo(title),
      meta: demo('待处理'),
      severity: 'pending' satisfies Severity,
      source: SOURCE.demo,
    }))
  return [...riskRows, ...anomalyRows, ...decisionRows]
}

/** 为选中的队列项构造详情抽屉：事件要素 + 影响域分析 + 建议方案（均为演示值）。 */
function buildDecisionDetail(selected: QueueItemModel | undefined): DecisionCenterModel['detail'] {
  if (selected === undefined) return undefined
  const risk = selected.kind === 'risk'
    ? DEMO_RISKS.find(item => item.title === selected.title.value)
    : undefined
  const anomalyIndex = ANOMALIES.findIndex(item => selected.id === `queue-${item.id}`)
  const facts = risk !== undefined
    ? [
      { label: '预计发生时间', value: risk.expectedAt },
      { label: '建议处理人', value: risk.owner },
      { label: '建议闭环时间', value: risk.closeBy },
    ]
    : selected.kind === 'anomaly'
      ? (() => {
        const facts = ANOMALY_FACTS[(anomalyIndex < 0 ? 0 : anomalyIndex) % ANOMALY_FACTS.length] ?? ANOMALY_FACTS[0]
        return [
          { label: '已发生时间', value: facts?.occurredAt.replace('已发生 ', '') ?? '—' },
          { label: '建议处理人', value: facts?.owner ?? '' },
          { label: '建议闭环时间', value: facts?.closeBy ?? '' },
        ]
      })()
      : [
        { label: '提出时间', value: '2026-11-15' },
        { label: '建议处理人', value: '项目治理委员会秘书' },
        { label: '建议闭环时间', value: '2026-11-29 · 本周决策会' },
      ]
  return {
    facts,
    impacts: IMPACT_DIMENSIONS,
    suggestion: demo('建议按治理流程推进，本周内完成闭环并留证'),
    actions: [
      { id: 'approve', labelKey: 'operator.action.approve', disabled: true, noteKey: 'operator.action.governancePending' },
      { id: 'reject', labelKey: 'operator.action.reject', disabled: true, noteKey: 'operator.action.governancePending' },
      { id: 'delegate', labelKey: 'operator.action.delegate', disabled: true, noteKey: 'operator.action.governancePending' },
    ],
  }
}

/** 构造风险与决策中心：全部 / 风险事件 / 异常事件 / 决策四档筛选 + 队列 + 详情。 */
function buildDecisionCenter(queue: readonly QueueItemModel[]): DecisionCenterModel {
  const countOf = (kind: QueueItemModel['kind']): Field<string> =>
    demo(String(queue.filter(item => item.kind === kind).length))
  const filters: DecisionCenterModel['filters'] = [
    { id: 'all', nameKey: 'operator.filter.all', count: demo(String(queue.length)) },
    { id: 'risk', nameKey: 'operator.filter.risk', count: countOf('risk') },
    { id: 'anomaly', nameKey: 'operator.filter.anomaly', count: countOf('anomaly') },
    { id: 'decision', nameKey: 'operator.filter.decision', count: countOf('decision') },
  ]
  const selected = queue[0]
  return { filters, queue, selected, detail: buildDecisionDetail(selected) }
}

/** 构造项目卡片：真实项目名优先，进度 / 风险为演示值。 */
function buildProjectCards(raw: RawProjections): readonly ProjectCardModel[] {
  const projects = raw.projects ?? []
  if (projects.length === 0) {
    return DEMO_PROJECTS.map((project, index) => ({
      id: `project-demo-${index}`,
      name: demo(project.name),
      stage: demo(project.stage),
      progress: demo(project.progress),
      risk: demo(project.risk),
    }))
  }
  return projects.slice(0, 12).map((row, index) => {
    const name = row.title.trim() === '' ? undefined : row.title
    return {
      id: `project-${index}-${name ?? 'placeholder'}`,
      name: live(name, SOURCE.home),
      stage: demo('实施阶段'),
      progress: demo('62%'),
      risk: demo('中'),
    }
  })
}

/** 构造单项目 360 摘要：按项目序号取对应演示快照，点击不同项目时穿透信息跟随变化。 */
function buildProjectDetail(card: ProjectCardModel | undefined, cardIndex: number): ProjectDetailModel | undefined {
  if (card === undefined) return undefined
  const variant = PROJECT_VARIANTS[cardIndex % PROJECT_VARIANTS.length]
    ?? PROJECT_VARIANTS[0]
    ?? undefined
  const panels: PanelModel[] = PROJECT_PANELS.map((panel, panelIndex) => {
    // 演示快照的数值组与面板顺序一一对应（finance / stage / quality / risks / decisions / status）。
    const variantKey = ['finance', 'stage', 'quality', 'risks', 'decisions', 'status'][panelIndex]
    const values = variant === undefined || variantKey === undefined
      ? ['— — —', '— — —'] as const
      : variant[variantKey as keyof typeof variant]
    const drill = panelDrillDown(panel.id, values, card.name.value ?? '', cardIndex)
    return {
      id: panel.id,
      nameKey: panel.nameKey,
      source: panel.source,
      metrics: values.map(value => demo(value, panel.source)),
      fields: drill.fields,
      events: drill.events,
      nodes: drill.nodes,
      links: drill.links,
    }
  })
  return { projectId: card.id, projectName: card.name, panels }
}

/** 构造职能专题账本（演示行）。 */
function buildFunctional(): FunctionalScreenModel {
  const ledgers = LEDGER_SPECS.map(spec => ({
    id: spec.id,
    nameKey: spec.nameKey,
    table: spec.table,
    columnKeys: spec.columns,
    rows: spec.demoRows.map((row, rowIndex) =>
      row.map(cell => demo(cell, `${spec.table}#${rowIndex}`))),
  }))
  return { ledgers }
}

/** 构造证据链（演示摘要）。 */
function buildEvidence(): EvidenceScreenModel {
  return {
    chain: [
      { id: 'decision', nameKey: 'operator.evidence.decision', source: SOURCE.decisions, field: demo(DEMO_EVIDENCE.decision ?? '') },
      { id: 'record', nameKey: 'operator.evidence.record', source: SOURCE.records, field: demo(DEMO_EVIDENCE.record ?? '') },
      { id: 'document', nameKey: 'operator.evidence.document', source: 'controlled-documents', field: demo(DEMO_EVIDENCE.document ?? '') },
      { id: 'knowledge', nameKey: 'operator.evidence.knowledge', source: SOURCE.ontology, field: demo(DEMO_EVIDENCE.knowledge ?? '') },
    ],
  }
}

/** 构造经营总览的工时区块（弹窗展示各项目工时，按时间范围缩放）。 */
function buildLaborHours(period: OperatorPeriod): LaborHoursModel {
  return {
    projectRows: DEMO_LABOR.projects.map((row, index) => ({
      id: `labor-project-${index}`,
      project: row.project,
      inputHours: scaleHours(row.input, period),
      leaveHours: scaleHours(row.leave, period),
      netHours: scaleHours(row.input - row.leave, period),
    })),
  }
}

/**
 * 从原始投影快照组装完整的五屏视图模型。
 * @param raw - Home 投影数据。
 * @param period - 经营总览的时间范围档位，影响工时演示数据的缩放。
 */
export function buildOperatorViewModel(raw: RawProjections, period: OperatorPeriod = 'month'): OperatorViewModel {
  const queue = buildQueue(raw)
  const cards = buildProjectCards(raw)

  const overview: OverviewModel = {
    kpis: buildKpis(period),
    laborHours: buildLaborHours(period),
  }

  return {
    overview,
    decisions: buildDecisionCenter(queue),
    projects: {
      cards,
      detail: buildProjectDetail(cards[0], 0),
    } satisfies ProjectScreenModel,
    functional: buildFunctional(),
    evidence: buildEvidence(),
  }
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

/**
 * 选中项目卡片并派生其 360 摘要（纯函数）。
 * @param model - 项目穿透页视图模型。
 * @param id - 要选中的卡片 id；undefined 表示沿用默认选中项。
 * @returns 带所选项目详情的新模型；穿透信息随所选项目变化。
 */
export function selectProjectCard(model: ProjectScreenModel, id: string | undefined): ProjectScreenModel {
  // 未显式选择时，沿用模型默认的详情。
  if (id === undefined) return model
  const cardIndex = model.cards.findIndex(item => item.id === id)
  if (cardIndex < 0) return model
  const card = model.cards[cardIndex]
  return { ...model, detail: buildProjectDetail(card, cardIndex) }
}

/**
 * 按类别过滤风险与决策中心的队列（纯函数）。
 * @param model - 决策中心视图模型（queue 为全量队列）。
 * @param filterId - 筛选档位 id：'all' 或事项类别（'risk' / 'anomaly' / 'decision'）。
 * @returns 队列被过滤后、默认选中第一项的新模型。
 */
export function filterDecisionQueue(model: DecisionCenterModel, filterId: string): DecisionCenterModel {
  const queue = filterId === 'all'
    ? model.queue
    : model.queue.filter(item => item.kind === filterId)
  const selected = queue[0]
  return { ...model, queue, selected, detail: buildDecisionDetail(selected) }
}

/**
 * 项目面板中各指标的文案 key，顺序与 `PanelModel.metrics` 一致。
 * 单独导出是为了让展示层翻译指标标签时，
 * 视图模型无需携带框架特定的文案类型。
 */
export function metricKeysForPanel(panelId: string): readonly OperatorLocaleKey[] {
  return PROJECT_PANELS.find(panel => panel.id === panelId)?.metrics ?? []
}
