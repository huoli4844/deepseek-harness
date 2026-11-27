/** 渲染宿主投影的登记字段。只处理展示和用户输入，不读网络。 */
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DynamicField } from '../../../business-forms/dynamic-record.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import css from '../business-modules/equipment-ledger.module.css'

interface Props {
  readonly fields: readonly DynamicField[]
  readonly content: Readonly<Record<string, string>>
  readonly invalid: readonly string[]
  readonly disabled: boolean
  readonly change: (key: string, value: string) => void
  readonly t: WorkbenchT
}

/** 用现有登记弹窗样式呈现运行时字段。 */
export function DynamicRecordFields({ fields, content, invalid, disabled, change, t }: Props) {
  return <div className={css.recordForm}>{fields.map((def, index) => {
    const value = content[def.key] ?? ''
    const update = (event: { currentTarget: { value: string } }) => { change(def.key, event.currentTarget.value) }
    const flags = { disabled, 'aria-invalid': invalid.includes(def.key), 'aria-required': def.required,
      'data-modal-autofocus': index === 0 ? true : undefined }
    if (def.unsupported) return <p key={def.key} className={css.recordFormUnsupported}>{def.label}{t('equipment.intake.unsupported')}</p>
    return <label key={def.key}>{def.label}{def.required && <span aria-hidden="true"> *</span>}
      {def.type === 'boolean'
        ? <input type="checkbox" disabled={disabled} checked={value === 'true'}
          onChange={(event) => { change(def.key, event.currentTarget.checked ? 'true' : 'false') }} />
        : def.options ? <select {...flags} value={value} onChange={update}>
          <option value="">{t('equipment.intake.default')}</option>
          {value && !def.options.some(option => option.value === value) && <option value={value} disabled>{value}</option>}
          {def.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <Input {...flags} value={value} type={def.format === 'date' ? 'date' : 'text'}
          maxLength={def.maxLength ?? 8000} onChange={update} />}
    </label>
  })}</div>
}
