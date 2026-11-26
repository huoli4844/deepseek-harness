/** 知识库文档表格纯组件：多选、可排序表头、类型图标、密级徽标、分页与状态占位。 */
import type { DoclibDocument, DoclibT, DocumentSortField, SortState } from '../model.ts'
import {
  directoryLabel, doclibPageNumbers, enumLabel, formatTime, mimeKind, parseStatusKey, selectionState,
  sensitivityKey,
} from '../viewmodel.ts'
import { FileBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 单行文档：标题可点开详情，解析失败时附提示徽标，右键打开操作菜单。 */
function DocumentRow({ document, selected, t, onOpen, onMenu, onToggle }: {
  readonly document: DoclibDocument
  readonly selected: boolean
  readonly t: DoclibT
  readonly onOpen: (document: DoclibDocument) => void
  readonly onMenu: (event: React.MouseEvent, document: DoclibDocument) => void
  readonly onToggle: (id: string) => void
}) {
  const name = document.title || document.originalName || '—'
  return <tr onContextMenu={(event) => { event.preventDefault(); onMenu(event, document) }}>
    <td className={filesCss.checkColumn}>
      <input type="checkbox" checked={selected}
        aria-label={t('doclib.files.selectRow', { name })}
        onChange={() => { onToggle(document.id) }} />
    </td>
    <td className={css.nameCell}>
      <FileBadge kind={mimeKind(document.mimeType)} />
      <button type="button" className={css.nameButton} title={name} onClick={() => { onOpen(document) }}>{name}</button>
      {document.parseStatus === 'failed' && <span className={css.badgeFailed}>
        {enumLabel(t, document.parseStatus, parseStatusKey)}</span>}
    </td>
    <td className={css.mutedCell} title={document.directoryPath}>
      {directoryLabel(document.directoryPath) || '—'}
    </td>
    <td><span className={css.badge}>{enumLabel(t, document.sensitivity, sensitivityKey)}</span></td>
    <td className={css.mutedCell}>{formatTime(document.updatedAt)}</td>
  </tr>
}

/** 表格状态行：加载中、错误与空数据统一占位。 */
function TableState({ text, retry, t, onRetry }: {
  readonly text: string
  readonly retry: boolean
  readonly t: DoclibT
  readonly onRetry: () => void
}) {
  return <p className={css.tableState} role={retry ? 'alert' : undefined}>
    {text}
    {retry && <button type="button" className={css.linkButton} onClick={onRetry}>{t('doclib.retry')}</button>}
  </p>
}

/** 可排序表头。 */
function SortHeader({ field, label, sort, onSort, className }: {
  readonly field: DocumentSortField
  readonly label: string
  readonly sort: SortState<DocumentSortField> | undefined
  readonly onSort: (field: DocumentSortField) => void
  readonly className?: string | undefined
}) {
  const active = sort?.field === field
  return <th scope="col" className={className}
    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={filesCss.sortHeader} onClick={() => { onSort(field) }}>
      {label}{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  </th>
}

/**
 * 文档表格：名称/目录/密级/更新时间 + 多选列与分页。
 * @param props - 当前页文档、分页、选择与排序状态及回调。
 */
export function DocumentTable(props: {
  readonly documents: readonly DoclibDocument[]
  readonly page: number
  readonly pageCount: number | undefined
  readonly total: number | undefined
  readonly loading: boolean
  readonly error: 'login' | 'failed' | undefined
  readonly t: DoclibT
  readonly selected: ReadonlySet<string>
  readonly sort: SortState<DocumentSortField> | undefined
  readonly onPage: (page: number) => void
  readonly onOpen: (document: DoclibDocument) => void
  readonly onMenu: (event: React.MouseEvent, document: DoclibDocument) => void
  readonly onToggle: (id: string) => void
  readonly onToggleAll: (ids: readonly string[]) => void
  readonly onSort: (field: DocumentSortField) => void
  readonly onRetry: () => void
}) {
  const { documents, page, pageCount, total, loading, error, t, onPage, selected } = props
  const pages = doclibPageNumbers(page, pageCount)
  const headerState = selectionState(selected, documents.map(document => document.id))
  return <div className={css.body}>
    <div className={css.tableWrap}>
      {error !== undefined
        ? <TableState text={t(error === 'login' ? 'doclib.loginRequired' : 'doclib.listError')}
          retry t={t} onRetry={props.onRetry} />
        : loading && documents.length === 0
          ? <TableState text={t('doclib.loading')} retry={false} t={t} onRetry={props.onRetry} />
          : documents.length === 0
            ? <TableState text={t('doclib.empty')} retry={false} t={t} onRetry={props.onRetry} />
            : <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col" className={filesCss.checkColumn}>
                    <input type="checkbox" aria-label={t('doclib.files.selectAll')}
                      checked={headerState === 'all'}
                      ref={(element) => { if (element !== null) element.indeterminate = headerState === 'some' }}
                      onChange={() => { props.onToggleAll(documents.map(document => document.id)) }} />
                  </th>
                  <SortHeader field="title" label={t('doclib.column.title')} sort={props.sort} onSort={props.onSort} />
                  <SortHeader field="directory" label={t('doclib.column.directory')} sort={props.sort}
                    onSort={props.onSort} className={css.directoryColumn} />
                  <SortHeader field="sensitivity" label={t('doclib.column.sensitivity')} sort={props.sort}
                    onSort={props.onSort} />
                  <SortHeader field="updatedAt" label={t('doclib.column.updatedAt')} sort={props.sort}
                    onSort={props.onSort} />
                </tr>
              </thead>
              <tbody>
                {documents.map(document => <DocumentRow key={document.id} document={document}
                  selected={selected.has(document.id)} t={t} onOpen={props.onOpen}
                  onMenu={props.onMenu} onToggle={props.onToggle} />)}
              </tbody>
            </table>}
    </div>
    <nav className={css.pagination} aria-label={t('doclib.pagination')}>
      <span className={css.pageTotal}>{t('doclib.total', { total: total ?? 0 })}</span>
      <div className={css.pageControls}>
        <button type="button" className={css.pageButton} disabled={page <= 1}
          onClick={() => { onPage(page - 1) }}>{t('doclib.previousPage')}</button>
        <div className={css.pageNumbers}>
          {pages.map(number => <button key={number} type="button"
            className={page === number ? `${css.pageNumber} ${css.pageNumberActive}` : css.pageNumber}
            aria-current={page === number ? 'page' : undefined}
            onClick={() => { onPage(number) }}>{number}</button>)}
        </div>
        <button type="button" className={css.pageButton}
          disabled={pageCount === undefined || page >= pageCount}
          onClick={() => { onPage(page + 1) }}>{t('doclib.nextPage')}</button>
      </div>
    </nav>
  </div>
}
