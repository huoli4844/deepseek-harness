/** 通用确认弹窗：破坏性操作二次确认，确认后等待异步结果再关闭。 */
import { useState } from 'react'
import type { DoclibT } from '../model.ts'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 确认弹窗属性。 */
export interface ConfirmDialogProps {
  readonly title: string
  readonly message: string
  readonly detail?: string
  readonly confirmLabel: string
  readonly t: DoclibT
  readonly onConfirm: () => Promise<boolean>
  readonly onClose: () => void
}

/**
 * 确认弹窗：确认按钮执行异步动作，成功才关闭；失败保留弹窗由外部提示。
 * @param props - 标题、说明与确认回调。
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, message, detail, confirmLabel, t, onConfirm, onClose } = props
  const [busy, setBusy] = useState(false)
  const confirm = () => {
    setBusy(true)
    void onConfirm().then((ok) => {
      setBusy(false)
      if (ok) onClose()
    })
  }
  return <div className={css.dialogOverlay} role="dialog" aria-modal="true" aria-label={title}>
    <div className={css.dialog}>
      <header className={css.dialogHeader}>
        <h2 className={css.dialogTitle}>{title}</h2>
        <button type="button" className={css.closeButton} aria-label={t('doclib.files.cancel')}
          onClick={onClose}>×</button>
      </header>
      <p className={filesCss.dialogText}>{message}</p>
      {detail !== undefined && <p className={css.storageHint}>{detail}</p>}
      <footer className={css.dialogFooter}>
        <button type="button" className={filesCss.secondaryButton} onClick={onClose}>{t('doclib.files.cancel')}</button>
        <button type="button" className={`${css.primaryButton} ${filesCss.dangerButton}`}
          disabled={busy} onClick={confirm}>{confirmLabel}</button>
      </footer>
    </div>
  </div>
}
