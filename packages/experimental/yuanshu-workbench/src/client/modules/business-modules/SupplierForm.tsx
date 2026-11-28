/** 供应商新建与编辑表单，只负责字段展示和输入回调。 */
import { useState } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { SupplierDraft } from './supplier-model.ts'
import css from './business-modules.module.css'

/** 编码、名称、联系人合并为单个输入框，段与段之间用「/」分隔。 */
const COMBINED_SEPARATOR = ' / '

/** 除合并字段外仍单独展示的文本字段。 */
const textFields = [
  'shortName', 'supplierType', 'category',
  'contactPhone', 'contactEmail', 'address', 'admissionStatus',
] as const

/** 将编码、名称、联系人拼成单输入框显示文本；全空时返回空串。 */
function combineDraft(draft: SupplierDraft): string {
  const parts = [draft.code.trim(), draft.name.trim(), draft.contactPerson.trim()].filter(part => part !== '')
  return parts.length === 0 ? '' : parts.join(COMBINED_SEPARATOR)
}

/** 解析单输入框文本：第 1 段编码、第 2 段名称、第 3 段联系人，缺失段按空处理。 */
function parseCombined(value: string): Pick<SupplierDraft, 'code' | 'name' | 'contactPerson'> {
  const parts = value.split('/').map(part => part.trim())
  return { code: parts[0] ?? '', name: parts[1] ?? '', contactPerson: parts[2] ?? '' }
}

/** 渲染供应商档案字段，不持有业务状态或执行网络请求。 */
export function SupplierForm({ draft, error, t, setField, disabled }: {
  readonly disabled: boolean
  readonly draft: SupplierDraft
  readonly error: string | undefined
  readonly t: WorkbenchT
  readonly setField: <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) => void
}) {
  // 合并输入框持有本地文本，避免受控回流打断输入；弹窗每次打开都重新挂载并从草稿派生初值。
  const [combined, setCombined] = useState(() => combineDraft(draft))
  return <>
    {error !== undefined && <p className={css.businessModuleFormError} role="alert">{error}</p>}
    <div className={css.businessModuleFormGrid}>
      <label className={css.businessModuleSelect}>
        {t('supplier.combined')}
        <Input
          value={combined}
          placeholder={t('supplier.combinedHint')}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value
            setCombined(value)
            const parsed = parseCombined(value)
            setField('code', parsed.code)
            setField('name', parsed.name)
            setField('contactPerson', parsed.contactPerson)
          }}
        />
      </label>
      {textFields.map(field => <label className={css.businessModuleSelect} key={field}>
        {t(`supplier.${field}`)}
        <Input
          value={draft[field]}
          onChange={(event) => { setField(field, event.target.value) }}
          disabled={disabled}
        />
      </label>)}
      <label className={css.businessModuleSelect}>
        {t('supplier.status')}
        <select value={draft.status ?? ''} disabled={disabled} onChange={(event) => {
          setField('status', event.target.value === '' ? undefined : Number(event.target.value))
        }}>
          <option value="">{t('supplier.unspecified')}</option>
          <option value={1}>{t('supplier.active')}</option>
          <option value={0}>{t('supplier.inactive')}</option>
          {draft.status !== undefined && draft.status !== 0 && draft.status !== 1 &&
            <option value={draft.status}>{draft.status}</option>}
        </select>
      </label>
    </div>
  </>
}
