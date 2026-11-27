/** 预览弹窗纯组件：按渲染方式内联展示图片、PDF、文本或降级下载页，不请求字节。 */
import { useRef, useState } from 'react'
import type { DoclibT } from '../model.ts'
import type { DoclibPreviewMode } from '../preview-viewmodel.ts'
import { previewBadgeKind } from '../preview-viewmodel.ts'
import { formatSize, formatTime } from '../viewmodel.ts'
import { FileBadge } from './FileBadge.tsx'
import { TextPreview } from './TextPreview.tsx'
import css from '../doclib.module.css'

/** 预览弹窗属性：渲染状态、元信息与下载/详情/独立窗口/关闭回调。 */
export interface DocumentPreviewDialogProps {
  readonly name: string
  readonly mimeType: string
  readonly mode: DoclibPreviewMode
  readonly status: 'loading' | 'ready' | 'error'
  readonly url: string | undefined
  readonly text: string | undefined
  readonly truncated: boolean
  readonly size?: number | undefined
  readonly updatedAt?: string | undefined
  readonly downloading: boolean
  /** 是否可脱离应用弹窗，在系统级独立窗口打开。 */
  readonly detachable: boolean
  readonly t: DoclibT
  readonly onRetry: () => void
  readonly onDownload: () => void
  readonly onDetach: () => void
  readonly onDetails?: (() => void) | undefined
  readonly onClose: () => void
}

/** 无法内联渲染的类型：展示图标、类型、可得的元信息与下载说明。 */
function FallbackBody(props: Pick<DocumentPreviewDialogProps, 'name' | 'mimeType' | 'size' | 'updatedAt' | 't'>) {
  const { name, mimeType, size, updatedAt, t } = props
  const kind = previewBadgeKind(name, mimeType)
  return <div className={css.previewFallback}>
    <FileBadge kind={kind} />
    <p className={css.previewFallbackTitle}>{t('doclib.preview.unsupportedTitle')}</p>
    <p className={css.previewHint}>{t('doclib.preview.unsupportedHint')}</p>
    <dl className={css.previewMeta}>
      <div><dt>{t('doclib.files.type')}</dt><dd>{t(`doclib.mime.${kind}`)}</dd></div>
      {size !== undefined && <div><dt>{t('doclib.files.size')}</dt><dd>{formatSize(size)}</dd></div>}
      {updatedAt !== undefined && updatedAt !== '' &&
        <div><dt>{t('doclib.files.modifiedAt')}</dt><dd>{formatTime(updatedAt)}</dd></div>}
    </dl>
  </div>
}

/** 内容区可额外接收搜索栏状态：文本模式由标题栏按钮与内容区共享。 */
interface PreviewBodyProps extends DocumentPreviewDialogProps {
  readonly searchOpen: boolean
  readonly onSearchOpenChange: (open: boolean) => void
}

/** 内容区：加载中、出错重试、图片、PDF、Office、文本与降级页七种形态。 */
function PreviewBody(props: PreviewBodyProps) {
  const { mode, status, url, text, truncated, t } = props
  if (status === 'loading') {
    return <p className={css.previewState} role="status">{t('doclib.preview.loading')}</p>
  }
  if (status === 'error') {
    return <p className={css.previewState} role="alert">
      {t('doclib.preview.loadFailed')}
      <button type="button" className={css.linkButton} onClick={props.onRetry}>{t('doclib.retry')}</button>
    </p>
  }
  if (mode === 'unsupported') return <FallbackBody {...props} />
  if (mode === 'image' && url !== undefined) {
    return <img className={css.previewImage} src={url}
      alt={t('doclib.preview.imageAlt', { name: props.name })} />
  }
  if (mode === 'pdf' && url !== undefined) {
    return <iframe className={css.previewFrame} src={url} title={t('doclib.preview.pdfFrame')} />
  }
  if (mode === 'office' && url !== undefined) {
    // Office 已由宿主转成 PDF，iframe 与 PDF 同形态展示。
    return <iframe className={css.previewFrame} src={url} title={t('doclib.preview.officeFrame')} />
  }
  return <TextPreview text={text ?? ''} truncated={truncated} t={t}
    searchOpen={props.searchOpen} onSearchOpenChange={props.onSearchOpenChange} />
}

/**
 * 预览弹窗：标题栏可拖动到应用窗口边缘，可另开同源系统窗口移到软件窗口之外。
 * @param props - 渲染状态、元信息与动作回调。
 */
export function DocumentPreviewDialog(props: DocumentPreviewDialogProps) {
  const { name, mimeType, downloading, t } = props
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number }>()
  const [searchOpen, setSearchOpen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ readonly dx: number; readonly dy: number }>()

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button') !== null) return
    const rect = sectionRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    // 合成事件可能没有活动指针，捕获失败时仍可继续拖动。
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* 忽略无效指针 */ }
  }
  const onHeaderPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (drag === undefined) return
    const width = sectionRef.current?.offsetWidth ?? 0
    // 至少保留 120px 宽度在视口内，标题栏始终可再次拖动。
    const left = Math.min(Math.max(event.clientX - drag.dx, 120 - width), window.innerWidth - 120)
    const top = Math.min(Math.max(event.clientY - drag.dy, 0), window.innerHeight - 56)
    setPosition({ left, top })
  }
  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return <div className={css.dialogOverlay} role="dialog" aria-modal="true"
    aria-label={t('doclib.preview.title')}>
    <section ref={sectionRef} className={`${css.dialog} ${css.previewDialog}`}
      style={position === undefined ? undefined : {
        position: 'fixed', left: position.left, top: position.top, margin: 0,
      }}>
      <header className={`${css.dialogHeader} ${css.dialogHeaderDrag}`}
        onPointerDown={onHeaderPointerDown} onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag} onPointerCancel={endDrag}>
        <div className={css.dialogHeading}>
          <FileBadge kind={previewBadgeKind(name, mimeType)} />
          <h3 className={css.dialogTitle} title={name}>{name}</h3>
        </div>
        <div className={css.dialogHeaderActions}>
          {props.mode === 'text' && props.status === 'ready' &&
            <button type="button" className={css.previewToolButton}
              aria-label={t('doclib.preview.search')} title={t('doclib.preview.search')}
              onClick={() => { setSearchOpen(current => !current) }}>
              {t('doclib.preview.search')}
            </button>}
          <button type="button" className={css.closeButton} aria-label={t('doclib.preview.close')}
            onClick={props.onClose}>×</button>
        </div>
      </header>
      <div className={css.previewBody}>
        <PreviewBody {...props} searchOpen={searchOpen} onSearchOpenChange={setSearchOpen} />
      </div>
      <footer className={css.dialogFooter}>
        {props.onDetails !== undefined && <button type="button" className={css.pageButton}
          onClick={props.onDetails}>{t('doclib.preview.details')}</button>}
        {props.detachable && <button type="button" className={css.pageButton}
          onClick={props.onDetach}>{t('doclib.preview.detach')}</button>}
        <button type="button" className={css.primaryButton} disabled={downloading}
          onClick={props.onDownload}>
          {downloading ? t('doclib.menu.downloading') : t('doclib.detail.download')}
        </button>
      </footer>
    </section>
  </div>
}
