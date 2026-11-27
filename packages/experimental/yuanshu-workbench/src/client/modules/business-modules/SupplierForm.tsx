/** 供应商新建与编辑表单，只负责字段展示和输入回调。 */
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { SupplierDraft } from './supplier-model.ts'
import css from './business-modules.module.css'

const textFields = [
  'code', 'name', 'shortName', 'supplierType', 'category', 'contactPerson',
  'contactPhone', 'contactEmail', 'address', 'admissionStatus',
] as const

/** 渲染供应商档案字段，不持有业务状态或执行网络请求。 */
export function SupplierForm({ draft, error, t, setField, disabled }: {
  readonly disabled: boolean
  readonly draft: SupplierDraft
  readonly error: string | undefined
  readonly t: WorkbenchT
  readonly setField: <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) => void
}) {
  return <>
    {error !== undefined && <p className={css.businessModuleFormError} role="alert">{error}</p>}
    <div className={css.businessModuleFormGrid}>
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
