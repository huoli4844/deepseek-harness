/** 日历事项新增/编辑弹窗：日历页与岗位工作台共用同一份表单。 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskId } from '../../core/model.ts'
import { STATUSES, type CalendarDraft, type CalendarStatus, type FormState } from './calendar-shared.ts'
import css from './Calendar.module.css'

type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']

export interface CalendarItemFormProps {
  readonly t: WorkbenchT
  readonly form: FormState
  readonly draft: CalendarDraft
  readonly setDraft: (draft: CalendarDraft) => void
  readonly taskOptions: readonly { readonly id: TaskId; readonly label: string }[]
  readonly onSave: () => void
  readonly onRemove: () => void
  readonly onClose: () => void
}

/** 渲染事项表单弹窗；form 为空时不渲染。 */
export function CalendarItemForm({ t, form, draft, setDraft, taskOptions, onSave, onRemove, onClose }: CalendarItemFormProps) {
  if (form === undefined) return null
  return <Modal
    open
    title={form.kind === 'add' ? t('calendar.formAdd') : t('calendar.formEdit')}
    closeLabel={t('close')}
    onClose={onClose}
    footer={<>
      {form.kind === 'edit' && <Button variant="outline" onClick={onRemove}>{t('calendar.remove')}</Button>}
      <Button variant="primary" onClick={onSave}>{t('calendar.save')}</Button>
      <Button onClick={onClose}>{t('cancel')}</Button>
    </>}
  >
    <label className={css.formRow}>
      <span>{t('calendar.title')}</span>
      <Input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }) }} />
    </label>
    <label className={css.formRow}>
      <span>{t('calendar.fieldDate')}</span>
      <input type="date" className={css.nativeInput} value={draft.date}
        onChange={(event) => { setDraft({ ...draft, date: event.target.value }) }} />
    </label>
    <label className={css.formRow}>
      <span>{t('calendar.fieldTime')}</span>
      <input type="time" className={css.nativeInput} value={draft.time}
        onChange={(event) => { setDraft({ ...draft, time: event.target.value }) }} />
    </label>
    <label className={css.formRow}>
      <span>{t('calendar.fieldStatus')}</span>
      <select className={css.nativeInput} value={draft.status}
        onChange={(event) => { setDraft({ ...draft, status: event.target.value as CalendarStatus }) }}>
        {STATUSES.map(status => <option key={status} value={status}>{t(`calendar.status.${status}`)}</option>)}
      </select>
    </label>
    <label className={css.formRow}>
      <span>{t('calendar.fieldTask')}</span>
      <select className={css.nativeInput} value={draft.taskId}
        onChange={(event) => { setDraft({ ...draft, taskId: event.target.value }) }}>
        <option value="">{t('calendar.taskNone')}</option>
        {taskOptions.map(option => <option key={option.id} value={String(option.id)}>{option.label}</option>)}
      </select>
    </label>
  </Modal>
}
