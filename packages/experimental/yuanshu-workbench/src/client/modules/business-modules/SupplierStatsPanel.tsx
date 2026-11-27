/** 供应商统计：总量、准入状态、类型与分类分布，数据来自全量档案聚合。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { SupplierAdmissionKey, SupplierStatBucket, SupplierStats } from './supplier-viewmodel.ts'
import css from './supplier-management.module.css'

/** 后台供应商类型编码到中文名称；未知编码原样展示。 */
export function supplierTypeLabel(code: string, t: WorkbenchT): string {
  switch (code) {
    case '': return t('supplier.unspecified')
    case 'material': return t('supplier.type.material')
    case 'service': return t('supplier.type.service')
    case 'engineering': return t('supplier.type.engineering')
    case 'equipment': return t('supplier.type.equipment')
    case 'other': return t('supplier.type.other')
    default: return code
  }
}

/** 准入状态分组到中文名称。 */
function admissionLabel(key: SupplierAdmissionKey, t: WorkbenchT): string {
  switch (key) {
    case 'pending': return t('supplier.statsPending')
    case 'approved': return t('supplier.statsApproved')
    case 'rejected': return t('supplier.statsRejected')
    default: return t('supplier.statsOther')
  }
}

/** 条形宽度百分比：有数据时至少保留 2%，避免零宽不可见。 */
function share(bucket: SupplierStatBucket, total: number): string {
  if (total <= 0) return '0%'
  return `${String(Math.max(2, Math.round((bucket.count / total) * 100)))}%`
}

/** 分类标签：空值归为「未分类」，其余原样展示。 */
function categoryLabel(code: string, t: WorkbenchT): string {
  return code === '' ? t('supplier.statsUncategorized') : code
}

/** 渲染供应商统计条：关键指标 + 类型分布 + 准入状态分布 + 分类分布。 */
export function SupplierStatsPanel({ stats, status, t }: {
  readonly stats: SupplierStats | undefined
  readonly status: 'loading' | 'ready' | 'failure'
  readonly t: WorkbenchT
}) {
  if (status === 'failure') return <div className={css.statsScope}><p className={css.statsHint} role="status">{t('supplier.statsError')}</p></div>
  if (stats === undefined) return <div className={css.statsScope}><p className={css.statsHint} role="status">{t('supplier.statsLoading')}</p></div>
  const average = stats.averageScore === undefined ? '— — —' : stats.averageScore.toFixed(1)
  return <div className={css.statsScope}>
    <section className={css.stats} aria-label={t('supplier.stats')}>
      <div className={css.statCards}>
        <div className={css.statCard}><b>{String(stats.total)}</b><span>{t('supplier.statsTotal')}</span></div>
        <div className={css.statCard}><b>{String(stats.approved)}</b><span>{t('supplier.statsApproved')}</span></div>
        <div className={css.statCard} data-tone="warn"><b>{String(stats.pending)}</b><span>{t('supplier.statsPending')}</span></div>
        <div className={css.statCard}><b>{String(stats.rejected)}</b><span>{t('supplier.statsRejected')}</span></div>
        <div className={css.statCard}><b>{String(stats.disabled)}</b><span>{t('supplier.statsDisabled')}</span></div>
        <div className={css.statCard}><b>{average}</b><span>{t('supplier.statsAverageScore')}</span></div>
      </div>
      <div className={css.statBars}>
        <h3>{t('supplier.statsByType')}</h3>
        {stats.types.slice(0, 6).map(bucket => <div key={bucket.key || 'unspecified'} className={css.statBarRow}>
          <span className={css.statBarLabel}>{supplierTypeLabel(bucket.key, t)}</span>
          <span className={css.statBarTrack}>
            <span className={css.statBarFill} style={{ inlineSize: share(bucket, stats.total) }} />
          </span>
          <span className={css.statBarValue}>{String(bucket.count)}</span>
        </div>)}
      </div>
      <div className={css.statPills}>
        <h3>{t('supplier.statsAdmission')}</h3>
        <ul>
          {stats.admissions.map(bucket => <li key={bucket.key}>
            <span data-status={bucket.key}>{admissionLabel(bucket.key, t)}</span>
            <b>{String(bucket.count)}</b>
          </li>)}
        </ul>
      </div>
      <div className={css.statCategories}>
        <h3>{t('supplier.statsByCategory')}</h3>
        {stats.categories.map(bucket => <div key={bucket.key || 'uncategorized'} className={css.statBarRow}>
          <span className={css.statBarLabel}>{categoryLabel(bucket.key, t)}</span>
          <span className={css.statBarTrack}>
            <span className={css.statBarFill} style={{ inlineSize: share(bucket, stats.total) }} />
          </span>
          <span className={css.statBarValue}>{String(bucket.count)}</span>
        </div>)}
      </div>
      {stats.truncated && <p className={css.statNote}>{t('supplier.statsTruncated', { count: String(stats.total) })}</p>}
    </section>
  </div>
}
