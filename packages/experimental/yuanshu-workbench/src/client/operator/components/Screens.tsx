/**
 * 运营者工作台的五个页面。
 *
 * 每个页面只是其视图模型切片与翻译函数的纯函数。
 * 选中状态与时间范围由容器持有，通过回调传入；
 * 页面本身既不请求数据，也不持有状态。
 * 界面上不展示接口状态 / 数据来源等元信息。
 */
import { useState } from 'react'
import { Button, Input, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Severity } from '../model.ts'
import type { KpiGroup, OperatorPeriod } from '../model.ts'
import type {
  DepartmentHealth,
  DepartmentSuggestion,
  DecisionCenterModel,
  EvidenceScreenModel,
  FunctionalScreenModel,
  OverviewModel,
  ProjectScreenModel,
  QueueItemModel,
} from '../model.ts'
import { metricKeysForPanel } from '../viewmodel.ts'
import { EmptyLine, FieldValue, PLACEHOLDER, Section, type OperatorT } from './Primitives.tsx'
import css from '../operator.module.css'
import tableCss from '../../shared/table.module.css'

/** 严重度 → 颜色 token（红=超期，琥珀=待处理，无=中性）。 */
function severityTone(severity: Severity): 'danger' | 'warning' | 'neutral' {
  return severity === 'overdue' ? 'danger' : severity === 'pending' ? 'warning' : 'neutral'
}

/** 时间范围档位 → 文案 key（右上角切换器选项：当前进展 / 当月 / 本季度 / 本年 / 总览）。 */
const PERIOD_OPTIONS: readonly { readonly id: OperatorPeriod; readonly nameKey: Parameters<OperatorT>[0] }[] = [
  { id: 'progress', nameKey: 'operator.period.progress' },
  { id: 'month', nameKey: 'operator.period.month' },
  { id: 'quarter', nameKey: 'operator.period.quarter' },
  { id: 'year', nameKey: 'operator.period.year' },
  { id: 'all', nameKey: 'operator.period.all' },
]

/** KPI 分组 → 分区标题文案 key（经营数据 / 人力资源 / 项目任务 / 质量总览）。 */
const KPI_GROUPS: readonly { readonly id: KpiGroup; readonly nameKey: Parameters<OperatorT>[0] }[] = [
  { id: 'finance', nameKey: 'operator.group.finance' },
  { id: 'people', nameKey: 'operator.group.people' },
  { id: 'task', nameKey: 'operator.group.task' },
  { id: 'quality', nameKey: 'operator.group.quality' },
]

/**
 * 页面一 — 经营总览：右上角时间范围切换 + 分组 KPI 卡（含可点击的人员总工时）。
 * @param props.model - 经营总览视图模型。
 * @param props.t - 命名空间翻译函数。
 * @param props.period - 当前时间范围档位。
 * @param props.onPeriodChange - 切换时间范围。
 * @param props.laborDetailOpen - 工时详情弹窗是否打开。
 * @param props.onOpenLaborDetail - 打开工时详情弹窗。
 * @param props.onCloseLaborDetail - 关闭工时详情弹窗。
 */
export function OverviewScreen({ model, t, period, onPeriodChange, laborDetailOpen, onOpenLaborDetail, onCloseLaborDetail }: {
  readonly model: OverviewModel
  readonly t: OperatorT
  readonly period: OperatorPeriod
  readonly onPeriodChange: (period: OperatorPeriod) => void
  readonly laborDetailOpen: boolean
  readonly onOpenLaborDetail: () => void
  readonly onCloseLaborDetail: () => void
}) {
  return <div className={css.screen}>
    {/* 时间范围切换器：固定在内容区右上角。 */}
    <div className={`${css.contextBar} ${css.periodBar}`} role="group" aria-label={t('operator.label.period')}>
      {PERIOD_OPTIONS.map(option => (
        <button
          key={option.id}
          className={option.id === period ? css.periodButtonActive : css.periodButton}
          onClick={() => { onPeriodChange(option.id) }}
          aria-pressed={option.id === period}
        >
          {t(option.nameKey)}
        </button>
      ))}
    </div>

    {/* KPI 按经营数据 / 人力资源 / 项目任务 / 质量总览四个分组展示。 */}
    {KPI_GROUPS.map((group) => {
      const groupKpis = model.kpis.filter(kpi => kpi.group === group.id)
      if (groupKpis.length === 0) return null
      return <Section key={group.id} title={t(group.nameKey)}>
        <div className={css.kpiGrid}>
          {groupKpis.map((kpi) => {
            // 完成率颜色档位：达标绿 / 接近琥珀 / 落后红（无目标的档位不显示）。
            const toneClass = kpi.attainmentTone === 'ok'
              ? css.kpiAttainOk
              : kpi.attainmentTone === 'warn' ? css.kpiAttainWarn : css.kpiAttainRisk
            const body = <>
              <h3>{t(kpi.nameKey)}</h3>
              <FieldValue field={kpi.value} emphasis />
              {kpi.target !== undefined && <p className={css.kpiTarget}>
                {t('operator.label.target')}: {kpi.target.value ?? PLACEHOLDER}
                {' · '}
                <span className={toneClass}>{t('operator.label.attainment')} {kpi.attainment}</span>
              </p>}
            </>
            // 人员总工时等可交互 KPI 渲染为按钮，点击打开详情弹窗。
            return kpi.interactive
              ? <button key={kpi.id} type="button" className={css.kpiCard} onClick={onOpenLaborDetail}>{body}</button>
              : <article key={kpi.id} className={css.kpiCard}>{body}</article>
          })}
        </div>
      </Section>
    })}

    {/* 工时详情弹窗：由人员总工时 KPI 卡打开，展示各项目的投入 / 请假 / 净工时。 */}
    {laborDetailOpen && <Modal open title={t('operator.labor.modalTitle')} closeLabel={t('close')} onClose={onCloseLaborDetail}>
      <div className={tableCss.tableWrap}>
        <table className={tableCss.table}>
          <thead><tr>
            <th>{t('operator.col.laborProject')}</th>
            <th>{t('operator.col.laborInput')}</th>
            <th>{t('operator.col.laborLeave')}</th>
            <th>{t('operator.col.laborNet')}</th>
          </tr></thead>
          <tbody>
            {model.laborHours.projectRows.map(row => <tr key={row.id}>
              <td>{row.project}</td>
              <td>{row.inputHours}</td>
              <td>{row.leaveHours}</td>
              <td>{row.netHours}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Modal>}
  </div>
}

/** AI 推理弹窗中的一条对话消息。 */
interface AiChatMessage {
  readonly role: 'user' | 'assistant'
  readonly text: string
}

/** 预设追问（label 为文案 key，reply 为演示回复内容）。 */
const AI_FOLLOWUPS: readonly { readonly id: string; readonly labelKey: 'operator.ai.qCause' | 'operator.ai.qAction'; readonly reply: 'operator.ai.reasonCause' | 'operator.ai.reasonAction' }[] = [
  {
    id: 'cause', labelKey: 'operator.ai.qCause',
    reply: 'operator.ai.reasonCause',
  },
  {
    id: 'action', labelKey: 'operator.ai.qAction',
    reply: 'operator.ai.reasonAction',
  },
]

/** 由队列事项构造 AI 的开场推理（演示数据，无真实推理）。 */
function aiOpeningMessages(item: QueueItemModel, t: OperatorT): AiChatMessage[] {
  const title = item.title.value ?? t('operator.ai.caseFallback')
  const meta = item.meta.value ?? ''
  return [
    {
      role: 'assistant',
      text: t('operator.ai.reasonOpening', { title, source: meta === '' ? '' : t('operator.ai.reasonSource', { meta }) }),
    },
    {
      role: 'assistant',
      text: t('operator.ai.reasonProcess'),
    },
    {
      role: 'assistant',
      text: t('operator.ai.reasonConclusion'),
    },
  ]
}

/**
 * 页面二 — 风险与决策：顶部分类筛选 tab（风险事件 / 异常事件 / 决策），
 * 左侧队列（每条事项右上角带 AI 过程推理入口），右侧详情（事件要素 + 影响域分析 + 建议方案）。
 */
export function DecisionScreen({ model, t, activeFilter, onFilterChange, onSelect }: {
  readonly model: DecisionCenterModel
  readonly t: OperatorT
  readonly activeFilter: string
  readonly onFilterChange: (filterId: string) => void
  readonly onSelect: (id: string) => void
}) {
  // AI 事件过程推理弹窗：当前事项 + 对话消息 + 输入草稿（演示模式，无真实推理）。
  const [aiItem, setAiItem] = useState<QueueItemModel>()
  const [aiMessages, setAiMessages] = useState<readonly AiChatMessage[]>([])
  const [aiDraft, setAiDraft] = useState('')
  const openAiReasoning = (item: QueueItemModel): void => {
    setAiItem(item)
    setAiMessages(aiOpeningMessages(item, t))
    setAiDraft('')
  }
  const askAiFollowup = (reply: string, label: string): void => {
    setAiMessages(previous => [...previous, { role: 'user', text: label }, { role: 'assistant', text: reply }])
  }
  const sendAiMessage = (): void => {
    const text = aiDraft.trim()
    if (text === '' || aiItem === undefined) return
    setAiMessages(previous => [
      ...previous,
      { role: 'user', text },
      { role: 'assistant', text: t('operator.ai.fallbackReply') },
    ])
    setAiDraft('')
  }
  return <div className={css.screen}>
    {/* 分类筛选 tab：点击后队列只显示对应分类的事项。 */}
    <div className={css.filterRow} role="group" aria-label={t('operator.filter.all')}>
      {model.filters.map(filter => (
        <button
          key={filter.id}
          className={filter.id === activeFilter ? css.filterButtonActive : css.filterButton}
          onClick={() => { onFilterChange(filter.id) }}
          aria-pressed={filter.id === activeFilter}
        >
          {t(filter.nameKey)} · {filter.count.value ?? PLACEHOLDER}
        </button>
      ))}
    </div>
    <div className={css.decisionLayout}>
      <Section title={t('operator.screen.decisions')} className={css.queuePane}>
        {model.queue.length === 0
          ? <EmptyLine text={t('operator.detail.empty')} />
          : <ul className={css.list}>
            {model.queue.map(item => <li key={item.id}>
              <button
                className={item.id === model.selected?.id ? css.queueItemActive : css.queueItem}
                onClick={() => { onSelect(item.id) }}
              >
                <Tag tone={severityTone(item.severity)}>{t(item.categoryKey)}</Tag>
                <span className={css.queueTitle}>{item.title.value ?? PLACEHOLDER}</span>
                <small>{item.meta.value ?? PLACEHOLDER}</small>
                {/* AI 过程推理入口：右上角徽标，点击打开演示对话弹窗。 */}
                <span
                  role="button"
                  tabIndex={0}
                  className={css.aiBadge}
                  aria-label={`${t('operator.ai.open')}: ${item.title.value ?? ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    openAiReasoning(item)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      openAiReasoning(item)
                    }
                  }}
                >{t('operator.ai.badge')}</span>
              </button>
            </li>)}
          </ul>}
      </Section>

      <Section title={t('operator.detail.facts')} className={css.detailPane}>
        {model.detail === undefined
          ? <EmptyLine text={t('operator.detail.selectHint')} />
          : <>
            <h4>{t('operator.detail.facts')}</h4>
            <ul className={css.factList}>
              {model.detail.facts.map(fact => <li key={fact.label}>
                <strong>{fact.label}</strong>：{fact.value}
              </li>)}
            </ul>
            <h4>{t('operator.detail.impacts')}</h4>
            <ul className={css.factList}>
              {model.detail.impacts.map(impact => <li key={impact.dimension}>
                <Tag tone={impact.dimension === '财务' ? 'warning' : 'neutral'}>{impact.dimension}</Tag>
                {' '}
                <span>{impact.detail}</span>
              </li>)}
            </ul>
            <h4>{t('operator.detail.suggestion')}</h4>
            <FieldValue field={model.detail.suggestion} />
            <h4>{t('operator.detail.actions')}</h4>
            <div className={css.actionRow}>
              {model.detail.actions.map(action => <span key={action.id} className={css.actionWrap}>
                <Button disabled>{t(action.labelKey)}</Button>
                <small className={css.actionNote}>{t(action.noteKey)}</small>
              </span>)}
            </div>
          </>}
      </Section>
    </div>

    {/* AI 事件过程推理弹窗：演示对话，开场推理 + 预设追问 + 自由输入。 */}
    {aiItem !== undefined && <Modal
      open
      title={t('operator.ai.title')}
      closeLabel={t('close')}
      onClose={() => { setAiItem(undefined) }}
    >
      <p className={css.aiDemoNote}>{t('operator.ai.demoNote')}</p>
      <div className={css.aiChat} aria-live="polite">
        {aiMessages.map((message, index) => <div
          key={index}
          className={message.role === 'user'
            ? `${css.aiMessage} ${css.aiMessageUser}`
            : `${css.aiMessage} ${css.aiMessageAssistant}`}
        >{message.text}</div>)}
      </div>
      <div className={css.aiChips}>
        {AI_FOLLOWUPS.map(followup => <Button
          key={followup.id}
          size="sm"
          onClick={() => { askAiFollowup(t(followup.reply), t(followup.labelKey)) }}
        >{t(followup.labelKey)}</Button>)}
      </div>
      <div className={css.aiInputRow}>
        <Input
          value={aiDraft}
          placeholder={t('operator.ai.inputPlaceholder')}
          onChange={(event) => { setAiDraft(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { sendAiMessage() }
          }}
        />
        <Button size="sm" disabled={!aiDraft.trim()} onClick={sendAiMessage}>{t('operator.ai.send')}</Button>
      </div>
    </Modal>}
  </div>
}

/** 穿透节点状态 → 颜色 class（完成绿 / 进行中蓝 / 待处理灰 / 风险红）。 */
function nodeToneClass(cssObj: typeof css, status: string): string {
  switch (status) {
    case 'done': return cssObj.nodeDone ?? ''
    case 'active': return cssObj.nodeActive ?? ''
    case 'risk': return cssObj.nodeRisk ?? ''
    default: return cssObj.nodePending ?? ''
  }
}

/**
 * 页面三 — 项目穿透：项目总览卡片 + 六个维度穿透面板；
 * 点击面板卡片后，下方穿透节点区展示该维度的事件、补充信息、原件与节点时间线。
 */
export function ProjectScreen({ model, t, onSelect }: {
  readonly model: ProjectScreenModel
  readonly t: OperatorT
  readonly onSelect: (id: string) => void
}) {
  const detail = model.detail
  // 当前展开穿透明细的面板 id（默认财务）；与原件预览弹窗状态。
  const [activePanelId, setActivePanelId] = useState('finance')
  const [previewLink, setPreviewLink] = useState<{ label: string; meta: string } | undefined>()
  const activePanel = detail?.panels.find(panel => panel.id === activePanelId)
    ?? detail?.panels[0]
  return <div className={css.screen}>
    <Section title={t('operator.project.portfolio')}>
      {model.cards.length === 0
        ? <EmptyLine text={t('operator.project.empty')} />
        : <div className={css.projectGrid}>
          {model.cards.map(card => <button
            key={card.id}
            className={detail?.projectId === card.id ? css.projectCardActive : css.projectCard}
            onClick={() => { onSelect(card.id) }}
          >
            <FieldValue field={card.name} />
            <small>{t('operator.metric.currentStage')}: {card.stage.value ?? PLACEHOLDER}</small>
            <small>{t('operator.metric.stageProgress')}: {card.progress.value ?? PLACEHOLDER}</small>
          </button>)}
        </div>}
    </Section>

    <Section title={t('operator.screen.projects')}>
      {detail === undefined
        ? <EmptyLine text={t('operator.project.selectHint')} />
        : <div className={css.panelGrid}>
          {detail.panels.map(panel => (
            <button
              key={panel.id}
              type="button"
              className={panel.id === activePanel?.id ? css.panelActive : css.panel}
              onClick={() => { setActivePanelId(panel.id) }}
              aria-pressed={panel.id === activePanel?.id}
            >
              <h3>{t(panel.nameKey)}</h3>
              <ul>
                {panel.metrics.map((metric, metricIndex) => <li key={metricIndex}>
                  <span>{t(metricKeysForPanel(panel.id)[metricIndex] ?? 'operator.label.tier')}:</span>{' '}
                  <FieldValue field={metric} />
                </li>)}
              </ul>
            </button>
          ))}
        </div>}
    </Section>

    {/* 穿透节点区：所选维度的事件、补充信息、原件与节点时间线。 */}
    {activePanel !== undefined && <Section title={t('operator.project.drillDown')}>
      <div className={css.drillLayout}>
        <div className={css.drillMain}>
          {/* 补充信息：合同编号、签订时间、付款比例、对接人与甲方、我方项目组等。 */}
          {activePanel.fields.length > 0 && <div className={css.drillFields}>
            {activePanel.fields.map(item => <div key={item.label} className={css.drillField}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>)}
          </div>}

          {/* 可点击原件：点击后弹窗预览。 */}
          {activePanel.links.length > 0 && <div className={css.drillLinks}>
            {activePanel.links.map(link => <button
              key={link.id}
              type="button"
              className={css.drillLink}
              onClick={() => { setPreviewLink({ label: link.label, meta: link.meta }) }}
            >
              <strong>{link.label}</strong>
              <small>{link.meta}</small>
            </button>)}
          </div>}

          {/* 业务事件：时间 + 标题 + 明细。 */}
          {activePanel.events.length > 0 && <ul className={css.eventList}>
            {activePanel.events.map((event, index) => <li key={index}>
              <span className={css.eventTime}>{event.time}</span>
              <span className={css.eventTitle}>{event.title}</span>
              <span className={css.eventDetail}>{event.detail}</span>
            </li>)}
          </ul>}
        </div>

        {/* 穿透节点时间线。 */}
        {activePanel.nodes.length > 0 && <ol className={css.nodeTrack} aria-label={t('operator.project.drillDown')}>
          {activePanel.nodes.map((node, index) => <li key={index} className={nodeToneClass(css, node.status)}>
            <span className={css.nodeDot} aria-hidden />
            <strong>{node.label}</strong>
            <small>{node.detail}</small>
          </li>)}
        </ol>}
      </div>
    </Section>}

    {/* 原件预览弹窗：合同原件等文件的演示预览。 */}
    {previewLink !== undefined && <Modal
      open
      title={previewLink.label}
      closeLabel={t('close')}
      onClose={() => { setPreviewLink(undefined) }}
    >
      <p className={css.previewMeta}>{previewLink.meta}</p>
      <div className={css.previewBody}>
        <p>{t('operator.project.previewNote')}</p>
        <p>{t('operator.project.previewTerm1')}</p>
        <p>{t('operator.project.previewTerm2')}</p>
        <p>{t('operator.project.previewTerm3')}</p>
        <p>{t('operator.project.previewTerm4')}</p>
      </div>
    </Modal>}
  </div>
}

/**
 * 页面四 — 职能专题：公司运营视角的部门综合状态与优化调整建议。
 */
export function FunctionalScreen({ model, t }: {
  readonly model: FunctionalScreenModel
  readonly t: OperatorT
}) {
  const healthTone = (health: DepartmentHealth): 'success' | 'warning' | 'danger' =>
    health === 'good' ? 'success' : health === 'watch' ? 'warning' : 'danger'
  const priorityTone = (priority: DepartmentSuggestion['priority']): 'danger' | 'warning' | 'neutral' =>
    priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral'
  const priorityKey = (priority: DepartmentSuggestion['priority']): 'operator.functional.priority.high' | 'operator.functional.priority.medium' | 'operator.functional.priority.low' =>
    priority === 'high' ? 'operator.functional.priority.high'
      : priority === 'medium' ? 'operator.functional.priority.medium'
        : 'operator.functional.priority.low'
  return <div className={css.screen}>
    {/* 部门综合状态：公司运营视角下各职能部门的健康度与关键指标。 */}
    <Section title={t('operator.functional.statusTitle')}>
      {model.departments.length === 0
        ? <EmptyLine text={t('operator.functional.empty')} />
        : <div className={css.deptGrid}>
          {model.departments.map(department => <article key={department.id} className={css.deptCard}>
            <div className={css.deptHead}>
              <h3>{t(department.nameKey)}</h3>
              <Tag tone={healthTone(department.health)}>{t(`operator.functional.health.${department.health}`)}</Tag>
            </div>
            <ul className={css.deptMetrics}>
              {department.metrics.map((metric, index) => <li key={index}>
                <span>{metric.label}:</span>{' '}
                <strong>{metric.value}</strong>
              </li>)}
            </ul>
          </article>)}
        </div>}
    </Section>

    {/* 优化调整建议：按部门汇总，附优先级与数据依据。 */}
    <Section title={t('operator.functional.suggestionTitle')}>
      <ul className={css.suggestionList}>
        {model.departments.flatMap(department => department.suggestions.map((suggestion, index) => (
          <li key={`${department.id}-${index}`} className={css.suggestionItem}>
            <Tag tone={priorityTone(suggestion.priority)}>{t(priorityKey(suggestion.priority))}</Tag>
            <span className={css.suggestionBody}>
              <strong>{t(department.nameKey)} · {suggestion.text}</strong>
              <small>{suggestion.basis}</small>
            </span>
          </li>
        )))}
      </ul>
    </Section>
  </div>
}

/**
 * 页面五 — 证据与追溯：四节点证据链。
 */
export function EvidenceScreen({ model, t }: {
  readonly model: EvidenceScreenModel
  readonly t: OperatorT
}) {
  return <div className={css.screen}>
    <Section title={t('operator.evidence.title')}>
      <ol className={css.chain}>
        {model.chain.map((node, index) => <li key={node.id} className={css.chainNode}>
          <span className={css.chainIndex}>{index + 1}</span>
          <div>
            <strong>{t(node.nameKey)}</strong>
            <FieldValue field={node.field} />
          </div>
        </li>)}
      </ol>
    </Section>
  </div>
}
