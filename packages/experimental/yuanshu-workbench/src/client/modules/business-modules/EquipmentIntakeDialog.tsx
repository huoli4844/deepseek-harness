/** 使用固定 A2UI 编辑模板渲染登记复核，只呈现受控字段和用户动作。 */
import { Button, IconDownloadOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { WorkbenchT } from '../../app/page-api.ts'
import { recordDefinitions, type RecordKind, type RecordContent } from '../../../business-forms/record-create.ts'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import type { EquipmentImportRow } from './equipment-import.ts'
import { lifecycleLabel, runtimeLabel } from './equipment-viewmodel.ts'
import css from './equipment-ledger.module.css'
import shared from './business-modules.module.css'

const copy = {
  equipment: { title: 'equipment.createTitle', required: 'equipment.intake.required', success: 'equipment.intake.success' },
  'onboarding-task': { title: 'equipment.intake.hr.title', required: 'equipment.intake.hr.required', success: 'equipment.intake.hr.success' },
  customer: { title: 'customer.add', required: 'customer.required', success: 'customer.intake.success' },
  'sales-contract': { title: 'contract.intake.title', required: 'contract.intake.required', success: 'contract.intake.success' },
  project: { title: 'project.intake.title', required: 'project.intake.required', success: 'project.intake.success' },
} as const

interface Props {
  readonly kind: RecordKind
  readonly label: (key: string) => string
  readonly t: WorkbenchT
  readonly rows: readonly EquipmentImportRow[]
  readonly selected: number
  readonly pending: boolean
  readonly done: boolean
  readonly frozen: boolean
  readonly error: string | undefined
  readonly onSelect: (index: number) => void
  readonly onChange: (key: string, value: string) => void
  readonly onUpload: (file: File) => void
  readonly onDownload: () => void
  readonly onSave: () => void
  readonly onClose: () => void
}

/** 本地白名单绑定字段、表单控件与保存动作。 */
export function EquipmentIntakeDialog(props: Props) {
  const { t, rows, selected, pending, done, error, onClose } = props
  const row = rows[selected]
  const messages = copy[props.kind]
  return <BusinessFormModal open title={t(messages.title)} closeLabel={t('equipment.cancel')} contentClassName={css.intakeContent ?? ''}
    maxWidth={EDIT_TEMPLATE.maxWidth} onClose={done || pending ? () => {} : onClose}
    footer={<div className={shared.businessModuleActions}>
      {!done && <Button size="sm" variant="outline" disabled={pending} onClick={onClose}>{t('equipment.cancel')}</Button>}
      <Button size="sm" variant="primary" disabled={pending || props.frozen} onClick={done ? onClose : props.onSave}>
        {t(done ? 'equipment.intake.confirm' : pending ? 'equipment.intake.pending' : 'equipment.save')}
      </Button>
    </div>}>
    {done ? <p role="status">
      {t(messages.success, { count: rows.length })}
      {(props.kind === 'sales-contract' || props.kind === 'project') && <> {rows.map(item => item.receiptCode).filter(Boolean).join('、')}</>}
    </p> : <>
      <p>{t(messages.required)}</p>
      <div className={shared.businessModuleActions}>
        <Button size="sm" variant="outline" icon={<IconDownloadOutlineRegular />} disabled={pending} onClick={props.onDownload}>
          {t('equipment.intake.template')}
        </Button>
        <label>{t('equipment.intake.upload')} <input type="file" accept=".csv,.tsv" disabled={pending || props.frozen || rows.some(item => item.saved)}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) props.onUpload(file)
          }} /></label>
      </div>
      {rows.length > 1 && <label>{t('equipment.intake.row')} <select value={selected} disabled={pending}
        onChange={(event) => { props.onSelect(Number(event.currentTarget.value)) }}>
        {rows.map((item, index) => <option key={item.line} value={index}>
          {item.line}: {item.content[recordDefinitions[props.kind].required[0] ?? '']} {item.saved ? t('equipment.saved') : ''}
        </option>)}
      </select></label>}
      {error && <p className={shared.businessModuleFormError} role="alert">{error}</p>}
      {row && <EquipmentInputs kind={props.kind} label={props.label} content={row.content} t={t}
        disabled={pending || props.frozen || row.saved === true} change={props.onChange} />}
    </>}
  </BusinessFormModal>
}

function EquipmentInputs({ kind, label, content, t, disabled, change }: {
  readonly kind: RecordKind
  readonly label: Props['label']
  readonly content: RecordContent
  readonly t: WorkbenchT
  readonly disabled: boolean
  readonly change: Props['onChange']
}) {
  const def = recordDefinitions[kind]
  const invalid = def.invalid(content)
  return <div className={css.recordForm}>{def.fields.map((key) => {
    const required = def.required.includes(key)
    const value = content[key] ?? ''
    const update = (event: { currentTarget: { value: string } }) => { change(key, event.currentTarget.value) }
    const options = def.options[key]
    return <label key={key}>{label(key)}{required ? <span aria-hidden="true"> *</span> : ''}
      {options ? <select disabled={disabled} value={value} onChange={update} aria-invalid={invalid.includes(key)}>
        <option value="">{t('equipment.intake.default')}</option>
        {value && !options.some(option => option === value) && <option value={value} disabled>{value}</option>}
        {options.map(option => <option key={option} value={option}>
          {kind !== 'equipment' ? label(option) : key === 'lifecycle_status' ? lifecycleLabel(t, option) : runtimeLabel(t, option)}
        </option>)}
      </select> : key === 'remark' || key === 'description' ? <textarea value={value} disabled={disabled} maxLength={def.max[key]} onChange={update} />
        : <Input value={value} disabled={disabled} required={required} maxLength={def.max[key]}
          aria-label={label(key)} data-modal-autofocus={key === def.required[0] ? true : undefined}
          aria-invalid={invalid.includes(key)} onChange={update} />}
    </label>
  })}</div>
}
