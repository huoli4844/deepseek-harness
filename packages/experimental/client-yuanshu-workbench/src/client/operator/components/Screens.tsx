/**
 * 运营者工作台的五个页面。
 *
 * 每个页面只是其视图模型切片与翻译函数的纯函数。
 * 选中状态由容器持有，通过回调 / 选中 id 传入；
 * 页面本身既不请求数据，也不持有状态。
 */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Severity } from '../model.ts'
import type {
  DecisionCenterModel,
  EvidenceScreenModel,
  FunctionalScreenModel,
  OverviewModel,
  ProjectScreenModel,
} from '../model.ts'
import { metricKeysForPanel } from '../viewmodel.ts'
import { EmptyLine, FieldValue, Provenance, Section, type OperatorT } from './Primitives.tsx'
import css from '../operator.module.css'

/** 严重度 → 颜色 token（红=超期，琥珀=待处理，无=中性）。 */
function severityTone(severity: Severity): 'danger' | 'warning' | 'neutral' {
  return severity === 'overdue' ? 'danger' : severity === 'pending' ? 'warning' : 'neutral'
}

/**
 * 页面一 — 经营总览：4 张 KPI 卡 + 两个队列 + 数据健康提示。
 * @param props.model - 经营总览视图模型。
 * @param props.t - 命名空间翻译函数。
 * @param props.onDecision - 按决策 id 打开异常与决策中心。
 */
export function OverviewScreen({ model, t, onDecision }: {
  readonly model: OverviewModel
  readonly t: OperatorT
  readonly onDecision: (id: string) => void
}) {
  return <div className={css.screen}>
    <div className={css.contextBar}>
      <span>{t('operator.label.role')}: {model.role.value ?? t('operator.value.roleUnknown')}</span>
      <span>{t('operator.label.period')}: {t('operator.value.period')}</span>
      <span>{t('operator.label.freshness')}: {model.freshness.value ?? t('operator.value.noFreshness')}</span>
    </div>

    <Section title={t('operator.section.kpi')}>
      <div className={css.kpiGrid}>
        {model.kpis.map(kpi => <article key={kpi.id} className={css.kpiCard}>
          <h3>{t(kpi.nameKey)}</h3>
          <FieldValue field={kpi.value} t={t} emphasis />
          <p className={css.kpiDefinition}>
            <span className={css.definitionLabel}>{t('operator.label.definition')}:</span>{' '}
            {t(kpi.definitionKey)}
          </p>
        </article>)}
      </div>
    </Section>

    <div className={css.twoColumn}>
      <Section title={t('operator.section.anomaly')}>
        <div className={css.anomalyGrid}>
          {model.anomalies.map(anomaly => <button
            key={anomaly.id}
            className={css.anomalyCard}
            onClick={() => { onDecision(anomaly.id) }}
          >
            <span>{t(anomaly.nameKey)}</span>
            <FieldValue field={anomaly.count} t={t} emphasis />
          </button>)}
        </div>
      </Section>

      <Section title={t('operator.section.decision')}>
        {model.decisions.length === 0
          ? <EmptyLine text={t('operator.detail.empty')} />
          : <ul className={css.list}>
            {model.decisions.map(decision => <li key={decision.id}>
              <button className={css.linkRow} onClick={() => { onDecision(decision.id) }}>
                <FieldValue field={decision.title} t={t} />
              </button>
            </li>)}
          </ul>}
      </Section>
    </div>

    <p className={css.health}><Tag tone="warning">{t('operator.section.health')}</Tag> {t(model.healthNoticeKey)}</p>
  </div>
}

/**
 * 页面二 — 异常与决策：左侧队列，右侧详情抽屉。
 */
export function DecisionScreen({ model, t, onSelect }: {
  readonly model: DecisionCenterModel
  readonly t: OperatorT
  readonly onSelect: (id: string) => void
}) {
  return <div className={css.screen}>
    <div className={css.filterRow}>
      {model.filters.map(filter => <Tag key={filter.id} tone={filter.id === 'all' ? 'solid' : 'outline'}>
        {t(filter.nameKey)} <Provenance tier={filter.count.tier} source={filter.count.source} t={t} />
      </Tag>)}
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
                <span className={css.queueTitle}>{item.title.value ?? '— — —'}</span>
                <small>{item.meta.value ?? t('operator.value.noFreshness')}</small>
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
              {model.detail.facts.map((fact, index) => <li key={index}><FieldValue field={fact} t={t} /></li>)}
            </ul>
            <h4>{t('operator.detail.evidence')}</h4>
            <ul className={css.factList}>
              {model.detail.evidence.map((evidence, index) => <li key={index}><FieldValue field={evidence} t={t} /></li>)}
            </ul>
            <h4>{t('operator.detail.suggestion')}</h4>
            <FieldValue field={model.detail.suggestion} t={t} />
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
  </div>
}

/**
 * 页面三 — 项目穿透：项目组合卡片，选中后按需加载 360 摘要。
 */
export function ProjectScreen({ model, t, onSelect }: {
  readonly model: ProjectScreenModel
  readonly t: OperatorT
  readonly onSelect: (id: string) => void
}) {
  const detail = model.detail
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
            <FieldValue field={card.name} t={t} />
            <small>{t('operator.metric.currentStage')}: {card.stage.value ?? '— — —'}</small>
            <small>{t('operator.metric.stageProgress')}: {card.progress.value ?? '— — —'}</small>
          </button>)}
        </div>}
    </Section>

    <Section title={t('operator.screen.projects')}>
      {detail === undefined
        ? <EmptyLine text={t('operator.project.selectHint')} />
        : <div className={css.panelGrid}>
          {detail.panels.map((panel) => {
            const keys = metricKeysForPanel(panel.id)
            return <article key={panel.id} className={css.panel}>
              <h3>{t(panel.nameKey)}</h3>
              <ul>
                {panel.metrics.map((metric, metricIndex) => <li key={metricIndex}>
                  <span>{t(keys[metricIndex] ?? 'operator.label.tier')}:</span>{' '}
                  <FieldValue field={metric} t={t} />
                </li>)}
              </ul>
              <small className={css.panelSource}>{t('operator.label.source')} · {panel.source}</small>
            </article>
          })}
        </div>}
    </Section>
  </div>
}

/**
 * 页面四 — 职能专题：表格骨架 + 占位行。
 */
export function FunctionalScreen({ model, t }: {
  readonly model: FunctionalScreenModel
  readonly t: OperatorT
}) {
  return <div className={css.screen}>
    <p className={css.note}>{t('operator.functional.note')}</p>
    {model.ledgers.length === 0
      ? <EmptyLine text={t('operator.functional.empty')} />
      : model.ledgers.map(ledger => <Section key={ledger.id} title={t(ledger.nameKey)}>
        <p className={css.panelSource}>{t('operator.label.source')} · {ledger.table}</p>
        <table className={css.table}>
          <thead><tr>{ledger.columnKeys.map((key, index) => <th key={index}>{t(key)}</th>)}</tr></thead>
          <tbody>
            {ledger.rows.map((row, rowIndex) => <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>
                <FieldValue field={cell} t={t} />
              </td>)}
            </tr>)}
          </tbody>
        </table>
      </Section>)}
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
    <p className={css.note}>{t('operator.evidence.note')}</p>
    <Section title={t('operator.evidence.title')}>
      <ol className={css.chain}>
        {model.chain.map((node, index) => <li key={node.id} className={css.chainNode}>
          <span className={css.chainIndex}>{index + 1}</span>
          <div>
            <strong>{t(node.nameKey)}</strong>
            <FieldValue field={node.field} t={t} />
          </div>
        </li>)}
      </ol>
    </Section>
  </div>
}
