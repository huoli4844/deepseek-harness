/** 个人资料表格：面包屑、搜索排序工具栏、多选与文件服务器式操作入口。 */
import type { DoclibT, WorkspaceSortField } from '../model.ts'
import type { WorkspaceBrowser } from '../use-workspace.ts'
import {
  fileKindKey, filterWorkspaceEntries, formatSize, kindByName, selectionState, sortWorkspaceEntries, toggleSort,
} from '../viewmodel.ts'
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
function SortHeader({ field, label, browser, className }: {
  readonly field: WorkspaceSortField
  readonly label: string
  readonly browser: WorkspaceBrowser
  readonly className?: string
}) {
  const active = browser.sort.field === field
  return <th scope="col" className={className}
    aria-sort={active ? (browser.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={filesCss.sortHeader}
      onClick={() => { browser.setSort(toggleSort(browser.sort, field)) }}>
      {label}{active ? (browser.sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
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
    <button type="button" className={filesCss.toolButton} onClick={actions.newFolder}>
      + {t('doclib.files.newFolder')}</button>
    <button type="button" className={filesCss.toolButton} disabled={browser.busy}
      onClick={actions.upload}>{t('doclib.files.upload')}</button>
    <button type="button" className={filesCss.toolButton} onClick={browser.refresh}>
      {t('doclib.files.refresh')}</button>
    {count > 0 && <div className={filesCss.selectionBar}>
      <span className={css.barCount}>{t('doclib.files.selected', { count })}</span>
      <button type="button" className={filesCss.toolButton} disabled={browser.busy}
        onClick={actions.downloadSelected}>{t('doclib.files.download')}</button>
      <button type="button" className={filesCss.toolButton} disabled={browser.busy}
        onClick={actions.copySelected}>{t('doclib.files.copy')}</button>
      <button type="button" className={filesCss.toolButton} disabled={browser.busy}
        onClick={actions.moveSelected}>{t('doclib.files.move')}</button>
      <button type="button" className={`${filesCss.toolButton} ${filesCss.dangerText}`} disabled={browser.busy}
        onClick={actions.deleteSelected}>{t('doclib.files.delete')}</button>
      <button type="button" className={css.linkButton} onClick={browser.clearSelection}>
        {t('doclib.files.clearSelection')}</button>
    </div>}
  </div>
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
  readonly onMenu: (event: React.MouseEvent, target: WorkspaceMenuTarget) => void
}) {
  const { browser, t } = props
  const { root, path, entries, loading, error } = browser
  const rows = filterWorkspaceEntries(sortWorkspaceEntries(entries, browser.sort), browser.keyword)
  const relativeOf = (name: string) => path === '' ? name : `${path}/${name}`
  const headerState = selectionState(browser.selected, rows.map(entry => relativeOf(entry.name)))
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
                    <SortHeader field="kind" label={t('doclib.column.kind')} browser={browser} />
                    <SortHeader field="size" label={t('doclib.column.size')} browser={browser} />
                    <th scope="col" className={filesCss.actionColumn}>{t('doclib.files.rowActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const directory = entry.type === 'directory'
                    const relative = relativeOf(entry.name)
                    return <tr key={relative}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        props.onMenu(event, { name: entry.name, relative, directory })
                      }}
                      onDoubleClick={() => {
                        if (directory) browser.navigate(relative)
                        else props.onOpenFile(relative)
                      }}>
                      <td className={filesCss.checkColumn}>
                        <input type="checkbox" checked={browser.selected.has(relative)}
                          aria-label={t('doclib.files.selectRow', { name: entry.name })}
                          onChange={() => { browser.toggleSelected(relative) }} />
                      </td>
                      <td className={css.nameCell}>
                        {directory
                          ? <><FolderBadge />
                            <button type="button" className={css.nameButton} title={entry.name}
                              onClick={() => { browser.navigate(relative) }}>{entry.name}</button></>
                          : <><FileBadge kind={kindByName(entry.name)} />
                            <span className={css.nameText} title={entry.name}>{entry.name}</span></>}
                      </td>
                      <td className={css.mutedCell}>{t(fileKindKey(entry.type))}</td>
                      <td className={css.mutedCell}>{directory ? '—' : formatSize(entry.size)}</td>
                      <td className={filesCss.actionColumn}>
                        <button type="button" className={filesCss.rowAction}
                          aria-label={t('doclib.files.rowActions')} title={t('doclib.files.rowActions')}
                          onClick={(event) => { props.onMenu(event, { name: entry.name, relative, directory }) }}>
                          ⋯</button>
                      </td>
                    </tr>
                  })}
                </tbody>
              </table>}
    </div>
  </div>
}
