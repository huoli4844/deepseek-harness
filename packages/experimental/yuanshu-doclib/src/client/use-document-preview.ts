/** 预览字节加载 hook：按渲染方式读取远端/本地字节并生成可释放的本地地址，不渲染界面。 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { convertOfficePdf } from './source.ts'
import { decodePreviewText, limitPreviewText, previewExtension, type DoclibPreviewMode } from './preview-viewmodel.ts'

/** 预览数据请求：展示信息与字节读取函数；下载动作由容器单独保存。 */
export interface PreviewRequest {
  readonly name: string
  readonly mimeType: string
  readonly mode: DoclibPreviewMode
  readonly size?: number | undefined
  readonly updatedAt?: string | undefined
  /** Office 转换扩展名；缺省时从 name 推断（远端标题可能不含扩展名）。 */
  readonly extension?: string | undefined
  /** 读取预览字节；signal 用于关闭或重试时中止请求。 */
  readonly load: (signal: AbortSignal) => Promise<Blob>
}

/** 预览加载状态：加载中、可渲染或失败（可重试）。 */
export type PreviewStatus = 'loading' | 'ready' | 'error'

/** 预览弹窗渲染所需状态。 */
export interface DocumentPreviewState {
  readonly status: PreviewStatus
  /** 图片与 PDF 的本地 Blob 地址；文本与降级类型为空。 */
  readonly url: string | undefined
  /** 文本预览内容；非文本类型为空。 */
  readonly text: string | undefined
  readonly truncated: boolean
  readonly retry: () => void
}

/**
 * 加载预览字节：图片与 PDF 生成 objectURL，文本解码后截断，Office 先交给宿主转 PDF 再生成地址；
 * 关闭或切换时释放地址。降级类型不请求字节，直接进入可渲染状态，由界面提供下载入口。
 * @param request - 预览请求；未打开时传 undefined。
 * @returns 预览渲染状态与重试动作。
 */
export function useDocumentPreview(request: PreviewRequest | undefined): DocumentPreviewState {
  const [status, setStatus] = useState<PreviewStatus>('loading')
  const [url, setUrl] = useState<string | undefined>(undefined)
  const [text, setText] = useState<string | undefined>(undefined)
  const [truncated, setTruncated] = useState(false)
  const [tick, setTick] = useState(0)
  // objectURL 的生命周期跟随当前请求，切换或卸载时必须吊销，否则字节会一直驻留内存。
  const objectUrl = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (request === undefined) return
    setStatus('loading')
    setUrl(undefined)
    setText(undefined)
    setTruncated(false)
    if (request.mode === 'unsupported') {
      setStatus('ready')
      return
    }
    const controller = new AbortController()
    // 通过函数读取取消状态，避免 await 之后被控制流分析误判为恒 false。
    const aborted = () => controller.signal.aborted
    request.load(controller.signal).then(async (source) => {
      if (aborted()) return
      if (request.mode === 'text') {
        const decoded = decodePreviewText(await source.arrayBuffer())
        if (aborted()) return
        const limited = limitPreviewText(decoded)
        setText(limited.text)
        setTruncated(limited.truncated)
        setStatus('ready')
        return
      }
      // Office 原始字节无法直接展示，先在本机转换成 PDF；转换失败走 error 可重试。
      const blob = request.mode === 'office'
        ? await convertOfficePdf(source, request.extension ?? previewExtension(request.name), controller.signal)
        : source
      if (aborted()) return
      const next = URL.createObjectURL(blob)
      objectUrl.current = next
      setUrl(next)
      setStatus('ready')
    }).catch(() => {
      if (!aborted()) setStatus('error')
    })
    return () => {
      controller.abort()
      if (objectUrl.current !== undefined) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = undefined
      }
    }
  }, [request, tick])

  const retry = useCallback(() => { setTick(current => current + 1) }, [])
  return { status, url, text, truncated, retry }
}
