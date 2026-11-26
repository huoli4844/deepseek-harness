/** 资料库文件动作：本地文件用系统默认应用打开/定位，远端文档另存到本地，不依赖 React。 */
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import type { DoclibDocument } from './model.ts'
import { fetchDocumentDetail, fetchPreviewBlob } from './source.ts'

/** 打开/定位所需的 Session Remote 切片。 */
export interface DoclibOpenRemote {
  readonly session: {
    openWorkspacePath(
      request: { readonly path: string; readonly action?: 'reveal' },
      signal?: AbortSignal,
    ): Promise<{ readonly ok: boolean }>
  }
}

/** 本地文件动作：默认应用打开，或文件管理器中定位。 */
export type LocalPathAction = 'open' | 'reveal'

/** 远端文档下载结果：已保存、已发起浏览器下载、取消或失败。 */
export type DownloadOutcome = 'saved' | 'downloaded' | 'cancelled' | 'failed'

/** 右键菜单命中的目标：本地工作区条目或知识库文档。 */
export type DoclibMenuTarget =
  | {
    readonly kind: 'local'
    readonly name: string
    readonly absolutePath: string
    readonly absoluteDirectory: string
    readonly directory: boolean
  }
  | { readonly kind: 'document'; readonly document: DoclibDocument }

/** 本地打开/定位：只在桌面端可用，失败时返回 false 由界面提示。 */
export async function openLocalPath(
  remote: DoclibOpenRemote,
  path: string,
  action: LocalPathAction,
): Promise<boolean> {
  try {
    const result = await remote.session.openWorkspacePath(
      action === 'reveal' ? { path, action } : { path },
      AbortSignal.timeout(15_000),
    )
    return result.ok
  } catch {
    return false
  }
}

/** 复制文本到剪贴板；浏览器未授权剪贴板时返回 false。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** 浏览器下载兜底：桌面端不可用时直接触发下载。 */
function browserDownload(blob: Blob, name: string): DownloadOutcome {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, 30_000)
  return 'downloaded'
}

/** 待保存内容：桌面能力不可用时退回浏览器下载。 */
interface SaveSource {
  /** 桌面文件动作要求来源地址；内存内容留空。 */
  readonly url: string
  readonly name: string
  readonly mediaType: string
  readonly read: (signal: AbortSignal) => Promise<Blob>
}

/** 保存一份内容：优先弹出保存位置，桌面能力不可用时直接浏览器下载。 */
async function saveSource(fileActions: FileActions | undefined, source: SaveSource): Promise<DownloadOutcome> {
  if (fileActions !== undefined) {
    const result = await fileActions.save(source, fileActions.canSaveAs ? 'saveAs' : 'download')
    if (result.status === 'cancelled') return 'cancelled'
    return result.status === 'saved' ? 'saved' : 'downloaded'
  }
  return browserDownload(await source.read(AbortSignal.timeout(60_000)), source.name)
}

/**
 * 下载知识库文档：先取详情拿文件 ID，再由 fileActions 在桌面端弹出保存位置，
 * 桌面能力不可用时退回浏览器下载。
 */
export async function downloadDocument(
  fileActions: FileActions | undefined,
  documentId: string,
  fallbackName: string,
): Promise<DownloadOutcome> {
  try {
    const detail = await fetchDocumentDetail(documentId, AbortSignal.timeout(20_000))
    if (detail.fileId === '') return 'failed'
    const name = detail.originalName || fallbackName || detail.title
    return await saveSource(fileActions, {
      url: '',
      name,
      mediaType: detail.mimeType || 'application/octet-stream',
      read: (signal: AbortSignal) => fetchPreviewBlob(detail.fileId, signal),
    })
  } catch {
    return 'failed'
  }
}

/** 下载本地工作区条目：字节由宿主工作区路由提供，同样走另存为。 */
export async function downloadWorkspaceEntry(
  fileActions: FileActions | undefined,
  name: string,
  read: (signal: AbortSignal) => Promise<Blob>,
): Promise<DownloadOutcome> {
  try {
    return await saveSource(fileActions, { url: '', name, mediaType: 'application/octet-stream', read })
  } catch {
    return 'failed'
  }
}
