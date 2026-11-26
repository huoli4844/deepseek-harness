/** 单行输入弹窗：新建文件夹、重命名与移动/复制目标目录共用。 */
import { useState } from 'react'
import type { DoclibT } from '../model.ts'
import css from '../doclib.module.css'
import filesCss from '../files.module.css'

/** 输入弹窗属性。 */
export interface PromptDialogProps {
  readonly title: string
  readonly label: string
  readonly initial: string
  readonly hint?: string
  readonly confirmLabel: string
  /** 允许输入带斜杠的相对目录（移动/复制目标）。 */
  readonly allowPath?: boolean
  readonly t: DoclibT
  readonly onConfirm: (value: string) => Promise<boolean>
  readonly onClose: () => void
}

/** 判断是否为合法条目名或相对目录；移动/复制允许空串表示根目录。 */
function invalid(value: string, allowPath: boolean): boolean {
  if (allowPath) return value.includes('\\')
  if (value === '') return true
  return value.includes('/') || value.includes('\\')
}

/**
 * 输入弹窗：提交时等待异步动作结果，成功才关闭；非法名称就地提示。
 * @param props - 标题、初值与提交回调。
 */
export function PromptDialog(props: PromptDialogProps) {
  const { title, label, initial, hint, confirmLabel, allowPath = false, t, onConfirm, onClose } = props
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [invalidInput, setInvalidInput] = useState(false)
  const submit = () => {
    if (invalid(value.trim(), allowPath)) {
      setInvalidInput(true)
      return
    }
    setInvalidInput(false)
    setBusy(true)
    void onConfirm(value.trim()).then((ok) => {
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
      <form className={css.storageForm} onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label className={css.storageField}>
          <span className={css.fieldLabel}>{label}</span>
          <input className={css.storageInput} value={value} autoFocus aria-label={label}
            onChange={(event) => { setValue(event.target.value); setInvalidInput(false) }} />
        </label>
        {hint !== undefined && <p className={css.storageHint}>{hint}</p>}
        {invalidInput && <p className={css.notice}>{t('doclib.files.invalidName')}</p>}
        <footer className={css.dialogFooter}>
          <button type="button" className={filesCss.secondaryButton} onClick={onClose}>
            {t('doclib.files.cancel')}</button>
          <button type="submit" className={css.primaryButton} disabled={busy}>{confirmLabel}</button>
        </footer>
      </form>
    </div>
  </div>
}
