/** 个人资料表格：面包屑、搜索排序工具栏、多选与文件服务器式操作入口。 */
import { useEffect, useRef } from 'react'
import {
  IconDownloadOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconTrashOutlineRegular,
  IconUploadOutlineRegular, Tooltip, type FileDragActions,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DoclibT, WorkspaceSortField } from '../model.ts'
import type { WorkspaceBrowser } from '../use-workspace.ts'
import type { WorkspaceDirEntry } from '../workspace-source.ts'
import { useFileRowDrag, type DraggableFile } from '../use-file-row-drag.ts'
import {
  fileKindKey, filterWorkspaceEntries, formatSize, kindByName, selectionState, sortWorkspaceEntries, toggleSort,
} from '../viewmodel.ts'
import { ColumnResizer, useColumnWidths } from './ColumnResizer.tsx'
import { FileBadge, FolderBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 右键/操作列命中的本地条目。 */
export interface WorkspaceMenuTarget {
  readonly name: string
  /** 工作区相对路径。 */
  readonly relative: string
  readonly directory: boolean
}

/** 工具栏动作。 */
export interface WorkspaceToolbarActions {
  readonly newFolder: () => void
  readonly upload: () => void
  readonly deleteSelected: () => void
  readonly moveSelected: () => void
  readonly copySelected: () => void
  readonly downloadSelected: () => void
}

/** 面包屑：根节点 + 已进入的每一层目录，末端不可点击。 */
function Breadcrumb({ segments, t, onNavigate }: {
  readonly segments: WorkspaceBrowser['segments']
  readonly t: DoclibT
  readonly onNavigate: (path: string) => void
}) {
  return <nav className={css.breadcrumb} aria-label={t('doclib.personal.breadcrumb')}>
    <button type="button" className={segments.length === 0 ? css.crumbCurrent : css.crumbButton}
      onClick={() => { onNavigate('') }}>{t('doclib.personal.rootLabel')}</button>
    {segments.map((segment, index) => <span key={segment.path} className={css.crumbPart}>
      <span className={css.crumbSep} aria-hidden="true">/</span>
      {index === segments.length - 1
        ? <span className={css.crumbCurrent}>{segment.name}</span>
        : <button type="button" className={css.crumbButton}
          onClick={() => { onNavigate(segment.path) }}>{segment.name}</button>}
    </span>)}
  </nav>
}

/** 可排序表头。 */
function SortHeader({ field, label, browser, className, style, children }: {
  readonly field: WorkspaceSortField
  readonly label: string
  readonly browser: WorkspaceBrowser
  readonly className?: string | undefined
  readonly style?: React.CSSProperties | undefined
  readonly children?: React.ReactNode
}) {
  const active = browser.sort.field === field
  return <th scope="col" className={className} style={style}
    aria-sort={active ? (browser.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={filesCss.sortHeader}
      onClick={() => { browser.setSort(toggleSort(browser.sort, field)) }}>
      {label}{active ? (browser.sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
    {children}
  </th>
}

/** 顶部工具栏：导航、搜索、排序与批量动作。 */
function Toolbar({ browser, actions, t }: {
  readonly browser: WorkspaceBrowser
  readonly actions: WorkspaceToolbarActions
  readonly t: DoclibT
}) {
  const { selected, segments, path } = browser
  const count = selected.size
  return <div className={css.bar}>
    <Breadcrumb segments={segments} t={t} onNavigate={browser.navigate} />
    {path !== '' && <button type="button" className={css.pageButton}
      onClick={() => { browser.navigate(segments.slice(0, -1).map(segment => segment.name).join('/')) }}>
      ↑ {t('doclib.personal.up')}</button>}
    <label className={css.searchBox}>
      <input className={css.searchInput} value={browser.keyword} placeholder={t('doclib.files.search')}
        aria-label={t('doclib.files.search')}
        onChange={(event) => { browser.setKeyword(event.target.value) }} />
    </label>
    <label className={css.filterBox}>
      <select className={css.filterSelect} value={browser.sort.field} aria-label={t('doclib.files.sort')}
        onChange={(event) => {
          const field = event.target.value as WorkspaceSortField
          browser.setSort({ field, direction: browser.sort.direction })
        }}>
        <option value="name">{t('doclib.files.sortName')}</option>
        <option value="kind">{t('doclib.files.sortKind')}</option>
        <option value="size">{t('doclib.files.sortSize')}</option>
      </select>
    </label>
    <button type="button" className={css.pageButton}
      aria-label={browser.sort.direction === 'asc' ? t('doclib.files.sortDesc') : t('doclib.files.sortAsc')}
      onClick={() => {
        browser.setSort({ field: browser.sort.field, direction: browser.sort.direction === 'asc' ? 'desc' : 'asc' })
      }}>{browser.sort.direction === 'asc' ? '↑' : '↓'}</button>
    <button type="button" className={filesCss.iconButton} onClick={actions.newFolder}
      aria-label={t('doclib.files.newFolder')} title={t('doclib.files.newFolder')}>
      <IconPlusOutlineRegular size={16} />
    </button>
    <button type="button" className={filesCss.iconButton} disabled={browser.busy}
      aria-label={t('doclib.files.upload')} title={t('doclib.files.upload')}
      onClick={actions.upload}>
      <IconUploadOutlineRegular size={16} />
    </button>
    <button type="button" className={filesCss.iconButton}
      aria-label={t('doclib.files.refresh')} title={t('doclib.files.refresh')}
      onClick={browser.refresh}>
      <IconRefreshOutlineRegular size={16} />
    </button>
    {count > 0 && <div className={filesCss.selectionBar}>
      <span className={css.barCount}>{t('doclib.files.selected', { count })}</span>
      <button type="button" className={filesCss.iconButton} disabled={browser.busy}
        aria-label={t('doclib.files.download')} title={t('doclib.files.download')}
        onClick={actions.downloadSelected}>
        <IconDownloadOutlineRegular size={16} />
      </button>
      <button type="button" className={filesCss.toolButton} disabled={browser.busy}
        onClick={actions.copySelected}>{t('doclib.files.copy')}</button>
      <button type="button" className={filesCss.toolButton} disabled={browser.busy}
        onClick={actions.moveSelected}>{t('doclib.files.move')}</button>
      <button type="button" className={`${filesCss.iconButton} ${filesCss.dangerText}`} disabled={browser.busy}
        aria-label={t('doclib.files.delete')} title={t('doclib.files.delete')}
        onClick={actions.deleteSelected}>
        <IconTrashOutlineRegular size={16} />
      </button>
      <button type="button" className={css.linkButton} onClick={browser.clearSelection}>
        {t('doclib.files.clearSelection')}</button>
    </div>}
  </div>
}

/**
 * 工作区单行：文件可拖到对话输入框，单击预览、双击用默认应用打开，目录进入下一层。
 * @param props - 条目、相对路径、选择状态与行内回调。
 */
function WorkspaceRow(props: {
  readonly entry: WorkspaceDirEntry
  readonly relative: string
  readonly directory: boolean
  readonly selected: boolean
  readonly t: DoclibT
  readonly fileDrag?: FileDragActions | undefined
  readonly dragFile?: ((relative: string, name: string) => DraggableFile | undefined) | undefined
  readonly onToggle: () => void
  readonly onNavigate: () => void
  readonly onPreview: (event: React.MouseEvent) => void
  readonly onOpen: () => void
  readonly onMenu: (event: React.MouseEvent) => void
}) {
  const { entry, relative, directory, t } = props
  const drag = useFileRowDrag(props.fileDrag, directory ? undefined : props.dragFile?.(relative, entry.name))
  return <tr draggable={drag.draggable}
    onPointerDown={drag.onPointerDown} onPointerUp={drag.onPointerUp}
    onPointerLeave={drag.onPointerLeave} onDragStart={drag.onDragStart}
    onDragEnd={drag.onDragEnd} onClickCapture={drag.onClickCapture}
    onContextMenu={(event) => {
      event.preventDefault()
      props.onMenu(event)
    }}
    onDoubleClick={() => {
      if (directory) {
        props.onNavigate()
      } else {
        props.onOpen()
      }
    }}>
    <td className={filesCss.checkColumn}>
      <input type="checkbox" checked={props.selected}
        aria-label={t('doclib.files.selectRow', { name: entry.name })}
        onChange={props.onToggle} />
    </td>
    <td className={css.nameCell}>
      {directory
        ? <><FolderBadge />
          <Tooltip label={entry.name} onlyWhenClipped portal side="bottom">
            <button type="button" className={css.nameButton}
              onClick={props.onNavigate}>{entry.name}</button>
          </Tooltip></>
        : <><FileBadge kind={kindByName(entry.name)} />
          <Tooltip label={entry.name} onlyWhenClipped portal side="bottom">
            <button type="button" className={css.nameButton}
              onClick={props.onPreview}>{entry.name}</button>
          </Tooltip></>}
    </td>
    <td className={`${css.mutedCell} ${css.kindColumn}`}>
      <Tooltip label={t(fileKindKey(entry.type))} onlyWhenClipped portal side="bottom">
        <span className={css.cellText}>{t(fileKindKey(entry.type))}</span>
      </Tooltip>
    </td>
    <td className={`${css.mutedCell} ${css.sizeColumn}`}>
      <Tooltip label={directory ? '—' : formatSize(entry.size)} onlyWhenClipped portal side="bottom">
        <span className={css.cellText}>{directory ? '—' : formatSize(entry.size)}</span>
      </Tooltip>
    </td>
    <td className={filesCss.actionColumn} data-no-drag>
      <button type="button" className={filesCss.rowAction}
        aria-label={t('doclib.files.rowActions')} title={t('doclib.files.rowActions')}
        onClick={props.onMenu}>
        ⋯</button>
    </td>
  </tr>
}

/**
 * 个人资料页主体：当前工作区目录的表格浏览与批量操作。
 * @param props - 目录浏览状态、工具栏动作与右键回调。
 */
export function WorkspaceTable(props: {
  readonly browser: WorkspaceBrowser
  readonly t: DoclibT
  readonly actions: WorkspaceToolbarActions
  readonly onOpenFile: (relativePath: string) => void
  readonly onPreviewFile: (relativePath: string) => void
  readonly onMenu: (event: React.MouseEvent, target: WorkspaceMenuTarget) => void
  /** 拖拽到对话输入框所需的宿主服务；缺失时文件行不可拖。 */
  readonly fileDrag?: FileDragActions | undefined
  readonly dragFile?: ((relative: string, name: string) => DraggableFile | undefined) | undefined
}) {
  const { browser, t } = props
  const { root, path, entries, loading, error } = browser
  const rows = filterWorkspaceEntries(sortWorkspaceEntries(entries, browser.sort), browser.keyword)
  const relativeOf = (name: string) => path === '' ? name : `${path}/${name}`
  const headerState = selectionState(browser.selected, rows.map(entry => relativeOf(entry.name)))
  // 列宽只在拖动后写入内联样式，未拖动过的列沿用样式表默认宽度。
  const { widths, resize } = useColumnWidths<'kind' | 'size'>()
  const widthStyle = (width: number | undefined): React.CSSProperties | undefined =>
    width === undefined ? undefined : { width }
  // 单击预览、双击用默认应用打开共存：预览延迟触发，双击时取消。
  const pendingOpen = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelPendingOpen = () => {
    if (pendingOpen.current !== undefined) {
      clearTimeout(pendingOpen.current)
      pendingOpen.current = undefined
    }
  }
  useEffect(() => () => {
    if (pendingOpen.current !== undefined) clearTimeout(pendingOpen.current)
  }, [])
  const openPreviewOnClick = (event: React.MouseEvent, relative: string) => {
    if (event.detail > 1) {
      cancelPendingOpen()
      return
    }
    cancelPendingOpen()
    pendingOpen.current = setTimeout(() => {
      pendingOpen.current = undefined
      props.onPreviewFile(relative)
    }, 300)
  }
  return <div className={css.body}>
    <Toolbar browser={browser} actions={props.actions} t={t} />
    <div className={css.tableWrap}>
      {root === undefined
        ? <p className={css.tableState}>{t('doclib.personal.empty')}</p>
        : error
          ? <p className={css.tableState} role="alert">
            {t('doclib.personal.error')}
            <button type="button" className={css.linkButton} onClick={browser.refresh}>{t('doclib.retry')}</button>
          </p>
          : loading && rows.length === 0
            ? <p className={css.tableState}>{t('doclib.personal.loading')}</p>
            : rows.length === 0
              ? <p className={css.tableState}>{t('doclib.personal.emptyDir')}</p>
              : <table className={css.table}>
                <thead>
                  <tr>
                    <th scope="col" className={filesCss.checkColumn}>
                      <input type="checkbox" aria-label={t('doclib.files.selectAll')}
                        checked={headerState === 'all'}
                        ref={(element) => { if (element !== null) element.indeterminate = headerState === 'some' }}
                        onChange={browser.toggleAll} />
                    </th>
                    <SortHeader field="name" label={t('doclib.column.name')} browser={browser} />
                    <SortHeader field="kind" label={t('doclib.column.kind')} browser={browser}
                      className={css.kindColumn} style={widthStyle(widths.kind)}>
                      <ColumnResizer label={t('doclib.column.resize')}
                        onResize={(width) => { resize('kind', width) }} />
                    </SortHeader>
                    <SortHeader field="size" label={t('doclib.column.size')} browser={browser}
                      className={css.sizeColumn} style={widthStyle(widths.size)}>
                      <ColumnResizer label={t('doclib.column.resize')}
                        onResize={(width) => { resize('size', width) }} />
                    </SortHeader>
                    <th scope="col" className={filesCss.actionColumn}>{t('doclib.files.rowActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const directory = entry.type === 'directory'
                    const relative = relativeOf(entry.name)
                    return <WorkspaceRow key={relative} entry={entry} relative={relative}
                      directory={directory} selected={browser.selected.has(relative)} t={t}
                      fileDrag={props.fileDrag} dragFile={props.dragFile}
                      onToggle={() => { browser.toggleSelected(relative) }}
                      onNavigate={() => { browser.navigate(relative) }}
                      onPreview={(event) => { openPreviewOnClick(event, relative) }}
                      onOpen={() => {
                        cancelPendingOpen()
                        props.onOpenFile(relative)
                      }}
                      onMenu={(event) => { props.onMenu(event, { name: entry.name, relative, directory }) }} />
                  })}
                </tbody>
              </table>}
    </div>
  </div>
}
