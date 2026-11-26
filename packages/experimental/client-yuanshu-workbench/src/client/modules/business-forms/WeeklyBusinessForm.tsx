/** 受控周报 A2UI 表单：事项支持编辑、删除和手动新增，最终内容由宿主提交。 */
/* oxlint-disable @stylistic/max-len, @stylistic/arrow-parens, typescript/no-confusing-void-expression */
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { WeeklyContent, WeeklyItem, WeeklyForm } from '../../../business-forms/model.ts'
import type { BusinessSurface } from '../../../business-forms/a2ui.ts'
import css from './business-forms.module.css'

const WORK_TYPES = ['direct', 'indirect', 'meeting', 'overtime', 'training'] as const
const STATUSES = ['planned', 'in_progress', 'completed', 'blocked'] as const

export function WeeklyBusinessForm({ form, surface: _surface, content, busy, frozen, error, t, onChange, onAction }: {
  readonly form: WeeklyForm
  readonly surface: BusinessSurface
  readonly content: WeeklyContent
  readonly busy: boolean
  readonly frozen: boolean
  readonly error?: string
  readonly t: WorkbenchT
  readonly onChange: (content: WeeklyContent) => void
  readonly onAction: (action: 'save' | 'submit' | 'cancel' | 'retry') => void
}) {
  const [selected, setSelected] = useState(0)
  const updateItem = (index: number, patch: Partial<WeeklyItem>) => onChange({ ...content, items: content.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  const addItem = () => { const item: WeeklyItem = { id: `item-${Date.now()}`, project_code: '', project_name: '', work_type: 'direct', work_item: '', completion_status: 'in_progress', has_risk: false, risk_details: '' }; onChange({ ...content, items: [...content.items, item] }); setSelected(content.items.length) }
  const removeItem = (index: number) => { onChange({ ...content, items: content.items.filter((_, itemIndex) => itemIndex !== index) }); setSelected(Math.max(0, Math.min(selected, content.items.length - 2))) }
  const ready = content.progress_summary.trim() !== '' && content.items.every(item => item.project_code.trim() !== '' && item.work_item.trim() !== '')
  return <Modal open title={t('weekly.form.title')} closeLabel={t('weekly.form.cancel')} className={css.modal ?? ''} maxWidth={760} contentClassName={css.modalContent ?? ''}
    onClose={() => { if (!busy && !frozen) onAction('cancel') }}>
    <div className={css.form}><div className={css.body}>
      <div className={css.metadata}><span>{t('weekly.form.period')}</span><time dateTime={form.period_start}>{form.period_start} ～ {form.period_end}</time></div>
      <p className={css.coverage}>{t('weekly.form.coverage')}</p>
      {(['progress_summary', 'planned_work', 'issues_and_risks', 'need_support'] as const).map((key, index) => <label key={key} className={css.field}><span>{t(`weekly.form.${key}`)}</span><textarea rows={index === 0 ? 3 : 2} value={content[key]} disabled={busy || frozen} onChange={event => onChange({ ...content, [key]: event.currentTarget.value })} /></label>)}
      <div className={css.weeklyItemsHeader}><strong>{t('weekly.form.items')}</strong><Button size="sm" variant="outline" disabled={busy || frozen} onClick={addItem}>{t('weekly.form.add')}</Button></div>
      {content.items.map((item, index) => <div className={css.weeklyItem} key={item.id}>
        <div className={css.weeklyItemHeader}><button type="button" className={css.weeklyItemTab} aria-selected={selected === index} onClick={() => setSelected(index)}>{index + 1}. {item.project_name || item.project_code || t('weekly.form.unassigned')}</button><Button size="sm" variant="ghost" disabled={busy || frozen} onClick={() => removeItem(index)}>{t('weekly.form.delete')}</Button></div>
        {selected === index && <div className={css.weeklyItemGrid}>
          <label className={css.field}><span>{t('weekly.form.project')}</span><select value={item.project_code} disabled={busy || frozen} onChange={event => { const project = form.projects.find(option => option.code === event.currentTarget.value); updateItem(index, { project_code: event.currentTarget.value, project_name: project?.name ?? '' }) }}><option value="">{t('weekly.form.projectPlaceholder')}</option>{form.projects.map(project => <option key={project.code} value={project.code}>{project.code} · {project.name}</option>)}</select></label>
          <label className={css.field}><span>{t('weekly.form.projectName')}</span><Input value={item.project_name} disabled={true} /></label>
          <label className={css.field}><span>{t('weekly.form.workType')}</span><select value={item.work_type} disabled={busy || frozen} onChange={event => updateItem(index, { work_type: event.currentTarget.value })}>{WORK_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={css.field}><span>{t('weekly.form.status')}</span><select value={item.completion_status} disabled={busy || frozen} onChange={event => updateItem(index, { completion_status: event.currentTarget.value })}>{STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={css.field}><span>{t('weekly.form.workItem')}</span><textarea rows={2} value={item.work_item} disabled={busy || frozen} onChange={event => updateItem(index, { work_item: event.currentTarget.value })} /></label>
          <label className={css.field}><span>{t('weekly.form.risk')}</span><textarea rows={2} value={item.risk_details} disabled={busy || frozen} onChange={event => updateItem(index, { risk_details: event.currentTarget.value, has_risk: event.currentTarget.value.trim() !== '' })} /></label>
        </div>}
      </div>)}
      <div className={css.notice} role="alert">{error ?? (!ready ? t('weekly.form.required') : '')}</div>
    </div><div className={css.actions}><Button size="sm" variant="outline" disabled={busy || frozen} onClick={() => onAction('cancel')}>{t('weekly.form.cancel')}</Button>{frozen ? <Button size="sm" variant="primary" disabled={busy} onClick={() => onAction('retry')}>{t('weekly.form.retry')}</Button> : <><Button size="sm" variant="outline" disabled={busy} onClick={() => onAction('save')}>{t('weekly.form.save')}</Button><Button size="sm" variant="primary" disabled={busy || !ready} onClick={() => onAction('submit')}>{t('weekly.form.submit')}</Button></>}</div></div>
  </Modal>
}
