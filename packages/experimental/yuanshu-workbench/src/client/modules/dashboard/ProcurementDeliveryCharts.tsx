/**
 * 项目管理页的采购交付图表区：交付承诺兑现趋势、供应商到货表现、采购订单状态、
 * 关键物料到货与需求、每周采购订单关闭量、物料交付风险矩阵六张卡，从采购岗位的
 * 经营总览仪表盘迁移而来。数据固定取采购岗位演示数据，不随当前角色切换。
 * 自带区块标题，供演示模式（ProjectOpsScreen）与线上模式（liveHome）共用。
 */
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { roleFixtures } from '../../core/fixtures.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import { TrendChart } from '../../app/page-parts.tsx'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import { dashboardCharts } from './dashboard-data.ts'
import { DashboardCharts } from './DashboardCharts.tsx'
import css from '../../app/Workbench.module.css'

/** 渲染采购交付六卡图表区（project-operations 页尾）。 */
export function ProcurementDeliveryCharts({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const fixture = roleFixtures.procurement
  return (
    <>
      <div className={css.sectionHeading}>
        <h2>{t('project.operations.deliveryCharts')}</h2>
        <Tag>{t('demoSample')}</Tag>
      </div>
      <div className={css.chartGrid}>
        <section className={css.card} data-dashboard-chart="trend" aria-label={t('procurement.chart')}>
          <div className={css.sectionHeading}>
            <h2>{t('procurement.chart')}</h2>
            <small>{t('chart.unit')}</small>
          </div>
          <TrendChart trend={fixture.trend} titleKey="procurement.chart" />
          <p className={css.chartCaption}>{t('chartHint')}</p>
        </section>
        <section className={css.card} data-dashboard-chart="progress" aria-label={t('procurement.bars')}>
          <div className={css.sectionHeading}>
            <h2>{t('procurement.bars')}</h2>
            <small>{t('thisWeek')}</small>
          </div>
          <div className={css.bars}>
            {fixture.bars.map((value, i) => (
              <button
                key={i}
                className={css.barRow}
                onClick={() => { page.selectView('tasks') }}
              >
                <span>{t(`procurement.bar${i + 1}` as WorkbenchKey)}</span>
                <b>{value}%</b>
                <span className={css.barTrack}>
                  <span style={{ width: `${value}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>
        <DashboardCharts t={t} charts={dashboardCharts.procurement} tasks={fixture.tasks} onTask={page.openTask} />
      </div>
    </>
  )
}
