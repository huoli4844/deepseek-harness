/** 个人资料表格纯组件：工作区面包屑 + 目录/文件列表，点击文件夹逐层进入。 */
import type { DoclibT } from '../model.ts'
import type { WorkspaceBrowser } from '../use-doclib.ts'
import { fileKindKey, formatSize, kindByName, sortWorkspaceEntries } from '../viewmodel.ts'
import { FileBadge, FolderBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'

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

/** 名称单元格：文件夹可进入，文件只读展示。 */
function NameCell({ name, directory, path, t, onNavigate }: {
  readonly name: string
  readonly directory: boolean
  readonly path: string
  readonly t: DoclibT
  readonly onNavigate: (path: string) => void
}) {
  if (directory) {
    return <td className={css.nameCell}>
      <FolderBadge />
      <button type="button" className={css.nameButton} title={name}
        onClick={() => { onNavigate(path) }}>{name}</button>
    </td>
  }
  return <td className={css.nameCell}>
    <FileBadge kind={kindByName(name)} />
    <span className={css.nameText} title={name}>{name}</span>
    <span className={css.visuallyHidden}>{t('doclib.fileKind.file')}</span>
  </td>
}

/**
 * 个人资料页主体：当前工作区目录的表格浏览。
 * @param props - 目录浏览状态与导航回调。
 */
export function WorkspaceTable(props: {
  readonly browser: WorkspaceBrowser
  readonly t: DoclibT
}) {
  const { browser, t } = props
  const { root, path, entries, loading, error, segments } = browser
  const rows = sortWorkspaceEntries(entries)
  return <div className={css.body}>
    <div className={css.bar}>
      <Breadcrumb segments={segments} t={t} onNavigate={browser.navigate} />
      {path !== '' && <button type="button" className={css.pageButton}
        onClick={() => { browser.navigate(segments.slice(0, -1).map(segment => segment.name).join('/')) }}>
        ↑ {t('doclib.personal.up')}</button>}
    </div>
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
                    <th scope="col">{t('doclib.column.name')}</th>
                    <th scope="col">{t('doclib.column.kind')}</th>
                    <th scope="col">{t('doclib.column.size')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const directory = entry.type === 'directory'
                    const childPath = path === '' ? entry.name : `${path}/${entry.name}`
                    return <tr key={childPath}>
                      <NameCell name={entry.name} directory={directory} path={childPath}
                        t={t} onNavigate={browser.navigate} />
                      <td className={css.mutedCell}>{t(fileKindKey(entry.type))}</td>
                      <td className={css.mutedCell}>{directory ? '—' : formatSize(entry.size)}</td>
                    </tr>
                  })}
                </tbody>
              </table>}
    </div>
  </div>
}
