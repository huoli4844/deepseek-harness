/** 知识库文档表格纯组件：多选、可排序表头、类型图标、密级徽标、分页与状态占位。 */
import { Tooltip, type FileDragActions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DoclibDocument, DoclibT, DocumentSortField, SortState } from '../model.ts'
import {
  doclibPageNumbers, enumLabel, formatTime, mimeKind, parseStatusKey, selectionState, sensitivityKey,
} from '../viewmodel.ts'
import { useFileRowDrag, type DraggableFile } from '../use-file-row-drag.ts'
import { ColumnResizer, useColumnWidths } from './ColumnResizer.tsx'
import { FileBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 点击是否落在勾选框或按钮等行内控件上，避免勾选与菜单操作同时触发预览。 */
function interactiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, input, a, select, label') !== null
}

/** 单行文档：整行单击打开预览，解析失败时附提示徽标，右键打开操作菜单。 */
function DocumentRow({ document, selected, t, onOpen, onMenu, onToggle, fileDrag, dragFile }: {
  readonly document: DoclibDocument
  readonly selected: boolean
  readonly t: DoclibT
  readonly onOpen: (document: DoclibDocument) => void
  readonly onMenu: (event: React.MouseEvent, document: DoclibDocument) => void
  readonly onToggle: (id: string) => void
  readonly fileDrag?: FileDragActions | undefined
  readonly dragFile?: ((document: DoclibDocument) => DraggableFile | undefined) | undefined
}) {
  const name = document.title || document.originalName || '—'
  const sensitivity = enumLabel(t, document.sensitivity, sensitivityKey)
  const updated = formatTime(document.updatedAt)
  const drag = useFileRowDrag(fileDrag, dragFile?.(document))
  return <tr draggable={drag.draggable}
    onPointerDown={drag.onPointerDown} onPointerUp={drag.onPointerUp}
    onPointerLeave={drag.onPointerLeave} onDragStart={drag.onDragStart}
    onDragEnd={drag.onDragEnd} onClickCapture={drag.onClickCapture}
    onClick={(event) => { if (!interactiveTarget(event.target)) onOpen(document) }}
    onContextMenu={(event) => { event.preventDefault(); onMenu(event, document) }}>
    <td className={filesCss.checkColumn}>
      <input type="checkbox" checked={selected}
        aria-label={t('doclib.files.selectRow', { name })}
        onChange={() => { onToggle(document.id) }} />
    </td>
    <td className={css.nameCell}>
      <FileBadge kind={mimeKind(document.mimeType)} />
      <Tooltip label={name} onlyWhenClipped portal side="bottom">
        <button type="button" className={css.nameButton}
          onClick={() => { onOpen(document) }}>{name}</button>
      </Tooltip>
      {document.parseStatus === 'failed' && <span className={css.badgeFailed}>
        {enumLabel(t, document.parseStatus, parseStatusKey)}</span>}
    </td>
    <td className={css.sensitivityColumn}>
      <Tooltip label={sensitivity} onlyWhenClipped portal side="bottom">
        <span className={css.badge}>{sensitivity}</span>
      </Tooltip>
    </td>
    <td className={`${css.mutedCell} ${css.updatedColumn}`}>
      <Tooltip label={updated} onlyWhenClipped portal side="bottom">
        <span className={css.cellText}>{updated}</span>
      </Tooltip>
    </td>
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
function SortHeader({ field, label, sort, onSort, className, style, children }: {
  readonly field: DocumentSortField
  readonly label: string
  readonly sort: SortState<DocumentSortField> | undefined
  readonly onSort: (field: DocumentSortField) => void
  readonly className?: string | undefined
  readonly style?: React.CSSProperties | undefined
  readonly children?: React.ReactNode
}) {
  const active = sort?.field === field
  return <th scope="col" className={className} style={style}
    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={filesCss.sortHeader} onClick={() => { onSort(field) }}>
      {label}{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
    {children}
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
  /** 拖拽到对话输入框所需的宿主服务；缺失时行不可拖。 */
  readonly fileDrag?: FileDragActions | undefined
  readonly dragFile?: ((document: DoclibDocument) => DraggableFile | undefined) | undefined
}) {
  const { documents, page, pageCount, total, loading, error, t, onPage, selected } = props
  const pages = doclibPageNumbers(page, pageCount)
  const headerState = selectionState(selected, documents.map(document => document.id))
  // 列宽只在拖动后写入内联样式，未拖动过的列沿用样式表默认宽度。
  const { widths, resize } = useColumnWidths<'sensitivity' | 'updated'>()
  const widthStyle = (width: number | undefined): React.CSSProperties | undefined =>
    width === undefined ? undefined : { width }
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
                  <SortHeader field="sensitivity" label={t('doclib.column.sensitivity')} sort={props.sort}
                    onSort={props.onSort} className={css.sensitivityColumn} style={widthStyle(widths.sensitivity)}>
                    <ColumnResizer label={t('doclib.column.resize')}
                      onResize={(width) => { resize('sensitivity', width) }} />
                  </SortHeader>
                  <SortHeader field="updatedAt" label={t('doclib.column.updatedAt')} sort={props.sort}
                    onSort={props.onSort} className={css.updatedColumn} style={widthStyle(widths.updated)}>
                    <ColumnResizer label={t('doclib.column.resize')}
                      onResize={(width) => { resize('updated', width) }} />
                  </SortHeader>
                </tr>
              </thead>
              <tbody>
                {documents.map(document => <DocumentRow key={document.id} document={document}
                  selected={selected.has(document.id)} t={t} onOpen={props.onOpen}
                  onMenu={props.onMenu} onToggle={props.onToggle}
                  fileDrag={props.fileDrag} dragFile={props.dragFile} />)}
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
