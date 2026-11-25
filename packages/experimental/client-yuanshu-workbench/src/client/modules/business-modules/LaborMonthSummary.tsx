/** 展示本人当月各项目的工时合计卡片，数据由容器按月汇总。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { LaborProjectTotal } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

/** 无汇总数据时区分“加载中”和“本月确实没有工时”，不显示占位数值。 */
export function LaborMonthSummary({ totals, ready, t }: {
  readonly totals: readonly LaborProjectTotal[]
  readonly ready: boolean
  readonly t: WorkbenchT
}) {
  return <section className={css.summary} aria-label={t('labor.summaryTitle')}>
    <h3>{t('labor.summaryTitle')}</h3>
    {totals.length === 0
      ? <p>{ready ? t('labor.summaryEmpty') : t('registration.loading')}</p>
      : <div className={css.cards}>
        {totals.map(total => <div key={total.code} className={css.card}>
          <span className={css.cardName}>{total.name}</span>
          <strong className={css.cardHours}>{t('labor.hourValue', { hours: total.hours })}</strong>
        </div>)}
      </div>}
  </section>
}
