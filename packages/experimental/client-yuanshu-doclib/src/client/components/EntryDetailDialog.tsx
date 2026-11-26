/** 本地条目属性弹窗：展示名称、位置、类型、大小与修改时间。 */
import type { DoclibT, WorkspaceEntryDetail } from '../model.ts'
import { fileKindKey, formatSize, formatTime } from '../viewmodel.ts'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/**
 * 条目属性弹窗。
 * @param props - 条目属性、工作区根与关闭回调。
 */
export function EntryDetailDialog({ detail, root, t, onClose }: {
  readonly detail: WorkspaceEntryDetail
  readonly root: string | undefined
  readonly t: DoclibT
  readonly onClose: () => void
}) {
  return <div className={css.dialogOverlay} role="dialog" aria-modal="true" aria-label={t('doclib.files.propertiesTitle')}>
    <div className={css.dialog}>
      <header className={css.dialogHeader}>
        <h2 className={css.dialogTitle} title={detail.name}>{detail.name}</h2>
        <button type="button" className={css.closeButton} aria-label={t('doclib.files.close')}
          onClick={onClose}>×</button>
      </header>
      <dl className={css.dialogGrid}>
        <div><dt>{t('doclib.files.location')}</dt><dd>{root ?? '—'}</dd></div>
        <div><dt>{t('doclib.files.type')}</dt><dd>{t(fileKindKey(detail.type))}</dd></div>
        <div><dt>{t('doclib.files.size')}</dt><dd>{detail.type === 'directory' ? '—' : formatSize(detail.size)}</dd></div>
        <div><dt>{t('doclib.files.modifiedAt')}</dt><dd>{formatTime(detail.modifiedAt)}</dd></div>
      </dl>
      <footer className={css.dialogFooter}>
        <button type="button" className={filesCss.secondaryButton} onClick={onClose}>{t('doclib.files.close')}</button>
      </footer>
    </div>
  </div>
}
