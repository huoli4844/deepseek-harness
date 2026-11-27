/** 资料库文件动作处理：本地打开/下载/上传与远端下载，供容器直接调用。 */
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import type { DoclibDocument, DoclibT } from './model.ts'
import type { KnowledgeTabController, MutationOutcome, WorkspaceBrowser } from './use-doclib.ts'
import type { WorkspaceFilesRemote } from './workspace-source.ts'
import { copyText, downloadDocument, downloadWorkspaceEntry, openLocalPath } from './file-actions.ts'

/** 失败结果对应的提示文案。 */
export function failureKey(outcome: Exclude<MutationOutcome, 'ok'>) {
  switch (outcome) {
    case 'exists':
      return 'doclib.files.errorExists' as const
    case 'notFound':
      return 'doclib.files.errorNotFound' as const
    case 'denied':
      return 'doclib.files.errorDenied' as const
    default:
      return 'doclib.files.errorFailed' as const
  }
}

/** 创建文件动作所需的依赖。 */
export interface DoclibHandlerDeps {
  readonly t: DoclibT
  readonly browser: WorkspaceBrowser
  readonly kb: KnowledgeTabController | undefined
  readonly remote: WorkspaceFilesRemote & {
    readonly session: {
      openWorkspacePath: (
        request: { path: string; action?: 'reveal' },
        signal?: AbortSignal,
      ) => Promise<{ ok: boolean }>
    }
  }
  readonly fileActions: FileActions | undefined
  readonly flash: (text: string) => void
}

/** 容器可直接调用的文件动作。 */
export interface DoclibHandlers {
  readonly absoluteOf: (relative: string) => string
  readonly openLocal: (relative: string, action?: 'open' | 'reveal') => void
  readonly copy: (text: string) => void
  readonly downloadRemote: (document: DoclibDocument) => void
  readonly downloadRemoteMany: (documents: readonly DoclibDocument[]) => void
  readonly downloadLocal: (items: readonly string[]) => void
  readonly uploadLocal: (files: FileList | null) => void
  readonly uploadRemote: (files: FileList | null) => void
}

/**
 * 构造文件动作处理器：所有提示通过 flash 回传，异步失败只提示不抛错。
 * @param deps - 文案、目录状态、知识库页签与桌面保存能力。
 */
export function createDoclibHandlers(deps: DoclibHandlerDeps): DoclibHandlers {
  const { t, browser, kb, remote, fileActions, flash } = deps
  const absoluteOf = (relative: string) => browser.root === undefined
    ? ''
    : `${browser.root.replace(/\/+$/u, '')}/${relative}`
  const nameOf = (relative: string) => relative.slice(relative.lastIndexOf('/') + 1)
  const isFile = (relative: string) => browser.entries.some(entry =>
    entry.type !== 'directory' && (browser.path === '' ? entry.name : `${browser.path}/${entry.name}`) === relative)

  const downloadLocal = (items: readonly string[]) => {
    const files = items.filter(isFile)
    if (files.length === 0) return
    flash(t('doclib.menu.downloading'))
    void (async () => {
      let failed = false
      for (const relative of files) {
        const blob = await browser.blob(relative)
        if (blob === undefined) { failed = true; continue }
        const outcome = await downloadWorkspaceEntry(fileActions, nameOf(relative), () => Promise.resolve(blob))
        if (outcome === 'failed') failed = true
      }
      flash(t(failed ? 'doclib.menu.downloadFailed' : 'doclib.menu.downloaded'))
    })()
  }

  const downloadRemoteMany = (documents: readonly DoclibDocument[]) => {
    if (documents.length === 0) return
    flash(t('doclib.menu.downloading'))
    void (async () => {
      let failed = false
      for (const document of documents) {
        const outcome = await downloadDocument(fileActions, document.id, document.originalName)
        // 用户取消保存后不再继续弹出下一个保存框。
        if (outcome === 'cancelled') break
        if (outcome === 'failed') failed = true
      }
      flash(t(failed ? 'doclib.menu.downloadFailed' : 'doclib.menu.downloaded'))
    })()
  }

  const uploadLocal = (files: FileList | null) => {
    if (files === null || files.length === 0) return
    const list = [...files]
    flash(t('doclib.files.uploading', { done: 0, total: list.length }))
    void browser.upload(list, (done, total) => {
      flash(t('doclib.files.uploading', { done, total }))
    }).then((outcome) => {
      flash(outcome === 'ok'
        ? t('doclib.files.uploaded', { count: list.length })
        : t(failureKey(outcome)))
    })
  }

  const uploadRemote = (files: FileList | null) => {
    if (kb === undefined || files === null || files.length === 0) return
    const list = [...files]
    flash(t('doclib.files.uploading', { done: 0, total: list.length }))
    void kb.upload(list, (done, total) => {
      flash(t('doclib.files.uploading', { done, total }))
    }).then((outcome) => {
      flash(outcome === 'ok'
        ? t('doclib.files.remoteUploaded', { count: list.length })
        : t('doclib.files.remoteUploadFailed'))
    })
  }

  return {
    absoluteOf,
    openLocal: (relative, action = 'open') => {
      void openLocalPath(remote, absoluteOf(relative), action)
        .then((ok) => { if (!ok) flash(t('doclib.menu.openFailed')) })
    },
    copy: (text) => {
      void copyText(text).then((ok) => { flash(t(ok ? 'doclib.menu.copied' : 'doclib.menu.copyFailed')) })
    },
    downloadRemote: (document) => {
      flash(t('doclib.menu.downloading'))
      void downloadDocument(fileActions, document.id, document.originalName).then((outcome) => {
        if (outcome === 'cancelled') return
        flash(t(outcome === 'failed' ? 'doclib.menu.downloadFailed' : 'doclib.menu.downloaded'))
      })
    },
    downloadRemoteMany,
    downloadLocal,
    uploadLocal,
    uploadRemote,
  }
}
