/** 编排运行时登记弹窗。宿主执行保存，弹窗保留人工编辑和结果状态。 */
import { useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import { dynamicPayload, type DynamicDraft } from '../../../business-forms/dynamic-record.ts'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import { BusinessFormError, createCredentialGuard, submitDynamicRecord } from './source.ts'
import { DynamicRecordFields } from './DynamicRecordFields.tsx'
import css from '../business-modules/equipment-ledger.module.css'
import shared from '../business-modules/business-modules.module.css'

interface Props {
  readonly draft: DynamicDraft
  readonly session: string
  readonly t: WorkbenchT
  readonly onClose: () => void
}

function statusFor(error: unknown) {
  const status = error instanceof BusinessFormError ? error.status : undefined
  if (status === 401 || status === 403) return 'recordForm.access'
  if (status === 412) return 'recordForm.changed'
  if (status === undefined || status >= 500) return 'recordForm.uncertain'
  return 'recordForm.rejected'
}

/** 失败保留原值，成功回执由用户确认后关闭。 */
export function DynamicRecordDialog({ draft, session, t, onClose }: Props) {
  const [content, setContent] = useState(draft.content)
  const [savedReceipt, setReceipt] = useState<string>()
  const receipt = savedReceipt ?? draft.receipt
  const [simulationComplete, setSimulationComplete] = useState(false)
  const complete = Boolean(receipt || simulationComplete || draft.simulated)
  const [error, setError] = useState<ReturnType<typeof statusFor> | 'recordForm.invalid'>()
  const [validationMessage, setValidationMessage] = useState<string>()
  const [invalid, setInvalid] = useState<readonly string[]>([])
  const [saving, setSaving] = useState(false)
  const [sameAccount] = useState(createCredentialGuard)
  const inFlight = useRef(false)
  const frozen = draft.uncertain || error === 'recordForm.uncertain' || error === 'recordForm.changed'
  async function save() {
    if (inFlight.current || frozen || complete || !sameAccount()) return
    const { invalid } = dynamicPayload(draft.fields, content)
    setInvalid(invalid)
    setValidationMessage(undefined)
    if (invalid.length) { setError('recordForm.invalid'); return }
    inFlight.current = true
    setSaving(true)
    setError(undefined)
    try {
      const saved = await submitDynamicRecord(session, draft.id, content, AbortSignal.timeout(32_000))
      if (!sameAccount()) return
      if (saved.kind === 'simulation' && draft.preview) setSimulationComplete(true)
      else if (saved.kind === 'saved' && !draft.preview) setReceipt(saved.receipt)
      else throw new BusinessFormError(502)
    } catch (failure) {
      if (sameAccount()) {
        setError(statusFor(failure))
        if (failure instanceof BusinessFormError) setValidationMessage(failure.validationMessage)
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return <BusinessFormModal open title={t(draft.preview ? 'recordForm.previewTitle' : 'recordForm.title', { object: draft.title })} closeLabel={t('equipment.cancel')}
    contentClassName={css.intakeContent ?? ''} maxWidth={EDIT_TEMPLATE.maxWidth} onClose={saving || complete ? () => {} : onClose}
    footer={<div className={shared.businessModuleActions}>
      {!complete && <Button size="sm" variant="outline" disabled={saving} onClick={onClose}>{t('equipment.cancel')}</Button>}
      <Button size="sm" variant="primary" disabled={saving || (!complete && frozen)}
        onClick={complete ? onClose : () => { void save() }}>
        {t(complete ? 'equipment.intake.confirm' : saving ? 'equipment.intake.pending' : draft.preview ? 'recordForm.simulate' : 'equipment.save')}
      </Button>
    </div>}>
    {complete ? <p role="status">{draft.preview ? t('recordForm.simulated') : t('recordForm.saved', { receipt })}</p> : <>
      {(draft.uncertain || error) && <p className={shared.businessModuleFormError} role="alert">
        {draft.uncertain ? t('recordForm.uncertain') : validationMessage ?? t(error ?? 'recordForm.rejected')}
      </p>}
      <DynamicRecordFields fields={draft.fields} content={content} invalid={invalid} disabled={saving || frozen} t={t}
        change={(key, value) => { setContent(previous => ({ ...previous, [key]: value })) }} />
    </>}
  </BusinessFormModal>
}
