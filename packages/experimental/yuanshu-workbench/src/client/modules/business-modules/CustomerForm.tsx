/** 客户新建与编辑表单，仅负责字段展示和输入回调。 */
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { CustomerDraft } from './customer-api.ts'
import { customerLevels, isCustomerLevel } from '../../../business-forms/customer-create-contract.ts'
import css from './business-modules.module.css'

/** 渲染客户档案字段，不持有业务状态或执行网络请求。 */
export function CustomerForm({ draft, error, t, setField }: {
  readonly draft: CustomerDraft
  readonly error: string | undefined
  readonly t: WorkbenchT
  readonly setField: <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => void
}) {
  return <>
    {error !== undefined && <p className={css.businessModuleFormError} role="alert">{error}</p>}
    <div className={css.businessModuleFormGrid}>
      <Input aria-label={t('customer.code')} value={draft.code} onChange={(event) => { setField('code', event.target.value) }} />
      <Input aria-label={t('customer.name')} value={draft.name} onChange={(event) => { setField('name', event.target.value) }} />
      <Input aria-label={t('customer.shortName')} value={draft.shortName} onChange={(event) => { setField('shortName', event.target.value) }} />
      <Input aria-label={t('customer.industry')} value={draft.industry} onChange={(event) => { setField('industry', event.target.value) }} />
      <label className={css.businessModuleSelect}>{t('customer.level')}
        <select aria-label={t('customer.level')} value={draft.level} onChange={(event) => { setField('level', event.target.value) }}>
          {!isCustomerLevel(draft.level) && <option value={draft.level} disabled>{t('customer.level.invalid')}</option>}
          {customerLevels.map(level => <option key={level} value={level}>{t(`customer.level.${level}`)}</option>)}
        </select>
      </label>
      <Input aria-label={t('customer.contactPerson')} value={draft.contactPerson} onChange={(event) => { setField('contactPerson', event.target.value) }} />
      <Input aria-label={t('customer.contactPhone')} value={draft.contactPhone} onChange={(event) => { setField('contactPhone', event.target.value) }} />
      <Input aria-label={t('customer.contactEmail')} value={draft.contactEmail} onChange={(event) => { setField('contactEmail', event.target.value) }} />
      <Input aria-label={t('customer.address')} value={draft.address} onChange={(event) => { setField('address', event.target.value) }} />
      <Input type="number" min="0" aria-label={t('customer.creditLimit')} value={draft.creditLimit} onChange={(event) => { setField('creditLimit', Number(event.target.value)) }} />
      <label className={css.businessModuleSelect}>{t('customer.status')}<select aria-label={t('customer.status')} value={draft.status} onChange={(event) => { setField('status', Number(event.target.value)) }}>
        <option value={1}>{t('customer.active')}</option><option value={0}>{t('customer.inactive')}</option>
      </select></label>
    </div>
  </>
}
