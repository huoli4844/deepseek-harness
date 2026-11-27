/** 资料库左侧分类栏纯组件：分类导航、工作区路径或集合与目录树、存储设置。 */
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DoclibCollection, DoclibDirectoryNode, DoclibTab, DoclibT } from '../model.ts'
import type { WorkspaceOption } from '../workspace-source.ts'
import { visibleDirectoryNodes } from '../viewmodel.ts'
import css from '../doclib.module.css'
import treeCss from './DoclibRail.module.css'

/** 左侧导航的分类顺序。 */
const TAB_ORDER: readonly DoclibTab[] = ['personal', 'projects', 'policies']

/** 分类图标：文件夹、图层、制度手册，均为内联 SVG，不引入额外依赖。 */
function RailGlyph({ tab }: { readonly tab: DoclibTab }) {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }
  if (tab === 'personal') {
    return <svg {...common} aria-hidden="true">
      <path d="M1.8 4.2a1 1 0 0 1 1-1h3l1.2 1.4h5.2a1 1 0 0 1 1 1v6.2a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" />
    </svg>
  }
  if (tab === 'projects') {
    return <svg {...common} aria-hidden="true">
      <path d="M8 2.2 14 5.4 8 8.6 2 5.4z" />
      <path d="M2 8.4 8 11.6l6-3.2M2 11.2 8 14.4l6-3.2" />
    </svg>
  }
  return <svg {...common} aria-hidden="true">
    <path d="M3.2 2.6h6.4a1 1 0 0 1 1 1v9.8H4.2a1 1 0 0 1-1-1z" />
    <path d="M10.6 5.2h2.2v8.2h-2.2M5.4 5.4h3M5.4 7.6h3M5.4 9.8h2" />
  </svg>
}

/** 集合列表：加载中、失败与空态都给出明确文案。 */
function CollectionList({ collections, collectionId, loading, error, t, onSelect }: {
  readonly collections: readonly DoclibCollection[]
  readonly collectionId: string
  readonly loading: boolean
  readonly error: boolean
  readonly t: DoclibT
  readonly onSelect: (id: string) => void
}) {
  if (loading && collections.length === 0) return <p className={css.railEmpty}>{t('doclib.collection.loading')}</p>
  if (error && collections.length === 0) return <p className={css.railEmpty}>{t('doclib.collection.error')}</p>
  if (collections.length === 0) return <p className={css.railEmpty}>{t('doclib.collection.empty')}</p>
  return <ul className={css.railList}>
    {collections.map(collection => <li key={collection.id}>
      <Tooltip label={collection.description || collection.name} onlyWhenClipped portal>
        <button type="button"
          className={collection.id === collectionId ? `${css.railListItem} ${css.railListItemActive}` : css.railListItem}
          onClick={() => { onSelect(collection.id) }}>
          <span className={css.railItemDot} aria-hidden="true" />
          <span className={css.railItemText}>{collection.name || collection.code || collection.id}</span>
        </button>
      </Tooltip>
    </li>)}
  </ul>
}

/**
 * 目录列表：由文档 directory_path 聚合，点击按目录过滤文档（本地模式）。
 * @param props - 目录节点、当前选中目录与回调。
 */
function DirectoryList(props: {
  readonly directories: readonly DoclibDirectoryNode[]
  readonly directory: string
  readonly loading: boolean
  readonly collapsed: ReadonlySet<string>
  readonly t: DoclibT
  readonly onSelect: (path: string) => void
  readonly onToggle: (path: string) => void
}) {
  const { directories, directory, loading, collapsed, t } = props
  if (loading && directories.length === 0) {
    return <p className={css.railEmpty}>{t('doclib.rail.directoryIndexing')}</p>
  }
  return <ul className={css.railList}>
    <li>
      <button type="button"
        className={directory === '' ? `${css.railListItem} ${css.railListItemActive}` : css.railListItem}
        onClick={() => { props.onSelect('') }}>
        <span className={css.railItemText}>{t('doclib.rail.allDocuments')}</span>
      </button>
    </li>
    {visibleDirectoryNodes(directories, collapsed).map((node) => {
      const expanded = !collapsed.has(node.path)
      const toggleLabel = t(expanded ? 'doclib.rail.collapse' : 'doclib.rail.expand')
      return <li key={node.path} className={treeCss.railTreeRow} style={{ paddingInlineStart: 4 + node.depth * 12 }}>
        {node.hasChildren
          ? <button type="button" className={treeCss.railTreeToggle}
            title={toggleLabel} aria-label={`${toggleLabel} ${node.name}`} aria-expanded={expanded}
            onClick={() => { props.onToggle(node.path) }}>{expanded ? '▾' : '▸'}</button>
          : <span className={treeCss.railTreeSpacer} aria-hidden="true" />}
        <Tooltip label={node.path || node.name} onlyWhenClipped portal>
          <button type="button"
            className={node.path === directory
              ? `${css.railListItem} ${treeCss.railTreeRowButton} ${css.railListItemActive}`
              : `${css.railListItem} ${treeCss.railTreeRowButton}`}
            onClick={() => { props.onSelect(node.path) }}>
            <span className={css.railItemText}>{node.name}</span>
            <span className={css.railCount}>{node.count}</span>
          </button>
        </Tooltip>
      </li>
    })}
  </ul>
}

/**
 * 资料库左侧栏：分类导航 + 当前分类的次级内容（工作区路径 / 集合与目录）。
 * @param props - 当前分类、知识库集合与目录状态、存储设置入口。
 */
export function DoclibRail(props: {
  readonly active: DoclibTab
  readonly t: DoclibT
  readonly workspaceRoot: string | undefined
  readonly workspaceTitle: string | undefined
  readonly workspaceId: string | undefined
  readonly workspaceOptions: readonly WorkspaceOption[]
  readonly onSelectWorkspace: (workspaceId: string) => void
  readonly collections: readonly DoclibCollection[]
  readonly collectionId: string
  readonly collectionsLoading: boolean
  readonly collectionsError: boolean
  readonly directories: readonly DoclibDirectoryNode[]
  readonly directory: string
  readonly collapsedDirectories: ReadonlySet<string>
  readonly indexLoading: boolean
  readonly onSelectTab: (tab: DoclibTab) => void
  readonly onSelectCollection: (id: string) => void
  readonly onSelectDirectory: (path: string) => void
  readonly onToggleDirectory: (path: string) => void
  readonly onOpenStorage: () => void
}) {
  const { active, t, workspaceRoot, collections, collectionId } = props
  return <aside className={css.rail}>
    <nav className={css.railNav} aria-label={t('doclib.panel')}>
      {TAB_ORDER.map(tab => <button key={tab} type="button"
        className={tab === active ? `${css.railItem} ${css.railItemActive}` : css.railItem}
        aria-current={tab === active ? 'page' : undefined}
        onClick={() => { props.onSelectTab(tab) }}>
        <span className={css.railItemIcon}><RailGlyph tab={tab} /></span>
        <span className={css.railItemText}>{t(`doclib.tab.${tab}`)}</span>
      </button>)}
    </nav>
    <div className={css.railSections}>
      <section className={css.railSection}>
        <div className={css.railSectionHead}>
          {active === 'personal' ? t('doclib.rail.workspace') : t('doclib.rail.collections')}
        </div>
        {active === 'personal'
          ? <div className={css.railPath}>
            {props.workspaceOptions.length > 1 && props.workspaceId !== undefined
              ? <select
                className={css.railWorkspaceSelect}
                value={props.workspaceId}
                aria-label={t('doclib.rail.switchWorkspace')}
                title={t('doclib.rail.switchWorkspace')}
                onChange={(event) => { props.onSelectWorkspace(event.target.value) }}
              >
                {props.workspaceOptions.map(option => (
                  <option key={option.workspaceId} value={option.workspaceId}>
                    {option.title ?? t('doclib.rail.ungrouped')}
                  </option>
                ))}
              </select>
              : <strong className={css.railPathName}>
                {props.workspaceTitle ?? t('doclib.rail.workspaceName')}
              </strong>}
            <Tooltip label={workspaceRoot ?? '—'} onlyWhenClipped portal>
              <span className={css.railPathValue}>{workspaceRoot ?? '—'}</span>
            </Tooltip>
          </div>
          : <CollectionList collections={collections} collectionId={collectionId}
            loading={props.collectionsLoading} error={props.collectionsError} t={t}
            onSelect={props.onSelectCollection} />}
      </section>
      {active !== 'personal' && <section className={css.railSection}>
        <div className={css.railSectionHead}>{t('doclib.rail.directories')}</div>
        <DirectoryList directories={props.directories} directory={props.directory}
          loading={props.indexLoading} collapsed={props.collapsedDirectories} t={t}
          onSelect={props.onSelectDirectory} onToggle={props.onToggleDirectory} />
      </section>}
    </div>
    <div className={css.railFooter}>
      <span>{active === 'personal' ? t('doclib.files.accessPersonal') : t('doclib.rail.readonly')}</span>
      <button type="button" className={css.railAction} title={t('doclib.storage.title')}
        aria-label={t('doclib.storage.title')} onClick={props.onOpenStorage}>⚙</button>
    </div>
  </aside>
}
