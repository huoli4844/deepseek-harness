/** Role-specific charts with visible labels and keyboard-accessible data details. */
import { useState } from 'react'
import { Button, Modal, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DashboardChart, DashboardKey } from './dashboard-data.ts'
import type { TaskId } from './model.ts'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import css from './DashboardCharts.module.css'

type ChartProps = PropsLocale<'yuanshu.workbench'> & {
  readonly charts: readonly DashboardChart[]
  readonly tasks: readonly [TaskId, TaskId, TaskId]
  readonly onTask: (task: TaskId) => void
}

const levels = ['chart.low', 'chart.medium', 'chart.high'] as const

function unitKey(chart: DashboardChart): DashboardKey {
  return chart.kind === 'comparison'
    ? 'chart.percentUnit'
    : chart.kind === 'columns' && chart.unit === 'money'
      ? 'chart.moneyUnit'
      : 'chart.itemsUnit'
}

/**
 * Present chart cards and their raw data without connecting to a backend.
 * @param props - Localized chart scenarios, linked tasks, and task navigation.
 * @returns chart sections plus the selected chart's DSH detail dialog.
 */
export function DashboardCharts({ t, charts, tasks, onTask }: ChartProps) {
  const [selected, setSelected] = useState<DashboardChart | null>(null)
  const drawing = (chart: DashboardChart) => {
    switch (chart.kind) {
      case 'distribution': {
        const total = chart.points.reduce((sum, point) => sum + point.value, 0)
        let offset = 0
        return (
          <div className={css.distribution}>
            <svg viewBox="0 0 160 160" className={css.donut} aria-hidden="true">
              <circle className={css.track} cx="80" cy="80" r="58" />
              {chart.points.map((point, index) => {
                const share = (point.value / total) * 100
                const start = offset
                offset += share
                return (
                  <circle
                    key={point.label}
                    className={css.segment}
                    data-series={index}
                    cx="80"
                    cy="80"
                    r="58"
                    pathLength="100"
                    strokeDasharray={`${share} ${100 - share}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 80 80)"
                  />
                )
              })}
              <text x="80" y="78" className={css.total}>
                {total}
              </text>
              <text x="80" y="99" className={css.totalLabel}>
                {t('chart.totalLabel')}
              </text>
            </svg>
            <div className={css.legend}>
              {chart.points.map((point, index) => (
                <div key={point.label}>
                  <i className={css.swatch} data-series={index} aria-hidden="true" />
                  <span>{t(point.label)}</span>
                  <b>{point.value}</b>
                </div>
              ))}
            </div>
          </div>
        )
      }
      case 'comparison':
        return (
          <div className={css.comparison}>
            <div className={css.seriesLabels}>
              <span>{t('chart.actual')}</span>
              <span>{t('chart.plan')} ┆</span>
            </div>
            {chart.points.map(point => (
              <div key={point.label} className={css.comparisonRow}>
                <div>
                  <span>{t(point.label)}</span>
                  <b>
                    {point.value}% <small>/ {point.target}%</small>
                  </b>
                </div>
                <div className={css.bulletTrack}>
                  <span className={css.bulletValue} style={{ width: `${point.value}%` }} />
                  <i className={css.bulletTarget} style={{ left: `${point.target}%` }} />
                </div>
              </div>
            ))}
            <div className={css.scale}>
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        )
      case 'columns': {
        const max = Math.ceil(Math.max(...chart.points.flatMap(point => [point.value, point.target])) / 10) * 10
        return (
          <div className={css.columns}>
            <div className={css.seriesLabels}>
              <span>
                <i className={css.actualKey} />
                {t('chart.actual')}
              </span>
              <span>
                <i className={css.planKey} />
                {t('chart.plan')}
              </span>
            </div>
            <svg viewBox="0 0 360 190" className={css.columnSvg} aria-hidden="true">
              {[0, 0.5, 1].map(ratio => (
                <g key={ratio}>
                  <line x1="28" x2="355" y1={153 - ratio * 122} y2={153 - ratio * 122} />
                  <text x="2" y={157 - ratio * 122}>
                    {max * ratio}
                  </text>
                </g>
              ))}
              {chart.points.map((point, index) => (
                <g key={point.label}>
                  <rect
                    className={css.planColumn}
                    x={40 + index * 53}
                    y={153 - (point.target / max) * 122}
                    width="13"
                    height={(point.target / max) * 122}
                    rx="2"
                  />
                  <rect
                    className={css.actualColumn}
                    x={55 + index * 53}
                    y={153 - (point.value / max) * 122}
                    width="13"
                    height={(point.value / max) * 122}
                    rx="2"
                  />
                  <text className={css.columnValue} x={61 + index * 53} y={148 - (point.value / max) * 122}>
                    {point.value}
                  </text>
                  <text className={css.columnLabel} x={54 + index * 53} y="178">
                    {t(point.label)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        )
      }
      case 'matrix':
        return (
          <div className={css.matrix}>
            <div className={css.matrixAxis}>{t('chart.impact')} ↑</div>
            {([2, 1, 0] as const).map(impact => (
              <div key={impact} className={css.matrixRow}>
                <span>{t(levels[impact])}</span>
                {([0, 1, 2] as const).map(urgency => (
                  <div
                    key={urgency}
                    className={css.riskCell}
                    data-risk={impact + urgency}
                    aria-label={t('chart.riskCell', {
                      impact: t(levels[impact]),
                      urgency: t(levels[urgency]),
                      value: chart.cells[impact * 3 + urgency] ?? 0,
                    })}
                  >
                    {chart.cells[impact * 3 + urgency]}
                  </div>
                ))}
              </div>
            ))}
            <div className={css.matrixRow}>
              <span />
              {levels.map(level => (
                <span key={level}>{t(level)}</span>
              ))}
            </div>
            <div className={css.matrixBottom}>{t('chart.urgency')} →</div>
          </div>
        )
      default:
        return assertNever(chart)
    }
  }
  return (
    <>
      {charts.map(chart => (
        <section className={css.card} key={chart.id} aria-label={t(chart.title)} data-dashboard-chart={chart.kind}>
          <div className={css.heading}>
            <h2>{t(chart.title)}</h2>
            <small>{t(unitKey(chart))}</small>
          </div>
          <button
            className={css.plot}
            onClick={() => {
              setSelected(chart)
            }}
            aria-label={t('chart.open', { title: t(chart.title) })}
          >
            {drawing(chart)}
          </button>
          <span className={css.caption}>
            {t('chart.tap')} <span aria-hidden="true">↗</span>
          </span>
        </section>
      ))}
      <Modal
        open={selected !== null}
        title={selected === null ? t('chart.details') : t(selected.title)}
        closeLabel={t('close')}
        onClose={() => {
          setSelected(null)
        }}
        className={`${css.detail}`}
      >
        {selected !== null && (
          <>
            <Tag>{t('demoSample')}</Tag>
            <p className={css.detailNote}>{t('chart.demoDetails')}</p>
            <p className={css.detailNote}>{t(unitKey(selected))}</p>
            <div className={css.tableScroll}>
              <table className={css.dataTable}>
                <thead>
                  <tr>
                    <th>{t('chart.dimension')}</th>
                    <th>{t('chart.value')}</th>
                    {selected.kind !== 'matrix' && selected.kind !== 'distribution' && <th>{t('chart.target')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {selected.kind === 'matrix'
                    ? ([2, 1, 0] as const).flatMap(impact =>
                      ([0, 1, 2] as const).map(urgency => (
                        <tr key={`${impact}:${urgency}`}>
                          <td>
                            {t('chart.impact')} {t(levels[impact])} · {t('chart.urgency')} {t(levels[urgency])}
                          </td>
                          <td>{selected.cells[impact * 3 + urgency]}</td>
                        </tr>
                      )),
                    )
                    : selected.points.map(point => (
                      <tr key={point.label}>
                        <td>{t(point.label)}</td>
                        <td>
                          {point.value}
                          {selected.kind === 'comparison' ? '%' : ''}
                        </td>
                        {'target' in point && (
                          <td>
                            {point.target}
                            {selected.kind === 'comparison' ? '%' : ''}
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                onTask(tasks[selected.taskIndex])
                setSelected(null)
              }}
            >
              {t('chart.related')}
            </Button>
          </>
        )}
      </Modal>
    </>
  )
}
