/** 文档详情弹窗纯组件：字段网格、标签与原文预览按钮，不请求后台。 */
import type { DoclibDocument, DoclibT } from '../model.ts'
import { enumLabel, formatTime, mimeKind, parseStatusKey, sensitivityKey } from '../viewmodel.ts'
import { FileBadge } from './FileBadge.tsx'
import css from '../doclib.module.css'

/** 详情字段行。 */
function DetailRow({ label, children }: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return <div>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
}

/**
 * 文档详情弹窗：只读展示与原文预览入口。
 * @param props - 文档、预览状态与回调。
 */
export function DocumentDetailDialog(props: {
  readonly document: DoclibDocument
  readonly previewPending: boolean
  readonly previewError: boolean
  readonly t: DoclibT
  readonly onPreview: () => void
  readonly onClose: () => void
}) {
  const { document, previewPending, previewError, t } = props
  return <div className={css.dialogOverlay}>
    <section className={css.dialog} role="dialog" aria-label={t('doclib.detail.title')}>
      <header className={css.dialogHeader}>
        <div className={css.dialogHeading}>
          <FileBadge kind={mimeKind(document.mimeType)} />
          <h3 className={css.dialogTitle}>{document.title || document.originalName || t('doclib.detail.title')}</h3>
        </div>
        <button type="button" className={css.closeButton} aria-label={t('doclib.detail.close')}
          onClick={props.onClose}>×</button>
      </header>
      <dl className={css.dialogGrid}>
        <DetailRow label={t('doclib.detail.originalName')}>{document.originalName || '—'}</DetailRow>
        <DetailRow label={t('doclib.detail.directory')}>{document.directoryPath || '—'}</DetailRow>
        <DetailRow label={t('doclib.detail.type')}>{t(`doclib.mime.${mimeKind(document.mimeType)}`)}</DetailRow>
        <DetailRow label={t('doclib.detail.sensitivity')}>
          {enumLabel(t, document.sensitivity, sensitivityKey)}</DetailRow>
        <DetailRow label={t('doclib.detail.parseStatus')}>
          {enumLabel(t, document.parseStatus, parseStatusKey)}</DetailRow>
        <DetailRow label={t('doclib.detail.tags')}>{document.tags.length > 0 ? document.tags.join('、') : '—'}</DetailRow>
        <DetailRow label={t('doclib.detail.createdAt')}>{formatTime(document.createdAt)}</DetailRow>
        <DetailRow label={t('doclib.detail.updatedAt')}>{formatTime(document.updatedAt)}</DetailRow>
      </dl>
      {previewError && <p className={css.notice} role="alert">{t('doclib.detail.previewError')}</p>}
      <footer className={css.dialogFooter}>
        <button type="button" className={css.pageButton} onClick={props.onClose}>
          {t('doclib.detail.close')}</button>
        <button type="button" className={css.primaryButton}
          disabled={previewPending || document.fileId === ''} onClick={props.onPreview}>
          {previewPending ? t('doclib.detail.previewPending') : t('doclib.detail.preview')}
        </button>
      </footer>
    </section>
  </div>
}
