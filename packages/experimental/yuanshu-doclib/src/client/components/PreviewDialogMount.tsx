/** 预览弹窗挂载点：管理字节加载与下载等待状态，关闭即卸载并释放本地地址。 */
import { useState } from 'react'
import type { DoclibT } from '../model.ts'
import type { DownloadOutcome } from '../file-actions.ts'
import { useDocumentPreview, type PreviewRequest } from '../use-document-preview.ts'
import { DocumentPreviewDialog } from './DocumentPreviewDialog.tsx'

/** 打开中的预览：字节请求、下载动作与可选的字段详情/独立窗口信息。 */
export interface PreviewTarget {
  readonly request: PreviewRequest
  readonly download: () => Promise<DownloadOutcome>
  readonly details?: (() => void) | undefined
  /** 已知的远端文件 ID；本地工作区文件没有系统级窗口，保持 undefined。 */
  readonly fileId?: string | undefined
  /** 列表响应未带文件 ID 时，打开独立窗口前补取详情。 */
  readonly resolveFileId?: (() => Promise<string | undefined>) | undefined
}

/** 独立预览窗口路径；与宿主 preview-window.ts 的同源路由保持一致。 */
const PREVIEW_WINDOW_PATH = '/yuanshu-doclib/window'

/**
 * 预览弹窗挂载点：只负责下载等待状态、独立窗口打开与结果提示，渲染交给纯组件。
 * @param props - 预览目标、文案函数、提示回调与关闭动作。
 */
export function PreviewDialogMount(props: {
  readonly target: PreviewTarget
  readonly t: DoclibT
  readonly flash: (text: string) => void
  readonly onClose: () => void
}) {
  const { target, t, flash, onClose } = props
  const state = useDocumentPreview(target.request)
  const [downloading, setDownloading] = useState(false)
  const [detaching, setDetaching] = useState(false)
  const download = () => {
    if (downloading) return
    setDownloading(true)
    void target.download().then((outcome) => {
      setDownloading(false)
      if (outcome === 'cancelled') flash(t('doclib.preview.downloadCancelled'))
      else flash(t(outcome === 'failed' ? 'doclib.menu.downloadFailed' : 'doclib.menu.downloaded'))
    })
  }
  /** 打开同源系统窗口；桌面壳放行后可拖到应用窗口之外。 */
  const openDetached = (fileId: string) => {
    const query = new URLSearchParams({
      id: fileId, name: target.request.name, mime: target.request.mimeType,
    })
    const opened = window.open(`${PREVIEW_WINDOW_PATH}?${query.toString()}`, '_blank', 'width=960,height=720')
    if (opened !== null) onClose()
  }
  const detach = () => {
    if (detaching) return
    if (target.fileId !== undefined) {
      openDetached(target.fileId)
      return
    }
    const resolve = target.resolveFileId
    if (resolve === undefined) return
    setDetaching(true)
    resolve().then((fileId) => {
      setDetaching(false)
      if (fileId !== undefined && fileId !== '') openDetached(fileId)
      else flash(t('doclib.preview.detachFailed'))
    }).catch(() => {
      setDetaching(false)
      flash(t('doclib.preview.detachFailed'))
    })
  }
  return <DocumentPreviewDialog name={target.request.name} mimeType={target.request.mimeType}
    mode={target.request.mode} status={state.status} url={state.url} text={state.text}
    truncated={state.truncated} size={target.request.size} updatedAt={target.request.updatedAt}
    downloading={downloading} detachable={target.fileId !== undefined || target.resolveFileId !== undefined}
    t={t} onRetry={state.retry} onDownload={download} onDetach={detach}
    onDetails={target.details} onClose={onClose} />
}
