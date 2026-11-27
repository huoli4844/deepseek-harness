/** 合同统计：总量、到期与金额指标，以及类型/状态分布，数据来自全量合同聚合。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ContractStatBucket, ContractStats } from './contract-viewmodel.ts'
import { contractAmount, contractStatusLabel } from './contract-viewmodel.ts'
import css from './contract-management.module.css'

/** 后台合同类型编码到简短名称；未知编码原样展示。 */
function typeLabel(code: string, t: WorkbenchT): string {
  switch (code) {
    case 'purchase': return t('contract.statsType.purchase')
    case 'sales': return t('contract.statsType.sales')
    case 'service': return t('contract.statsType.service')
    case 'engineering': return t('contract.statsType.engineering')
    case 'outsourcing': return t('contract.statsType.outsourcing')
    case 'lease': return t('contract.statsType.lease')
    case 'other': return t('contract.statsType.other')
    default: return code
  }
}

/** 条形宽度百分比：有数据时至少保留 2%，避免零宽不可见。 */
function share(bucket: ContractStatBucket, total: number): string {
  if (total <= 0) return '0%'
  return `${String(Math.max(2, Math.round((bucket.count / total) * 100)))}%`
}

/** 渲染合同统计条：关键指标 + 类型分布 + 状态分布。 */
export function ContractStatsPanel({ stats, status, t }: {
  readonly stats: ContractStats | undefined
  readonly status: 'loading' | 'ready' | 'failure'
  readonly t: WorkbenchT
}) {
  if (status === 'failure') return <p className={css.statsHint} role="status">{t('contract.statsError')}</p>
  if (stats === undefined) return <p className={css.statsHint} role="status">{t('contract.statsLoading')}</p>
  const types = stats.types.filter(bucket => bucket.key !== '')
  const statuses = stats.statuses.filter(bucket => bucket.key !== '')
  // 截断时后台总数大于已加载条数，条形比例按已加载合同计算。
  const loaded = types.reduce((sum, bucket) => sum + bucket.count, 0)
  return <section className={css.stats} aria-label={t('contract.stats')}>
    <div className={css.statCards}>
      <div className={css.statCard}><b>{String(stats.total)}</b><span>{t('contract.statsTotal')}</span></div>
      <div className={css.statCard}><b>{String(stats.active)}</b><span>{t('contract.statsActive')}</span></div>
      <div className={css.statCard} data-tone="warn"><b>{String(stats.expiringSoon)}</b><span>{t('contract.statsExpiring')}</span></div>
      <div className={css.statCard} data-tone="warn"><b>{String(stats.expired)}</b><span>{t('contract.statsExpired')}</span></div>
      <div className={css.statCard}><b>{contractAmount(stats.totalAmount)}</b><span>{t('contract.statsTotalAmount')}</span></div>
      <div className={css.statCard}><b>{contractAmount(stats.owedAmount)}</b><span>{t('contract.statsOwedAmount')}</span></div>
    </div>
    <div className={css.statBars}>
      <h3>{t('contract.statsByType')}</h3>
      {types.map(bucket => <div key={bucket.key} className={css.statBarRow}>
        <span className={css.statBarLabel}>{typeLabel(bucket.key, t)}</span>
        <span className={css.statBarTrack}>
          <span className={css.statBarFill} style={{ inlineSize: share(bucket, loaded) }} />
        </span>
        <span className={css.statBarValue}>{String(bucket.count)}</span>
      </div>)}
      {stats.truncated && <p className={css.statNote}>{t('contract.statsTruncated', { count: String(stats.total) })}</p>}
    </div>
    <div className={css.statStatuses}>
      <h3>{t('contract.statsByStatus')}</h3>
      <ul>
        {statuses.map(bucket => <li key={bucket.key}>
          <span>{contractStatusLabel(t, bucket.key)}</span>
          <b>{String(bucket.count)}</b>
        </li>)}
      </ul>
    </div>
  </section>
}
