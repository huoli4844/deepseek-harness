/** 资料库内容区操作条纯组件：搜索、类型筛选与当前页计数，不请求后台。 */
import type { DoclibT } from '../model.ts'
import { TYPE_FILTERS, type DoclibTypeFilter } from '../viewmodel.ts'
import css from '../doclib.module.css'

/** 类型筛选下拉的选项文案键。 */
function typeFilterLabel(t: DoclibT, filter: DoclibTypeFilter): string {
  return filter === 'all' ? t('doclib.typeFilter.all') : t(`doclib.mime.${filter}`)
}

/**
 * 内容区操作条：左侧关键字搜索（回车提交），右侧类型筛选与本页计数。
 * @param props - 输入草稿、筛选状态与回调。
 */
export function DoclibTopBar(props: {
  readonly draft: string
  readonly typeFilter: DoclibTypeFilter
  readonly shown: number
  readonly pageTotal: number
  readonly t: DoclibT
  readonly onInput: (keyword: string) => void
  readonly onSubmit: () => void
  readonly onClear: () => void
  readonly onTypeFilter: (filter: DoclibTypeFilter) => void
}) {
  const { draft, typeFilter, shown, pageTotal, t } = props
  return <div className={css.bar}>
    <form className={css.searchBox} role="search"
      onSubmit={(event) => { event.preventDefault(); props.onSubmit() }}>
      <svg className={css.searchIcon} width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="m10.4 10.4 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input className={css.searchInput} value={draft} placeholder={t('doclib.searchPlaceholder')}
        aria-label={t('doclib.search')}
        onChange={(event) => { props.onInput(event.target.value) }} />
      {draft !== '' && <button type="button" className={css.searchClear}
        aria-label={t('doclib.searchClear')} onClick={props.onClear}>×</button>}
    </form>
    <label className={css.filterBox}>
      <select className={css.filterSelect} value={typeFilter} aria-label={t('doclib.column.type')}
        onChange={(event) => { props.onTypeFilter(event.target.value as DoclibTypeFilter) }}>
        {TYPE_FILTERS.map(filter => <option key={filter} value={filter}>{typeFilterLabel(t, filter)}</option>)}
      </select>
    </label>
    {typeFilter !== 'all' && <span className={css.barCount}>
      {t('doclib.typeFilter.count', { shown, total: pageTotal })}
    </span>}
  </div>
}
