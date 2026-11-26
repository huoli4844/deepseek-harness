/** 资料库内容区操作条：搜索、类型筛选、排序、上传刷新与批量删除。 */
import type { DoclibT, DocumentSortField, SortState } from '../model.ts'
import { TYPE_FILTERS, type DoclibTypeFilter } from '../viewmodel.ts'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 类型筛选下拉的选项文案键。 */
function typeFilterLabel(t: DoclibT, filter: DoclibTypeFilter): string {
  return filter === 'all' ? t('doclib.typeFilter.all') : t(`doclib.mime.${filter}`)
}

/**
 * 内容区操作条：关键字搜索（回车提交）、类型筛选、排序、上传与批量动作。
 * @param props - 输入草稿、筛选排序状态与回调。
 */
export function DoclibTopBar(props: {
  readonly draft: string
  readonly typeFilter: DoclibTypeFilter
  readonly shown: number
  readonly pageTotal: number
  readonly sort: SortState<DocumentSortField> | undefined
  readonly selectedCount: number
  readonly busy: boolean
  readonly t: DoclibT
  readonly onInput: (keyword: string) => void
  readonly onSubmit: () => void
  readonly onClear: () => void
  readonly onTypeFilter: (filter: DoclibTypeFilter) => void
  readonly onSort: (field: DocumentSortField | undefined) => void
  readonly onToggleDirection: () => void
  readonly onUpload: () => void
  readonly onRefresh: () => void
  readonly onDeleteSelected: () => void
  readonly onClearSelection: () => void
}) {
  const { draft, typeFilter, shown, pageTotal, sort, selectedCount, busy, t } = props
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
    <label className={css.filterBox}>
      <select className={css.filterSelect} value={sort?.field ?? 'none'} aria-label={t('doclib.files.sort')}
        onChange={(event) => {
          const value = event.target.value
          props.onSort(value === 'none' ? undefined : value as DocumentSortField)
        }}>
        <option value="none">{t('doclib.files.sortNone')}</option>
        <option value="title">{t('doclib.files.sortName')}</option>
        <option value="directory">{t('doclib.files.sortDirectory')}</option>
        <option value="sensitivity">{t('doclib.files.sortSensitivity')}</option>
        <option value="updatedAt">{t('doclib.files.sortUpdated')}</option>
      </select>
    </label>
    {sort !== undefined && <button type="button" className={css.pageButton}
      aria-label={sort.direction === 'asc' ? t('doclib.files.sortDesc') : t('doclib.files.sortAsc')}
      onClick={props.onToggleDirection}>{sort.direction === 'asc' ? '↑' : '↓'}</button>}
    <button type="button" className={filesCss.toolButton} disabled={busy} onClick={props.onUpload}>
      {t('doclib.files.upload')}</button>
    <button type="button" className={filesCss.toolButton} onClick={props.onRefresh}>
      {t('doclib.files.refresh')}</button>
    {selectedCount > 0 && <div className={filesCss.selectionBar}>
      <span className={css.barCount}>{t('doclib.files.selected', { count: selectedCount })}</span>
      <button type="button" className={`${filesCss.toolButton} ${filesCss.dangerText}`} disabled={busy}
        onClick={props.onDeleteSelected}>{t('doclib.files.delete')}</button>
      <button type="button" className={css.linkButton} onClick={props.onClearSelection}>
        {t('doclib.files.clearSelection')}</button>
    </div>}
    {typeFilter !== 'all' && <span className={css.barCount}>
      {t('doclib.typeFilter.count', { shown, total: pageTotal })}
    </span>}
  </div>
}
