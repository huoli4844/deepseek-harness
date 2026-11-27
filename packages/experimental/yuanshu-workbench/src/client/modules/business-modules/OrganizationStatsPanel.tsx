/** 组织架构统计：指标卡与五张图表卡片（角色分布、全年入职、累计人员、在司时间分布、全年离职）。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { OrganizationStats } from './organization-model.ts'
import { OrganizationDepartedChart, OrganizationJoinedChart, OrganizationRoleChart, OrganizationTenureChart, OrganizationTotalChart } from './OrganizationCharts.tsx'
import css from './organization.module.css'

/** 渲染组织架构页统计条：上方指标卡，下方每个图表一张独立卡片。 */
export function OrganizationStatsPanel({ stats, departmentCount, unassignedCount, t }: {
  readonly stats: OrganizationStats
  readonly departmentCount: number
  readonly unassignedCount: number
  readonly t: WorkbenchT
}) {
  return <>
    <section className={css.statsPanel} aria-label={t('organization.stat.label')}>
      <div className={css.statCards}>
        <div className={css.statCard}><strong>{departmentCount}</strong><span>{t('organization.stat.departments')}</span></div>
        <div className={css.statCard}><strong>{stats.active}</strong><span>{t('organization.stat.active')}</span></div>
        <div className={css.statCard} data-tone="muted"><strong>{stats.inactive}</strong><span>{t('organization.stat.inactive')}</span></div>
        <div className={css.statCard}><strong>{unassignedCount}</strong><span>{t('organization.stat.unassigned')}</span></div>
        <div className={css.statCard}><strong>{stats.roles.length}</strong><span>{t('organization.stat.roles')}</span></div>
      </div>
    </section>
    <section className={css.chartsPanel} aria-label={t('organization.stat.charts')}>
      {/* 五张卡片统一 figure+figcaption 结构，标题字号一致（h3 会被全局内容区标题规则放大）。 */}
      <figure className={css.chartCard}>
        <figcaption>{t('organization.stat.roleDistribution')}</figcaption>
        {stats.roles.length === 0
          ? <p className={css.chartEmpty}>{t('organization.stat.noData')}</p>
          : <OrganizationRoleChart roles={stats.roles} t={t} />}
      </figure>
      <figure className={css.chartCard}>
        <figcaption>{t('organization.stat.hired')}</figcaption>
        <OrganizationJoinedChart points={stats.monthly} t={t} />
      </figure>
      <figure className={css.chartCard}>
        <figcaption>{t('organization.stat.history')}</figcaption>
        <OrganizationTotalChart points={stats.monthly} t={t} />
      </figure>
      <figure className={css.chartCard}>
        <figcaption>{t('organization.stat.tenure')}</figcaption>
        <OrganizationTenureChart points={stats.tenure} t={t} />
      </figure>
      <figure className={css.chartCard}>
        <figcaption>{t('organization.stat.departed')}</figcaption>
        <OrganizationDepartedChart points={stats.monthly} t={t} />
      </figure>
    </section>
  </>
}
