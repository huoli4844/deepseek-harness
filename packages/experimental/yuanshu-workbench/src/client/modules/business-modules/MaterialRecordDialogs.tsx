/**
 * 展示物料档案编辑与删除确认弹窗。
 * 组件只展示受控字段并调用回调，不访问网络或管理异步状态。
 */
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { MaterialDraft, MaterialRecord, MaterialPage } from './material-model.ts'
import css from './material-management.module.css'
import businessCss from './business-modules.module.css'

/** 渲染物料编辑表单。 */
export function MaterialRecordDialog({ draft, result, error, pending, t, onChange, onSave, onClose }: {
  readonly draft: MaterialDraft
  readonly result: MaterialPage | undefined
  readonly error: string | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onChange: <K extends keyof MaterialDraft>(key: K, value: MaterialDraft[K]) => void
  readonly onSave: () => void
  readonly onClose: () => void
}) {
  const materialTypes = result?.materialTypes ?? []
  const criticalLevels = result?.criticalLevels ?? []
  return <Modal open title={t('material.edit')} closeLabel={t('material.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}><Button variant="primary" disabled={pending} onClick={onSave}>{t('material.save')}</Button><Button variant="outline" disabled={pending} onClick={onClose}>{t('material.cancel')}</Button></div>}>
    <div className={css.recordForm}>
      <label>{t('material.code')}<Input value={draft.code} disabled={pending} maxLength={100} onChange={(event) => { onChange('code', event.currentTarget.value) }} /></label>
      <label>{t('material.name')}<Input value={draft.name} disabled={pending} maxLength={200} onChange={(event) => { onChange('name', event.currentTarget.value) }} /></label>
      <label>{t('material.spec')}<Input value={draft.spec ?? ''} disabled={pending} maxLength={2000} onChange={(event) => { onChange('spec', event.currentTarget.value) }} /></label>
      <label>{t('material.material_type')}<select value={draft.materialType} disabled={pending} onChange={(event) => { onChange('materialType', event.currentTarget.value) }}>
        {draft.materialType && !materialTypes.includes(draft.materialType) && (
          <option value={draft.materialType}>{draft.materialType}</option>
        )}
        {materialTypes.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>{t('material.critical_level')}<select value={draft.criticalLevel} disabled={pending} onChange={(event) => { onChange('criticalLevel', event.currentTarget.value) }}>
        {draft.criticalLevel && !criticalLevels.includes(draft.criticalLevel) && (
          <option value={draft.criticalLevel}>{draft.criticalLevel}</option>
        )}
        {criticalLevels.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label>{t('material.category_code')}<Input value={draft.categoryCode} disabled={pending} maxLength={50} onChange={(event) => { onChange('categoryCode', event.currentTarget.value) }} /></label>
      <label>{t('material.category_code2')}<Input value={draft.categoryCode2} disabled={pending} maxLength={50} onChange={(event) => { onChange('categoryCode2', event.currentTarget.value) }} /></label>
      <label>{t('material.unit')}<Input value={draft.unit} disabled={pending} onChange={(event) => { onChange('unit', event.currentTarget.value) }} /></label>
      <label>{t('material.brand')}<Input value={draft.brand} disabled={pending} onChange={(event) => { onChange('brand', event.currentTarget.value) }} /></label>
      <label>{t('material.model')}<Input value={draft.model} disabled={pending} onChange={(event) => { onChange('model', event.currentTarget.value) }} /></label>
      <label>{t('material.drawing_no')}<Input value={draft.drawingNo ?? ''} disabled={pending} onChange={(event) => { onChange('drawingNo', event.currentTarget.value) }} /></label>
      <label>{t('material.price_suggested')}<Input type="number" min="0" step="0.0001" value={draft.priceSuggested} disabled={pending} onChange={(event) => { onChange('priceSuggested', event.currentTarget.value) }} /></label>
      <label>{t('material.safety_stock')}<Input type="number" min="0" step="0.0001" value={draft.safetyStock} disabled={pending} onChange={(event) => { onChange('safetyStock', event.currentTarget.value) }} /></label>
      <label>{t('material.lead_time_days')}<Input type="number" min="0" step="1" value={draft.leadTimeDays} disabled={pending} onChange={(event) => { onChange('leadTimeDays', event.currentTarget.value) }} /></label>
      <label>{t('material.status')}<Input type="number" step="1" value={draft.status} disabled={pending} onChange={(event) => { onChange('status', event.currentTarget.value) }} /></label>
      <label className={css.recordFormWide}>{t('material.remark')}<Input value={draft.remark} disabled={pending} onChange={(event) => { onChange('remark', event.currentTarget.value) }} /></label>
      {error !== undefined && <p className={`${businessCss.businessModuleFormError} ${css.recordFormWide}`} role="alert">{error}</p>}
    </div>
  </Modal>
}

/** 渲染物料逻辑删除确认。 */
export function MaterialDeleteDialog({ record, error, pending, t, onDelete, onClose }: {
  readonly record: MaterialRecord
  readonly error: string | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onDelete: () => void
  readonly onClose: () => void
}) {
  return <Modal open title={t('material.delete')} closeLabel={t('material.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}><Button variant="primary" disabled={pending} onClick={onDelete}>{t('material.delete')}</Button><Button variant="outline" disabled={pending} onClick={onClose}>{t('material.cancel')}</Button></div>}>
    <p>{t('material.confirmDelete')}</p>
    <p>{String(record.values.name ?? record.values.code ?? record.id)}</p>
    {error !== undefined && <p className={businessCss.businessModuleFormError} role="alert">{error}</p>}
  </Modal>
}
