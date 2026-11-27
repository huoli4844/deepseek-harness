/** 资料库容器：左侧分类栏 + 右侧内容区的状态编排、右键菜单与文件动作。 */
import { useMemo, useRef, useState } from 'react'
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import type { FileDragActions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DoclibDocument, DoclibT } from './model.ts'
import type { MutationOutcome } from './use-doclib.ts'
import type { SessionsService, WorkspaceFilesRemote, WorkspacesService } from './workspace-source.ts'
import { useKnowledgeTab, useWorkspaceBrowser } from './use-doclib.ts'
import { useStorageSettings } from './use-storage.ts'
import { createDoclibHandlers, failureKey } from './doclib-handlers.ts'
import { downloadDocument, downloadWorkspaceEntry } from './file-actions.ts'
import { fetchDocumentDetail, fetchPreviewBlob } from './source.ts'
import { attachFilesToConversation, type AttachOutcome } from './attach-to-conversation.ts'
import type { DraggableFile } from './use-file-row-drag.ts'
import { previewExtension, previewMode } from './preview-viewmodel.ts'
import { localMenuItems, remoteMenuItems, type LocalMenuAction, type RemoteMenuAction } from './doclib-menus.ts'
import { mimeKind, toggleSort, type DoclibMimeKind } from './viewmodel.ts'
import { DoclibRail } from './components/DoclibRail.tsx'
import { DoclibTopBar } from './components/DoclibToolbar.tsx'
import { DocumentTable } from './components/DocumentTable.tsx'
import { DocumentDetailDialog } from './components/DocumentDetailDialog.tsx'
import { PreviewDialogMount, type PreviewTarget } from './components/PreviewDialogMount.tsx'
import { FileContextMenu, type ContextMenuItem, type ContextMenuState } from './components/FileContextMenu.tsx'
import { StorageSettingsDialog } from './components/StorageSettingsDialog.tsx'
import { WorkspaceTable, type WorkspaceMenuTarget } from './components/WorkspaceTable.tsx'
import { DoclibDialogs, type DoclibDialog } from './components/DoclibDialogs.tsx'
import { EntryDetailDialog } from './components/EntryDetailDialog.tsx'
import css from './doclib.module.css'

/** 左侧分类栏宽度：默认值、可拖范围与持久化键。 */
const RAIL_WIDTH_KEY = 'yuanshu-doclib-rail-width'
const RAIL_DEFAULT_WIDTH = 216
const RAIL_MIN_WIDTH = 180
const RAIL_MAX_WIDTH = 420
/** 右侧内容区保留的最小宽度，避免拖拽把表格挤没。 */
const CONTENT_MIN_WIDTH = 360

/** 读取上次拖动后的左栏宽度，数据异常时回到默认值。 */
function initialRailWidth(): number {
  try {
    const stored = Number(localStorage.getItem(RAIL_WIDTH_KEY))
    if (Number.isFinite(stored) && stored >= RAIL_MIN_WIDTH) return Math.min(RAIL_MAX_WIDTH, stored)
  } catch {
    // 隐私模式等场景下 localStorage 不可用，直接使用默认宽度。
  }
  return RAIL_DEFAULT_WIDTH
}

/** NAS 设置弹窗挂载点：打开时才读取配置与健康状态。 */
function StorageDialogMount({ t, onClose }: {
  readonly t: DoclibT
  readonly onClose: () => void
}) {
  const settings = useStorageSettings()
  return <StorageSettingsDialog settings={settings} t={t} onClose={onClose} />
}

/** 资料库面板属性：工作台嵌入时由宿主注入文案、会话与文件动作。 */
export interface DoclibPanelProps {
  readonly t: DoclibT
  readonly sessions: SessionsService
  readonly remote: WorkspaceFilesRemote & { readonly session: { readonly openWorkspacePath: (request: { path: string; action?: 'reveal' }, signal?: AbortSignal) => Promise<{ ok: boolean }> } }
  readonly fileActions?: FileActions | undefined
  /** 原生工作区列表；缺失时只显示当前工作区，无法切换。 */
  readonly workspaces?: WorkspacesService | undefined
  /** 宿主文件拖拽服务；提供时文件行可拖到右侧对话输入框。 */
  readonly fileDrag?: FileDragActions | undefined
}

/**
 * 资料库主面板：个人资料跟随 DSH 当前工作区，项目文件夹与公司制度文件浏览元枢知识库。
 * @param props - 文案坐席、宿主会话/Remote 服务与桌面文件动作。
 */
export function DoclibWorkbench(props: DoclibPanelProps) {
  const { t, sessions, remote, fileActions, workspaces, fileDrag } = props
  const [tab, setTab] = useState<'personal' | 'projects' | 'policies'>('personal')
  const [storageOpen, setStorageOpen] = useState(false)
  const [dialog, setDialog] = useState<DoclibDialog | undefined>(undefined)
  const [menu, setMenu] = useState<ContextMenuState | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  // 预览弹窗打开时只保存请求与动作；字节在挂载点内加载，关闭即卸载并释放本地地址。
  const [preview, setPreview] = useState<PreviewTarget | undefined>(undefined)
  // 记录被收起的目录路径；默认全部展开，新增目录节点也保持展开。
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(() => new Set())
  // 左侧栏宽度与拖动状态：默认 216px，拖动后持久化到本地。
  const [railWidth, setRailWidth] = useState(initialRailWidth)
  const railWidthRef = useRef(railWidth)
  const railDrag = useRef<{ startX: number; startWidth: number } | undefined>(undefined)
  const shellRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const localInput = useRef<HTMLInputElement>(null)
  const remoteInput = useRef<HTMLInputElement>(null)
  const projects = useKnowledgeTab(tab === 'projects')
  const policies = useKnowledgeTab(tab === 'policies')
  const browser = useWorkspaceBrowser(sessions, remote, workspaces)
  const kb = tab === 'projects' ? projects : tab === 'policies' ? policies : undefined
  const collectionName = kb?.currentCollection?.name ?? ''
  const scope = kb === undefined ? undefined : [collectionName, kb.directory].filter(part => part !== '').join(' / ')
  const subtitle = kb === undefined
    ? `${t('doclib.currentWorkspace')} · ${browser.root ?? '—'}`
    : `${scope || '—'} · ${t('doclib.total', { total: kb.total ?? 0 })}`
  // 类型统计基于当前页已加载文档，避免为统计额外拉取全量数据。
  const kindCounts = useMemo(() => {
    const counts = new Map<DoclibMimeKind, number>()
    for (const document of kb?.documents ?? []) {
      const kind = mimeKind(document.mimeType)
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1])
  }, [kb?.documents])

  const flash = (text: string) => {
    setNotice(text)
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => { setNotice(undefined) }, 2_400)
  }
  const applyRailWidth = (next: number) => {
    const available = shellRef.current?.clientWidth ?? 0
    const max = available > CONTENT_MIN_WIDTH
      ? Math.min(RAIL_MAX_WIDTH, available - CONTENT_MIN_WIDTH)
      : RAIL_MAX_WIDTH
    const width = Math.round(Math.min(max, Math.max(RAIL_MIN_WIDTH, next)))
    railWidthRef.current = width
    setRailWidth(width)
  }
  const persistRailWidth = () => {
    try {
      localStorage.setItem(RAIL_WIDTH_KEY, String(railWidthRef.current))
    } catch {
      // 存储不可用不影响本次拖拽结果。
    }
  }
  const openAt = (event: React.MouseEvent, items: readonly ContextMenuItem[]) => {
    setMenu({ x: event.clientX, y: event.clientY, items })
  }
  // 知识库列表不带 file_id，预览字节前先取详情拿到文件 ID；详情入口复用原字段详情弹窗。
  const openRemotePreview = (document: DoclibDocument) => {
    const name = document.title || document.originalName || document.id
    const fileName = document.originalName || document.title || document.id
    setPreview({
      request: {
        name,
        mimeType: document.mimeType,
        mode: previewMode(document.originalName || name, document.mimeType),
        updatedAt: document.updatedAt,
        extension: previewExtension(document.originalName || name),
        load: async (signal) => {
          const detail = document.fileId === '' ? await fetchDocumentDetail(document.id, signal) : document
          if (detail.fileId === '') throw new Error('missing preview file id')
          return fetchPreviewBlob(detail.fileId, signal)
        },
      },
      download: () => downloadDocument(fileActions, document.id, fileName),
      details: kb === undefined ? undefined : () => { kb.openDetail(document.id) },
      // 列表响应常缺 file_id：独立窗口在点击时再补取详情，避免打开弹窗前多一次请求。
      fileId: document.fileId === '' ? undefined : document.fileId,
      resolveFileId: async () => {
        const detail = await fetchDocumentDetail(document.id, new AbortController().signal)
        return detail.fileId === '' ? undefined : detail.fileId
      },
    })
  }
  // 本地文件没有 MIME，按扩展名判定渲染方式；字节走现有工作区下载路由。
  const loadLocalBytes = async (relative: string): Promise<Blob> => {
    const blob = await browser.blob(relative)
    if (blob === undefined) throw new Error('missing workspace file bytes')
    return blob
  }
  const openLocalPreview = (relative: string) => {
    const name = relative.slice(relative.lastIndexOf('/') + 1)
    const size = browser.entries.find(entry =>
      (browser.path === '' ? entry.name : `${browser.path}/${entry.name}`) === relative)?.size
    setPreview({
      request: { name, mimeType: '', mode: previewMode(name, ''), size, load: () => loadLocalBytes(relative) },
      download: () => downloadWorkspaceEntry(fileActions, name, () => loadLocalBytes(relative)),
      details: () => { browser.showDetail(relative) },
    })
  }
  const fileHandlers = createDoclibHandlers({ t, browser, kb, remote, fileActions, flash })
  // 列表响应常缺 file_id：取字节前先补详情。
  const loadRemoteBytes = async (document: DoclibDocument, signal: AbortSignal): Promise<Blob> => {
    const detail = document.fileId === '' ? await fetchDocumentDetail(document.id, signal) : document
    if (detail.fileId === '') throw new Error('missing preview file id')
    return fetchPreviewBlob(detail.fileId, signal)
  }
  // 拖到右侧对话输入框：字节在按下时预取，dragstart 交给宿主文件拖拽服务。
  const remoteDragFile = (document: DoclibDocument): DraggableFile | undefined => {
    if (fileDrag === undefined) return undefined
    return {
      name: document.originalName || document.title || document.id,
      mimeType: document.mimeType,
      load: signal => loadRemoteBytes(document, signal),
    }
  }
  const localDragFile = (relative: string, name: string): DraggableFile | undefined => {
    if (fileDrag === undefined) return undefined
    return {
      name,
      mimeType: '',
      size: browser.entries.find(entry =>
        (browser.path === '' ? entry.name : `${browser.path}/${entry.name}`) === relative)?.size,
      load: () => loadLocalBytes(relative),
    }
  }
  const flashAttach = (outcome: AttachOutcome) => {
    flash(t(outcome === 'attached' ? 'doclib.menu.attached' : 'doclib.menu.attachFailed'))
  }
  // 右键「添加至对话」：取到字节后交给对话输入框，与拖拽共用同一附件链路。
  const attachRemote = (document: DoclibDocument) => {
    void (async () => {
      try {
        const blob = await loadRemoteBytes(document, new AbortController().signal)
        const name = document.originalName || document.title || document.id
        flashAttach(attachFilesToConversation([new File([blob], name, { type: document.mimeType || blob.type })]))
      } catch {
        flash(t('doclib.menu.attachFailed'))
      }
    })()
  }
  const attachLocal = (relative: string, name: string) => {
    void (async () => {
      try {
        const blob = await loadLocalBytes(relative)
        flashAttach(attachFilesToConversation([new File([blob], name, { type: blob.type })]))
      } catch {
        flash(t('doclib.menu.attachFailed'))
      }
    })()
  }
  const finish = (outcome: MutationOutcome, success: string) => {
    flash(outcome === 'ok' ? success : t(failureKey(outcome)))
    return outcome === 'ok'
  }
  // 删除确认只在选中项包含文件夹时提示会连带删除内容。
  const hasDirectory = (items: readonly string[]) => items.some(relative => browser.entries.some(entry =>
    entry.type === 'directory' && (browser.path === '' ? entry.name : `${browser.path}/${entry.name}`) === relative))

  const localMenu = (target: WorkspaceMenuTarget) => {
    const items = browser.selected.size > 1 && browser.selected.has(target.relative)
      ? [...browser.selected]
      : [target.relative]
    const menuHandlers: Partial<Record<LocalMenuAction, () => void>> = {
      open: () => { fileHandlers.openLocal(target.relative, 'open') },
      openFolder: () => { browser.navigate(target.relative) },
      attach: () => { attachLocal(target.relative, target.name) },
      reveal: () => { fileHandlers.openLocal(target.relative, 'reveal') },
      download: () => { fileHandlers.downloadLocal([target.relative]) },
      rename: () => { setDialog({ kind: 'rename', name: target.name, relative: target.relative }) },
      move: () => { setDialog({ kind: 'move', items }) },
      copy: () => { setDialog({ kind: 'copy', items }) },
      delete: () => { setDialog({ kind: 'deleteLocal', items, hasDirectory: hasDirectory(items) }) },
      properties: () => { browser.showDetail(target.relative) },
      copyName: () => { fileHandlers.copy(target.name) },
      copyPath: () => { fileHandlers.copy(fileHandlers.absoluteOf(target.relative)) },
      batchDownload: () => { fileHandlers.downloadLocal(items) },
      batchMove: () => { setDialog({ kind: 'move', items }) },
      batchCopy: () => { setDialog({ kind: 'copy', items }) },
      batchDelete: () => { setDialog({ kind: 'deleteLocal', items, hasDirectory: hasDirectory(items) }) },
    }
    return menuHandlers
  }

  return <div className={css.shell} ref={shellRef}
    style={{ '--doclib-rail-width': `${railWidth}px` } as React.CSSProperties}>
    <DoclibRail active={tab} t={t} workspaceRoot={browser.root}
      workspaceTitle={browser.workspaceTitle} workspaceId={browser.workspaceId}
      workspaceOptions={browser.workspaceOptions} onSelectWorkspace={browser.selectWorkspace}
      collections={kb?.collections ?? []} collectionId={kb?.collectionId ?? ''}
      collectionsLoading={kb !== undefined && kb.collections.length === 0 && kb.loading}
      collectionsError={kb?.error === 'failed' && kb.collections.length === 0}
      directories={kb?.directories ?? []} directory={kb?.directory ?? ''}
      collapsedDirectories={collapsedDirectories}
      indexLoading={kb?.indexLoading ?? false}
      onSelectTab={setTab} onSelectCollection={(id) => { kb?.selectCollection(id) }}
      onSelectDirectory={(path) => { kb?.setDirectory(path) }}
      onToggleDirectory={(path) => {
        setCollapsedDirectories((previous) => {
          const next = new Set(previous)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
      }}
      onOpenStorage={() => { setStorageOpen(true) }} />
    <div className={css.railSplitter} role="separator" aria-orientation="vertical"
      aria-label={t('doclib.rail.resize')} aria-valuenow={railWidth}
      aria-valuemin={RAIL_MIN_WIDTH} aria-valuemax={RAIL_MAX_WIDTH}
      tabIndex={0} title={t('doclib.rail.resize')}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        railDrag.current = { startX: event.clientX, startWidth: railWidthRef.current }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = railDrag.current
        if (drag === undefined) return
        applyRailWidth(drag.startWidth + event.clientX - drag.startX)
      }}
      onPointerUp={(event) => {
        if (railDrag.current === undefined) return
        railDrag.current = undefined
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        persistRailWidth()
      }}
      onPointerCancel={() => {
        railDrag.current = undefined
        persistRailWidth()
      }}
      onDoubleClick={() => {
        applyRailWidth(RAIL_DEFAULT_WIDTH)
        persistRailWidth()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        applyRailWidth(railWidthRef.current + (event.key === 'ArrowLeft' ? -16 : 16))
        persistRailWidth()
      }} />
    <section className={css.main}>
      <header className={css.mainHead}>
        <h1 className={css.mainTitle}>{t(`doclib.tab.${tab}`)}</h1>
        <p className={css.mainSubtitle} title={subtitle}>{subtitle}</p>
      </header>
      {kb === undefined
        ? <WorkspaceTable browser={browser} t={t} fileDrag={fileDrag} dragFile={localDragFile}
          actions={{
            newFolder: () => { setDialog({ kind: 'newFolder' }) },
            upload: () => { localInput.current?.click() },
            deleteSelected: () => {
              const items = [...browser.selected]
              setDialog({ kind: 'deleteLocal', items, hasDirectory: hasDirectory(items) })
            },
            moveSelected: () => { setDialog({ kind: 'move', items: [...browser.selected] }) },
            copySelected: () => { setDialog({ kind: 'copy', items: [...browser.selected] }) },
            downloadSelected: () => { fileHandlers.downloadLocal([...browser.selected]) },
          }}
          onOpenFile={(relative) => { fileHandlers.openLocal(relative) }}
          onPreviewFile={openLocalPreview}
          onMenu={(event, target) => {
            openAt(event, localMenuItems({
              directory: target.directory,
              selectionCount: browser.selected.size,
              t,
              handlers: localMenu(target),
            }))
          }} />
        : <>
          <div className={css.stats} aria-label={t('doclib.stat.label')}>
            <div className={css.statCard}>
              <span className={css.statLabel}>{t('doclib.stat.total')}</span>
              <strong className={css.statValue}>{kb.total ?? 0}</strong>
            </div>
            {kindCounts.map(([kind, count]) => (
              <div key={kind} className={css.statCard}>
                <span className={css.statLabel}>{t(`doclib.stat.kind.${kind}`)}</span>
                <strong className={css.statValue}>{count}</strong>
              </div>
            ))}
            <span className={css.statHint}>{t('doclib.stat.hint')}</span>
          </div>
          <DoclibTopBar draft={kb.draft} typeFilter={kb.typeFilter}
            shown={kb.visibleDocuments.length} pageTotal={kb.documents.length} t={t}
            sort={kb.sort} selectedCount={kb.selected.size} busy={kb.busy}
            onInput={kb.inputDraft} onSubmit={kb.submitSearch} onClear={kb.clearSearch}
            onTypeFilter={kb.setTypeFilter}
            onSort={(field) => {
              kb.setSort(field === undefined ? undefined : toggleSort(kb.sort, field))
            }}
            onToggleDirection={kb.toggleSortDirection}
            onUpload={() => { remoteInput.current?.click() }}
            onRefresh={kb.retry}
            onDownloadSelected={() => { fileHandlers.downloadRemoteMany(kb.selectedDocuments) }}
            onDeleteSelected={() => { setDialog({ kind: 'deleteRemote', ids: [...kb.selected], names: [] }) }}
            onClearSelection={kb.clearSelection} />
          <DocumentTable documents={kb.visibleDocuments} page={kb.page} pageCount={kb.pageCount}
            total={kb.total} loading={kb.loading} error={kb.error} t={t}
            selected={kb.selected} sort={kb.sort}
            fileDrag={fileDrag} dragFile={remoteDragFile}
            onPage={kb.goToPage} onOpen={openRemotePreview}
            onToggle={kb.toggleSelected} onToggleAll={kb.toggleAll}
            onSort={(field) => { kb.setSort(toggleSort(kb.sort, field)) }}
            onMenu={(event, document) => {
              const handlers: Partial<Record<RemoteMenuAction, () => void>> = {
                attach: () => { attachRemote(document) },
                download: () => { fileHandlers.downloadRemote(document) },
                preview: () => { openRemotePreview(document) },
                properties: () => { kb.openDetail(document.id) },
                delete: () => {
                  setDialog({
                    kind: 'deleteRemote',
                    ids: [document.id],
                    names: [document.title || document.originalName],
                  })
                },
                copyName: () => { fileHandlers.copy(document.title || document.originalName) },
                copyDirectory: () => { fileHandlers.copy(document.directoryPath) },
              }
              openAt(event, remoteMenuItems(t, handlers))
            }}
            onRetry={kb.retry} />
        </>}
      {preview !== undefined && <PreviewDialogMount target={preview} t={t} flash={flash}
        onClose={() => { setPreview(undefined) }} />}
      {kb?.detail !== undefined && <DocumentDetailDialog document={kb.detail}
        previewPending={kb.previewPending} previewError={kb.previewError} t={t}
        onPreview={kb.preview}
        onDownload={() => { if (kb.detail !== undefined) fileHandlers.downloadRemote(kb.detail) }}
        onClose={kb.closeDetail} />}
      {browser.detail !== undefined && <EntryDetailDialog detail={browser.detail} root={browser.root}
        t={t} onDownload={() => { if (browser.detail !== undefined) fileHandlers.downloadLocal([browser.detail.relative]) }}
        onClose={browser.closeDetail} />}
    </section>
    <input ref={localInput} type="file" multiple hidden aria-hidden="true"
      onChange={(event) => { fileHandlers.uploadLocal(event.target.files); event.target.value = '' }} />
    <input ref={remoteInput} type="file" multiple hidden aria-hidden="true"
      onChange={(event) => { fileHandlers.uploadRemote(event.target.files); event.target.value = '' }} />
    {dialog !== undefined && <DoclibDialogs dialog={dialog} t={t}
      onClose={() => { setDialog(undefined) }}
      onNewFolder={async name => finish(await browser.createFolder(name), t('doclib.files.done'))}
      onRename={async (source, name) => finish(await browser.rename(source, name), t('doclib.files.done'))}
      onMove={async (items, target) => finish(await browser.move(items, target), t('doclib.files.done'))}
      onCopy={async (items, target) => finish(await browser.copy(items, target), t('doclib.files.done'))}
      onDeleteLocal={async items => finish(await browser.remove(items), t('doclib.files.deleted'))}
      onDeleteRemote={async (ids) => {
        if (kb === undefined) return false
        return finish(await kb.remove(ids), t('doclib.files.deleted'))
      }} />}
    {menu !== undefined && <FileContextMenu menu={menu} onClose={() => { setMenu(undefined) }} />}
    {notice !== undefined && <div className={css.toast} role="status">{notice}</div>}
    {storageOpen && <StorageDialogMount t={t} onClose={() => { setStorageOpen(false) }} />}
  </div>
}
