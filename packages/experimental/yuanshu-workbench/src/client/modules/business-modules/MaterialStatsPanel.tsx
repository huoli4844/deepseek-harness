/** 物料统计：总量、分类/类型/关键等级分布与库存状态，数据来自全量档案聚合。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { MaterialStatBucket, MaterialStats } from './material-viewmodel.ts'
import css from './material-management.module.css'

/** 后台物料类型编码到中文名称；未知编码原样展示。 */
export function typeLabel(code: string, t: WorkbenchT): string {
  switch (code) {
    case '': return t('material.statsUnspecified')
    case 'component': return t('material.type.component')
    case 'raw': return t('material.type.raw')
    case 'part': return t('material.type.part')
    case 'assembly': return t('material.type.assembly')
    case 'package': return t('material.type.package')
    case 'product': return t('material.type.product')
    case 'tool': return t('material.type.tool')
    case 'consumable': return t('material.type.consumable')
    default: return code
  }
}

/** 关键等级编码到中文名称；未知编码原样展示。 */
export function levelLabel(code: string, t: WorkbenchT): string {
  switch (code) {
    case '': return t('material.statsUnspecified')
    case 'critical': return t('material.level.critical')
    case 'important': return t('material.level.important')
    case 'normal': return t('material.level.normal')
    case 'high': return t('material.level.high')
    case 'medium': return t('material.level.medium')
    case 'low': return t('material.level.low')
    default: return code
  }
}

/** 条形宽度百分比：有数据时至少保留 2%，避免零宽不可见。 */
function share(bucket: MaterialStatBucket, total: number): string {
  if (total <= 0) return '0%'
  return `${String(Math.max(2, Math.round((bucket.count / total) * 100)))}%`
}

/** 分类编码到分类名称；空编码与未知编码按「未填写」或原值展示。 */
function categoryLabel(code: string, names: ReadonlyMap<string, string>, t: WorkbenchT): string {
  if (code === '') return t('material.statsUnspecified')
  return names.get(code) ?? code
}

/** 渲染物料统计条：关键指标 + 类型/分类分布 + 关键等级分布。 */
export function MaterialStatsPanel({ stats, categoryNames, status, t }: {
  readonly stats: MaterialStats | undefined
  readonly categoryNames: ReadonlyMap<string, string>
  readonly status: 'loading' | 'ready' | 'failure'
  readonly t: WorkbenchT
}) {
  if (status === 'failure') return <p className={css.statsHint} role="status">{t('material.statsError')}</p>
  if (stats === undefined) return <p className={css.statsHint} role="status">{t('material.statsLoading')}</p>
  const types = stats.types.filter(bucket => bucket.key !== '')
  return <section className={css.stats} aria-label={t('material.stats')}>
    <div className={css.statCards}>
      <div className={css.statCard}><b>{String(stats.total)}</b><span>{t('material.statsTotal')}</span></div>
      <div className={css.statCard}><b>{String(stats.categories)}</b><span>{t('material.statsCategories')}</span></div>
      <div className={css.statCard}><b>{String(types.length)}</b><span>{t('material.statsTypes')}</span></div>
      <div className={css.statCard} data-tone="warn"><b>{String(stats.critical)}</b><span>{t('material.statsCritical')}</span></div>
      <div className={css.statCard}><b>{String(stats.zeroSafetyStock)}</b><span>{t('material.statsZeroStock')}</span></div>
      <div className={css.statCard}><b>{String(stats.disabled)}</b><span>{t('material.statsDisabled')}</span></div>
    </div>
    <div className={css.statBars}>
      <h3>{t('material.statsByType')}</h3>
      {stats.types.slice(0, 6).map(bucket => <div key={bucket.key || 'unspecified'} className={css.statBarRow}>
        <span className={css.statBarLabel}>{typeLabel(bucket.key, t)}</span>
        <span className={css.statBarTrack}>
          <span className={css.statBarFill} style={{ inlineSize: share(bucket, stats.total) }} />
        </span>
        <span className={css.statBarValue}>{String(bucket.count)}</span>
      </div>)}
      {stats.truncated && <p className={css.statNote}>{t('material.statsTruncated', { count: String(stats.total) })}</p>}
    </div>
    <div className={css.statCategories}>
      <h3>{t('material.statsByCategory')}</h3>
      {stats.byCategory.length === 0
        ? <p className={css.statNote}>{t('material.statsUnspecified')}</p>
        : stats.byCategory.slice(0, 6).map(bucket => <div key={bucket.key || 'unspecified'} className={css.statBarRow}>
          <span className={css.statBarLabel}>{categoryLabel(bucket.key, categoryNames, t)}</span>
          <span className={css.statBarTrack}>
            <span className={css.statBarFill} style={{ inlineSize: share(bucket, stats.total) }} />
          </span>
          <span className={css.statBarValue}>{String(bucket.count)}</span>
        </div>)}
    </div>
    <div className={css.statLevels}>
      <h3>{t('material.statsByLevel')}</h3>
      <ul>
        {stats.levels.map(bucket => <li key={bucket.key || 'unspecified'}>
          <span data-level={bucket.key}>{levelLabel(bucket.key, t)}</span>
          <b>{String(bucket.count)}</b>
        </li>)}
      </ul>
    </div>
  </section>
}
