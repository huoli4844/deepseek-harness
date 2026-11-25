/**
 * 展示设备新建、编辑与删除确认弹窗。
 * 组件只展示受控字段并调用回调，不访问网络或管理异步状态。
 */
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { lifecycleStatuses, runtimeStatuses, type EquipmentDraft, type EquipmentRecord } from './equipment-model.ts'
import type { EquipmentWriteError } from './use-equipment-ledger.ts'
import { lifecycleLabel, runtimeLabel } from './equipment-viewmodel.ts'
import css from './equipment-ledger.module.css'
import businessCss from './business-modules.module.css'

/** 渲染设备新建与编辑表单。 */
export function EquipmentRecordDialog({ id, draft, error, pending, t, onChange, onSave, onClose }: {
  readonly id: number | undefined
  readonly draft: EquipmentDraft
  readonly error: EquipmentWriteError | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onChange: (patch: Partial<EquipmentDraft>) => void
  readonly onSave: () => void
  readonly onClose: () => void
}) {
  const title = t(id === undefined ? 'equipment.createTitle' : 'equipment.editTitle')
  return <Modal open title={title} closeLabel={t('equipment.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onSave}>{t('equipment.save')}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('equipment.cancel')}</Button>
    </div>}>
    <div className={css.recordForm}>
      <label>{t('equipment.code')}<Input value={draft.code} disabled={pending} maxLength={50}
        onChange={(event) => { onChange({ code: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.name')}<Input value={draft.name} disabled={pending} maxLength={200}
        onChange={(event) => { onChange({ name: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.equipment_type')}<Input value={draft.equipmentType} disabled={pending} maxLength={50}
        onChange={(event) => { onChange({ equipmentType: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.workshop')}<Input value={draft.workshop} disabled={pending} maxLength={50}
        onChange={(event) => { onChange({ workshop: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.model')}<Input value={draft.model} disabled={pending} maxLength={100}
        onChange={(event) => { onChange({ model: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.manufacturer')}<Input value={draft.manufacturer} disabled={pending} maxLength={200}
        onChange={(event) => { onChange({ manufacturer: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.lifecycle_status')}<select value={draft.lifecycleStatus} disabled={pending}
        onChange={(event) => { onChange({ lifecycleStatus: event.currentTarget.value }) }}>
        {lifecycleStatuses.map(value => <option key={value} value={value}>{lifecycleLabel(t, value)}</option>)}
      </select></label>
      <label>{t('equipment.runtime_status')}<select value={draft.runtimeStatus} disabled={pending}
        onChange={(event) => { onChange({ runtimeStatus: event.currentTarget.value }) }}>
        {runtimeStatuses.map(value => <option key={value} value={value}>{runtimeLabel(t, value)}</option>)}
      </select></label>
      <label>{t('equipment.maint_interval_days')}<Input type="number" min="0" step="1" value={draft.maintIntervalDays} disabled={pending}
        onChange={(event) => { onChange({ maintIntervalDays: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.serial_no')}<Input value={draft.serialNo} disabled={pending} maxLength={100}
        onChange={(event) => { onChange({ serialNo: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.purchase_date')}<Input type="date" value={draft.purchaseDate} disabled={pending}
        onChange={(event) => { onChange({ purchaseDate: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.arrival_date')}<Input type="date" value={draft.arrivalDate} disabled={pending}
        onChange={(event) => { onChange({ arrivalDate: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.qr_code')}<Input value={draft.qrCode} disabled={pending} maxLength={200}
        onChange={(event) => { onChange({ qrCode: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.category_code')}<Input value={draft.categoryCode} disabled={pending} maxLength={64}
        onChange={(event) => { onChange({ categoryCode: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.category_name')}<Input value={draft.categoryName} disabled={pending} maxLength={120}
        onChange={(event) => { onChange({ categoryName: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.subcategory_code')}<Input value={draft.subcategoryCode} disabled={pending} maxLength={64}
        onChange={(event) => { onChange({ subcategoryCode: event.currentTarget.value }) }} /></label>
      <label>{t('equipment.subcategory_name')}<Input value={draft.subcategoryName} disabled={pending} maxLength={120}
        onChange={(event) => { onChange({ subcategoryName: event.currentTarget.value }) }} /></label>
      <label className={css.recordFormWide}>{t('equipment.remark')}<Input value={draft.remark} disabled={pending} maxLength={4000}
        onChange={(event) => { onChange({ remark: event.currentTarget.value }) }} /></label>
      {error !== undefined && <p className={`${businessCss.businessModuleFormError} ${css.recordFormWide}`} role="alert">{t(error)}</p>}
    </div>
  </Modal>
}

/** 渲染设备逻辑删除确认。 */
export function EquipmentDeleteDialog({ record, error, pending, t, onDelete, onClose }: {
  readonly record: EquipmentRecord
  readonly error: EquipmentWriteError | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onDelete: () => void
  readonly onClose: () => void
}) {
  return <Modal open title={t('equipment.delete')} closeLabel={t('equipment.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onDelete}>{t('equipment.delete')}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('equipment.cancel')}</Button>
    </div>}>
    <p>{t('equipment.confirmDelete')}</p>
    <p>{String(record.values.name ?? record.values.code ?? record.id)}</p>
    {error !== undefined && <p className={businessCss.businessModuleFormError} role="alert">{t(error)}</p>}
  </Modal>
}
