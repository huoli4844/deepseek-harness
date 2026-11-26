/** 资料库容器：左侧分类栏 + 右侧内容区的状态编排、右键菜单与文件动作。 */
import { useRef, useState } from 'react'
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import type { DoclibT } from './model.ts'
import type { MutationOutcome } from './use-doclib.ts'
import type { SessionsService, WorkspaceFilesRemote } from './workspace-source.ts'
import { useKnowledgeTab, useWorkspaceBrowser } from './use-doclib.ts'
import { useStorageSettings } from './use-storage.ts'
import { createDoclibHandlers, failureKey } from './doclib-handlers.ts'
import { localMenuItems, remoteMenuItems, type LocalMenuAction, type RemoteMenuAction } from './doclib-menus.ts'
import { toggleSort } from './viewmodel.ts'
import { DoclibRail } from './components/DoclibRail.tsx'
import { DoclibTopBar } from './components/DoclibToolbar.tsx'
import { DocumentTable } from './components/DocumentTable.tsx'
import { DocumentDetailDialog } from './components/DocumentDetailDialog.tsx'
import { FileContextMenu, type ContextMenuItem, type ContextMenuState } from './components/FileContextMenu.tsx'
import { StorageSettingsDialog } from './components/StorageSettingsDialog.tsx'
import { WorkspaceTable, type WorkspaceMenuTarget } from './components/WorkspaceTable.tsx'
import { DoclibDialogs, type DoclibDialog } from './components/DoclibDialogs.tsx'
import { EntryDetailDialog } from './components/EntryDetailDialog.tsx'
import css from './doclib.module.css'

/** NAS 设置弹窗挂载点：打开时才读取配置与健康状态。 */
function StorageDialogMount({ t, onClose }: {
  readonly t: DoclibT
  readonly onClose: () => void
}) {
  const settings = useStorageSettings()
  return <StorageSettingsDialog settings={settings} t={t} onClose={onClose} />
}

/**
 * 资料库主面板：个人资料跟随 DSH 当前工作区，项目文件夹与公司制度文件浏览元枢知识库。
 * @param props - 文案坐席、宿主会话/Remote 服务与桌面文件动作。
 */
export function DoclibWorkbench(props: {
  readonly t: DoclibT
  readonly sessions: SessionsService
  readonly remote: WorkspaceFilesRemote & { readonly session: { openWorkspacePath: (request: { path: string; action?: 'reveal' }, signal?: AbortSignal) => Promise<{ ok: boolean }> } }
  readonly fileActions?: FileActions | undefined
}) {
  const { t, sessions, remote, fileActions } = props
  const [tab, setTab] = useState<'personal' | 'projects' | 'policies'>('personal')
  const [storageOpen, setStorageOpen] = useState(false)
  const [dialog, setDialog] = useState<DoclibDialog | undefined>(undefined)
  const [menu, setMenu] = useState<ContextMenuState | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const localInput = useRef<HTMLInputElement>(null)
  const remoteInput = useRef<HTMLInputElement>(null)
  const projects = useKnowledgeTab(tab === 'projects')
  const policies = useKnowledgeTab(tab === 'policies')
  const browser = useWorkspaceBrowser(sessions, remote)
  const kb = tab === 'projects' ? projects : tab === 'policies' ? policies : undefined
  const collectionName = kb?.currentCollection?.name ?? ''
  const scope = kb === undefined ? undefined : [collectionName, kb.directory].filter(part => part !== '').join(' / ')
  const subtitle = kb === undefined
    ? `${t('doclib.currentWorkspace')} · ${browser.root ?? '—'}`
    : `${scope || '—'} · ${t('doclib.total', { total: kb.total ?? 0 })}`

  const flash = (text: string) => {
    setNotice(text)
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => { setNotice(undefined) }, 2_400)
  }
  const openAt = (event: React.MouseEvent, items: readonly ContextMenuItem[]) => {
    setMenu({ x: event.clientX, y: event.clientY, items })
  }
  const fileHandlers = createDoclibHandlers({ t, browser, kb, remote, fileActions, flash })
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

  return <div className={css.shell}>
    <DoclibRail active={tab} t={t} workspaceRoot={browser.root}
      collections={kb?.collections ?? []} collectionId={kb?.collectionId ?? ''}
      collectionsLoading={kb !== undefined && kb.collections.length === 0 && kb.loading}
      collectionsError={kb?.error === 'failed' && kb.collections.length === 0}
      directories={kb?.directories ?? []} directory={kb?.directory ?? ''}
      indexLoading={kb?.indexLoading ?? false}
      onSelectTab={setTab} onSelectCollection={(id) => { kb?.selectCollection(id) }}
      onSelectDirectory={(path) => { kb?.setDirectory(path) }}
      onOpenStorage={() => { setStorageOpen(true) }}
      onRefresh={() => { if (kb !== undefined) kb.retry(); else browser.refresh() }} />
    <section className={css.main}>
      <header className={css.mainHead}>
        <p className={css.crumb}>
          {t('doclib.crumb.library')}<span className={css.crumbSep} aria-hidden="true">/</span>
          {t(`doclib.tab.${tab}`)}
        </p>
        <h1 className={css.mainTitle}>{t(`doclib.tab.${tab}`)}</h1>
        <p className={css.mainSubtitle} title={subtitle}>{subtitle}</p>
      </header>
      {kb === undefined
        ? <WorkspaceTable browser={browser} t={t}
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
          onMenu={(event, target) => {
            openAt(event, localMenuItems({
              directory: target.directory,
              selectionCount: browser.selected.size,
              t,
              handlers: localMenu(target),
            }))
          }} />
        : <>
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
            onDeleteSelected={() => { setDialog({ kind: 'deleteRemote', ids: [...kb.selected], names: [] }) }}
            onClearSelection={kb.clearSelection} />
          <DocumentTable documents={kb.visibleDocuments} page={kb.page} pageCount={kb.pageCount}
            total={kb.total} loading={kb.loading} error={kb.error} t={t}
            selected={kb.selected} sort={kb.sort}
            onPage={kb.goToPage} onOpen={(document) => { kb.openDetail(document.id) }}
            onToggle={kb.toggleSelected} onToggleAll={kb.toggleAll}
            onSort={(field) => { kb.setSort(toggleSort(kb.sort, field)) }}
            onMenu={(event, document) => {
              const handlers: Partial<Record<RemoteMenuAction, () => void>> = {
                download: () => { fileHandlers.downloadRemote(document) },
                preview: () => { kb.openDetail(document.id) },
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
      {kb?.detail !== undefined && <DocumentDetailDialog document={kb.detail}
        previewPending={kb.previewPending} previewError={kb.previewError} t={t}
        onPreview={kb.preview} onClose={kb.closeDetail} />}
      {browser.detail !== undefined && <EntryDetailDialog detail={browser.detail} root={browser.root}
        t={t} onClose={browser.closeDetail} />}
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
