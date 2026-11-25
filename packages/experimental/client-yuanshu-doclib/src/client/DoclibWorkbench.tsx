/** 资料库容器：左侧分类栏 + 右侧内容区的状态编排与数据源注入。 */
import { useState } from 'react'
import type { DoclibTab, DoclibT } from './model.ts'
import type { SessionsService, WorkspaceFilesRemote } from './workspace-source.ts'
import { useKnowledgeTab, useWorkspaceBrowser } from './use-doclib.ts'
import { useStorageSettings } from './use-storage.ts'
import { DoclibRail } from './components/DoclibRail.tsx'
import { DoclibTopBar } from './components/DoclibToolbar.tsx'
import { DocumentTable } from './components/DocumentTable.tsx'
import { DocumentDetailDialog } from './components/DocumentDetailDialog.tsx'
import { StorageSettingsDialog } from './components/StorageSettingsDialog.tsx'
import { WorkspaceTable } from './components/WorkspaceTable.tsx'
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
 * @param props - 文案坐席、宿主会话服务与 workspaceFiles Remote 切片。
 */
export function DoclibWorkbench(props: {
  readonly t: DoclibT
  readonly sessions: SessionsService
  readonly remote: WorkspaceFilesRemote
}) {
  const { t, sessions, remote } = props
  const [tab, setTab] = useState<DoclibTab>('personal')
  const [storageOpen, setStorageOpen] = useState(false)
  const projects = useKnowledgeTab(tab === 'projects')
  const policies = useKnowledgeTab(tab === 'policies')
  const browser = useWorkspaceBrowser(sessions, remote)
  const kb = tab === 'projects' ? projects : tab === 'policies' ? policies : undefined
  const collectionName = kb?.currentCollection?.name ?? ''
  const scope = kb === undefined ? undefined : [collectionName, kb.directory].filter(part => part !== '').join(' / ')
  const subtitle = kb === undefined
    ? `${t('doclib.currentWorkspace')} · ${browser.root ?? '—'}`
    : `${scope || '—'} · ${t('doclib.total', { total: kb.total ?? 0 })}`
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
        ? <WorkspaceTable browser={browser} t={t} />
        : <>
          <DoclibTopBar draft={kb.draft} typeFilter={kb.typeFilter}
            shown={kb.visibleDocuments.length} pageTotal={kb.documents.length} t={t}
            onInput={kb.inputDraft} onSubmit={kb.submitSearch} onClear={kb.clearSearch}
            onTypeFilter={kb.setTypeFilter} />
          <DocumentTable documents={kb.visibleDocuments} page={kb.page} pageCount={kb.pageCount}
            total={kb.total} loading={kb.loading} error={kb.error} t={t}
            onPage={kb.goToPage} onOpen={(document) => { kb.openDetail(document.id) }} onRetry={kb.retry} />
        </>}
      {kb?.detail !== undefined && <DocumentDetailDialog document={kb.detail}
        previewPending={kb.previewPending} previewError={kb.previewError} t={t}
        onPreview={kb.preview} onClose={kb.closeDetail} />}
    </section>
    {storageOpen && <StorageDialogMount t={t} onClose={() => { setStorageOpen(false) }} />}
  </div>
}
