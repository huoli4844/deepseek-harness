/**
 * 多个菜单页面共用的展示部件：均从 `useWorkbenchPage()` 取上下文，不带业务 props。
 * 由 Workbench 外壳与各 Screen 组件复用（如仪表盘与今日工作都要渲染任务行）。
 */
import { Button, Checkbox, Tag, IconChecklistOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../core/fixtures.ts'
import { roleMethods } from '../core/data/methodology-data.ts'
import { positionSignals } from '../core/data/position-operations.ts'
import { useWorkbenchPage } from './page-api.ts'
import type { DraftVersion } from '../core/model.ts'
import type { WorkbenchKey } from '../core/locales/locales.ts'
import css from './Workbench.module.css'

/** 岗位收件箱提醒：项目角色无岗位信号，返回 null。 */
export function PositionAlert() {
  const page = useWorkbenchPage()
  const { t, role, positionCase, selectView } = page
  if (role === 'project') return null
  const signal = positionSignals[role]
  const description = {
    attention: `position.${role}.impact`,
    waiting: 'position.queueWaiting',
    review: 'position.queueReview',
    rework: 'position.queueRework',
    accepted: 'position.queueAccepted',
  } as const
  const status = positionCase?.status ?? 'attention'
  return (
    <section className={css.card} aria-label={t('position.inbox')}>
      <div className={css.positionAlert}>
        <div>
          <p className={css.eyebrow}>{t('position.inbox')} · {t(signal.metric)}</p>
          <h2>{t(`position.${role}.title`)}</h2>
          <p>{t(description[status])}</p>
          <small>{t(`position.${role}.source`)}</small>
        </div>
        <div className={css.assistantActions}>
          <Tag>{t(`position.status.${status}`)}</Tag>
          <Button variant="outline" onClick={() => { selectView('position-operations') }}>{t('position.open')}</Button>
        </div>
      </div>
    </section>
  )
}

/**
 * 角色指标六周趋势图（演示 SVG）。默认随当前角色取数；跨页面固定展示某一角色的
 * 趋势时（如项目管理页的采购卡），传入 `trend` 与 `titleKey` 固定数据与标题。
 */
export function TrendChart(props: { readonly trend?: readonly number[]; readonly titleKey?: WorkbenchKey } = {}) {
  const page = useWorkbenchPage()
  const { t, role, fixture, selectView } = page
  const trend = props.trend ?? fixture.trend
  const titleKey = props.titleKey ?? `${role}.chart`
  const coords = trend.map((value, i) => `${32 + i * 60},${160 - value * 1.3}`).join(' ')
  return (
    <button
      className={css.trendButton}
      onClick={() => { selectView('tasks') }}
      aria-label={t('chart.detail')}
    >
      <svg className={css.trend} viewBox="0 0 370 190" role="img" aria-label={t(titleKey)}>
        <title>{t(titleKey)}</title>
        {[40, 60, 80, 100].map(n => (
          <g key={n}>
            <line x1="30" x2="347" y1={160 - n * 1.3} y2={160 - n * 1.3} />
            <text x="0" y={164 - n * 1.3}>
              {n}
            </text>
          </g>
        ))}
        <polyline points={coords} />
        {trend.map((value, i) => (
          <g key={i}>
            <circle cx={32 + i * 60} cy={160 - value * 1.3} r="3.5">
              <title>
                {t('trend.week', { value: i + 1 })}: {value}%
              </title>
            </circle>
            <text x={26 + i * 60} y="182">
              {t('trend.week', { value: i + 1 })}
            </text>
          </g>
        ))}
      </svg>
    </button>
  )
}

/** 可复用的任务行列表；`compact` 用于仪表盘侧栏的紧凑模式。 */
export function TaskRows({ compact = false }: { readonly compact?: boolean }) {
  const page = useWorkbenchPage()
  const { t, role, workItems, query, openTask, workStatus, statusLabel } = page
  return (
    <div className={css.taskRows}>
      {workItems
        .filter(item => t(taskTitles[item.task]).toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .map(item => (
          <button
            key={item.id}
            className={css.taskRow}
            onClick={() => { openTask(item.task, workStatus(item.id, item.status) === 'review' ? 3 : undefined) }}
          >
            <span className={css.taskIcon}>
              <IconChecklistOutlineRegular size={18} />
            </span>
            <span className={css.grow}>
              <strong>{t(taskTitles[item.task])}</strong>
              <small>{t(`${role}.metric${item.sourceMetricIndex + 1}` as WorkbenchKey)} · {t('assistant.sourceReason')}</small>
              <small>{t('assistant.nextAction')}: {t('assistant.nextReview')}</small>
            </span>
            {!compact && (
              <span className={css.due}>{t(item.dueKey)}</span>
            )}
            <Tag>{statusLabel(workStatus(item.id, item.status))}</Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
        ))}
      {workItems.every(item => !t(taskTitles[item.task]).toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (
        <p className={css.empty}>{t('noMatches')}</p>
      )}
    </div>
  )
}

/** 角色方法卡列表；`compact` 用于仪表盘的精简模式。 */
export function MethodCards({ compact = false }: { readonly compact?: boolean }) {
  const page = useWorkbenchPage()
  const { t, role, openTask } = page
  return (
    <div className={css.methodCards}>
      {roleMethods[role].map(assignment => (
        <article className={css.card} key={assignment.task}>
          <Tag>{t(assignment.method.title)}</Tag>
          <h3>{t(taskTitles[assignment.task])}</h3>
          {!compact && <>
            <p className={css.intro}>{t(assignment.method.why)}</p>
            <dl className={css.methodFacts}>
              <dt>{t('guide.inputs')}</dt><dd>{t(assignment.inputs)}</dd>
              <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
              <dt>{t('guide.acceptance')}</dt><dd>{t(assignment.acceptance)}</dd>
            </dl>
          </>}
          <Button variant="outline" onClick={() => { openTask(assignment.task) }}>
            {t('guide.start')}
          </Button>
        </article>
      ))}
    </div>
  )
}

/** 方法自检清单：证据/分析回填入口 + 四步勾选。 */
export function MethodChecks() {
  const page = useWorkbenchPage()
  const { t, execution, practice, setDialog, setWorkStage, actions, taskKey, initial, methodReady } = page
  return (
    <div className={css.methodChecks}>
      <dl className={css.methodFacts}>
        <dt>{t('guide.evidence')}</dt><dd>{execution.evidence || t('guide.unrecorded')}</dd>
        <dt>{t('guide.analysis')}</dt><dd>{execution.analysis || t('guide.unrecorded')}</dd>
        <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
        <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
      </dl>
      <div className={css.methodRecords}>
        <Button onClick={() => { setDialog(null); setWorkStage(0) }}>{t('guide.evidence')} · {t(execution.evidence.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
        <Button onClick={() => { setDialog(null); setWorkStage(1) }}>{t('guide.analysis')} · {t(execution.analysis.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
      </div>
      {([0, 1, 2, 3] as const).map(step => (
        <Checkbox key={step} checked={execution.checked.includes(step)}
          label={t(`guide.check${step}`)}
          onChange={(checked) => { actions.checkMethod(taskKey, step, checked, initial) }} />
      ))}
      <p className={css.intro}>{t(methodReady ? 'guide.ready' : 'guide.missing')}</p>
    </div>
  )
}

/** 版本对比用的执行快照。 */
export function ExecutionSnapshot({ version }: { readonly version: DraftVersion | undefined }) {
  const { t } = useWorkbenchPage()
  if (version === undefined) return null
  return (
    <div className={css.methodSnapshot}>
      <h3>{t('guide.snapshot')}</h3>
      <p>{t('guide.progress', { done: version.execution.checked.length })}</p>
      <p>{t('guide.evidence')}: {version.execution.evidence || t('guide.unrecorded')}</p>
      <p>{t('guide.analysis')}: {version.execution.analysis || t('guide.unrecorded')}</p>
    </div>
  )
}
