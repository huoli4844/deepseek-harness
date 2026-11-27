/** 供应商评分区间分布：五个维度按区间统计家数与占比，支持类型/准入筛选。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { SupplierScoreFilter, SupplierStats } from './supplier-viewmodel.ts'
import { supplierTypeLabel } from './SupplierStatsPanel.tsx'
import css from './supplier-management.module.css'

/** 占比保留一位小数；总数为 0 时按 0.0% 展示。 */
function share(count: number, total: number): string {
  return `${(total === 0 ? 0 : (count / total) * 100).toFixed(1)}%`
}

/** 渲染供应商专项评分区间分布；统计未就绪时交给主统计条提示。 */
export function SupplierScorePanel({ stats, status, filter, onFilter, onRefresh, t }: {
  readonly stats: SupplierStats | undefined
  readonly status: 'loading' | 'ready' | 'failure'
  readonly filter: SupplierScoreFilter
  readonly onFilter: (filter: SupplierScoreFilter) => void
  readonly onRefresh: () => void
  readonly t: WorkbenchT
}) {
  if (status !== 'ready' || stats === undefined) return null
  return <section className={css.scorePanel} aria-label={t('supplier.scores')}>
    <h3 className={css.scoreTitle}>{t('supplier.scoresTitle')}</h3>
    <p className={css.scoreIntro}>{t('supplier.scoresIntro')}</p>
    <div className={css.scoreToolbar}>
      <label className={css.scoreFilter}>
        <select aria-label={t('supplier.scoreFilterType')} value={filter.type}
          onChange={(event) => { onFilter({ ...filter, type: event.target.value }) }}>
          <option value="">{t('supplier.scoreAllTypes')}</option>
          {stats.typeOptions.map(type => <option key={type} value={type}>{supplierTypeLabel(type, t)}</option>)}
        </select>
      </label>
      <label className={css.scoreFilter}>
        <select aria-label={t('supplier.scoreFilterAdmission')} value={filter.admission}
          onChange={(event) => { onFilter({ ...filter, admission: event.target.value }) }}>
          <option value="">{t('supplier.scoreAllAdmission')}</option>
          <option value="approved">{t('supplier.statsApproved')}</option>
          <option value="pending">{t('supplier.statsPending')}</option>
          <option value="rejected">{t('supplier.statsRejected')}</option>
        </select>
      </label>
      <button type="button" className={css.scoreRefresh} onClick={onRefresh}>{t('supplier.scoreRefresh')}</button>
      <p className={css.scoreSummary}>{t('supplier.scoresSummary', {
        total: String(stats.total), shown: String(stats.shown),
      })}</p>
    </div>
    <p className={css.scoreNote}>{t('supplier.scoresHint')}</p>
    <div className={css.scoreGrid}>
      {stats.scores.map((dimension) => {
        const label = t(`supplier.score.${dimension.key}`)
        const average = dimension.average === undefined ? '—' : dimension.average.toFixed(2)
        return <article key={dimension.key} className={css.scoreCard}>
          <header className={css.scoreHead}>
            <span>{label}</span>
            <span className={css.scoreAverage}>{t('supplier.scoreAverage')} {average}</span>
          </header>
          <p className={css.scoreRated}>{t('supplier.scoresRated', {
            rated: String(dimension.rated), total: String(stats.shown),
          })}</p>
          <table className={css.scoreTable}>
            <thead>
              <tr>
                <th scope="col">{t('supplier.scoreColumnRange')}</th>
                <th scope="col">{t('supplier.scoreColumnCount')}</th>
                <th scope="col">{t('supplier.scoreColumnShare')}</th>
              </tr>
            </thead>
            <tbody>
              {dimension.ranges.map(range => <tr key={range.key}>
                <td>{t(`supplier.range.${range.key}`)}</td>
                <td>{range.count}</td>
                <td>{share(range.count, stats.shown)}</td>
              </tr>)}
            </tbody>
          </table>
        </article>
      })}
    </div>
  </section>
}
