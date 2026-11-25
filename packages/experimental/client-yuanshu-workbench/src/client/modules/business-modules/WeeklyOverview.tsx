/** 显示本人周报与工时概览，不访问服务；保存与提交动作由外层透传。 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { WeeklyDraft, WeeklySnapshot } from './project-registration-model.ts'
import type { WeeklyItemsSummary } from './weekly-items-model.ts'
import { parseRiskRows } from './weekly-report-rows.ts'
import css from './project-registration.module.css'

/** 右栏提交前检查所需的周报写操作。 */
export interface WeeklyReportActions {
  readonly save: () => void
  readonly submit: () => void
  readonly busy: boolean
  readonly canSubmit: boolean
}

/** 渲染案例中的右侧概览和提交前检查。 */
export function WeeklyOverview({ snapshot, summary, draft, actions, t }: {
  readonly snapshot: WeeklySnapshot | undefined
  readonly summary: WeeklyItemsSummary | undefined
  readonly draft: WeeklyDraft
  readonly actions: WeeklyReportActions | undefined
  readonly t: WorkbenchT
}) {
  const reportStatus = snapshot?.report === undefined ? 'weekly.pending' : snapshot.report.status === 'submitted' ? 'registration.submitted' : 'registration.draft'
  const completionRate = summary === undefined ? undefined : summary.total ? Math.round(summary.completed / summary.total * 100) : 0
  const largestProjectCount = Math.max(...(summary?.byProject.map(item => item.count) ?? [0]))
  // 风险项取「风险与阻塞」卡片的行数。
  const risks = parseRiskRows(draft.issues_and_risks).length
  return <aside className={css.weeklyAside} aria-label={t('weekly.overview')}>
    <section className={css.weeklyAsideSection}>
      <h2>{t('weekly.overview')}</h2>
      <div className={css.weeklyKpis}>
        <div className={css.weeklyKpi} data-tone="blue">
          <span>{t('weekly.itemCount')}</span>
          <p><strong>{summary?.total ?? '— — —'}</strong>{summary !== undefined && <em>{t('weekly.itemUnit')}</em>}</p>
        </div>
        <div className={css.weeklyKpi} data-tone="green">
          <span>{t('weekly.completedCount')}</span>
          <p><strong>{summary?.completed ?? '— — —'}</strong>{summary !== undefined && <em>{t('weekly.itemUnit')}</em>}</p>
        </div>
        <div className={css.weeklyKpi} data-tone="amber">
          <span>{t('weekly.inProgressCount')}</span>
          <p><strong>{summary?.inProgress ?? '— — —'}</strong>{summary !== undefined && <em>{t('weekly.itemUnit')}</em>}</p>
        </div>
        <div className={css.weeklyKpi} data-tone="red">
          <span>{t('weekly.riskCount')}</span>
          <p><strong>{risks ?? '— — —'}</strong>{risks !== undefined && <em>{t('weekly.riskUnit')}</em>}</p>
        </div>
      </div>
      <div className={css.weeklyProgress}>
        <p>{t('weekly.completionRate')} <strong>{completionRate === undefined ? '— — —' : `${completionRate}%`}</strong></p>
        <div role="progressbar" aria-label={t('weekly.completionRate')} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={completionRate} className={css.weeklyProgressTrack}>
          <span style={{ width: `${completionRate ?? 0}%` }} />
        </div>
      </div>
      <h3 className={css.weeklyChartTitle}>{t('weekly.projectDistribution')}（{t('weekly.itemUnit')}）</h3>
      {summary === undefined || summary.byProject.length === 0
        ? <p className={css.weeklyDataSource}>{t('weekly.noDistribution')}</p>
        : <>
          <ul className={css.weeklyDistribution}>{summary.byProject.map((item, index) => <li key={item.name}>
            <span>{item.name}</span>
            <div><i className={index % 3 === 1 ? css.weeklyBarAmber : index % 3 === 2 ? css.weeklyBarGreen : css.weeklyBarBlue}
              style={{ width: `${Math.max(4, item.count / largestProjectCount * 100)}%` }} /></div>
            <strong>{item.count}</strong>
          </li>)}</ul>
          <div className={css.weeklyChartAxis}><span>0</span><span>{largestProjectCount}</span></div>
        </>}
      <dl className={css.weeklyStats}>
        <div><dt>{t('weekly.reportStatus')}</dt><dd>{t(reportStatus)}</dd></div>
        <div><dt>{t('weekly.hoursApproved')}</dt><dd>{snapshot?.totalHours ?? '— — —'}</dd></div>
      </dl>
    </section>
    <section className={css.weeklySubmitCard} aria-label={t('weekly.preSubmit')}>
      <h2>{t('weekly.preSubmit')}</h2>
      <ul className={css.weeklyChecks}>
        <li className={summary === undefined || summary.total === 0 ? css.weeklyCheckPending : css.weeklyCheckDone}>
          {t('weekly.checkItems')}
        </li>
        <li className={draft.planned_work.trim() ? css.weeklyCheckDone : css.weeklyCheckPending}>
          {t('weekly.checkPlan')}
        </li>
      </ul>
      <div className={css.weeklySubmitActions}>
        <Button size="sm" variant="outline" onClick={actions?.save}
          disabled={actions === undefined || actions.busy}>{t('registration.save')}</Button>
        <Button size="sm" variant="primary" onClick={actions?.submit}
          disabled={actions === undefined || actions.busy || !actions.canSubmit}>{t('weekly.submitReport')}</Button>
      </div>
      <p className={css.weeklySubmitHint}>{t('weekly.submitHint')}</p>
    </section>
  </aside>
}
