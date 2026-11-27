/** 显示工时档案与填报弹窗，写入由弹窗容器管理。 */
import { useEffect, useRef, useState } from 'react'
import { Button, IconEditOutlineRegular, IconCheckOutlineRegular, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import { readFormText } from '../../shared/form-data.ts'
import { saveLabor, submitLabor } from './project-registration-api.ts'
import type { LaborRecord } from './project-registration-model.ts'
import { beijingDate, completionStatuses, laborDraft, laborTypes, registrationWriteError, validLaborHours } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

const columns = [
  ['work_date', 'labor.work_date'], ['user_id', 'registration.employee'], ['hours', 'labor.hours'],
  ['work_type', 'labor.work_type'], ['description', 'labor.description'], ['task_id', 'labor.task_id'],
  ['completion_status', 'labor.completion_status'], ['status', 'registration.status'],
  ['submitted_at', 'registration.submittedAt'], ['approved_at', 'labor.approvedAt'],
  ['updated_at', 'registration.updatedAt'],
] as const

/** 渲染后台分页下的工时表格和后端允许的行操作。 */
export function LaborTable({ rows, sort, t, onSort, onAction }: {
  readonly rows: readonly LaborRecord[]
  readonly sort: ArchiveSort | undefined
  readonly t: WorkbenchT
  readonly onSort: (column: string) => void
  readonly onAction: (kind: 'edit' | 'submit', record: LaborRecord) => void
}) {
  const statuses = ['draft', 'submitted', 'approved', 'rejected'] as const
  const data = rows.map((row) => {
    const status = statuses.find(key => key === row.status)
    const type = laborTypes.find(key => key === row.work_type)
    const completion = completionStatuses.find(key => key === row.completion_status)
    return { key: row.id, cells: { ...row, can_edit: undefined, can_submit: undefined,
      status: status ? t(`registration.${status}`) : row.status,
      work_type: type ? t(`labor.${type}`) : row.work_type,
      completion_status: completion ? t(`labor.completion.${completion}`) : row.completion_status,
      updated_at: formatBeijingDateTime(row.updated_at), submitted_at: formatBeijingDateTime(row.submitted_at),
      approved_at: formatBeijingDateTime(row.approved_at),
    } }
  })
  return <ArchiveTable columns={columns.map(([key, label]) => ({ key, label: t(label), width: key === 'description' ? 220 : 132 }))}
    rows={data} sort={sort} onSort={onSort} actionsLabel={t('registration.actions')} renderActions={(key) => {
      const record = rows.find(row => row.id === key)
      if (!record) return undefined
      return <div className={css.inline}>
        {record.can_edit && <Tooltip label={t('labor.edit')} portal side="top">
          <Button variant="toolbar" size="sm" aria-label={t('labor.edit')} icon={<IconEditOutlineRegular size={16} />}
            onClick={() => { onAction('edit', record) }} />
        </Tooltip>}
        {record.can_submit && <Tooltip label={t('labor.submit')} portal side="top">
          <Button variant="toolbar" size="sm" aria-label={t('labor.submit')} icon={<IconCheckOutlineRegular size={16} />}
            onClick={() => { onAction('submit', record) }} />
        </Tooltip>}
      </div>
    }} />
}

/** 渲染填报或提交弹窗，写入失败保留表单。 */
export function LaborEditor({ projectCode, mode, record, workDate, t, onClose, onSaved }: {
  readonly projectCode: string
  readonly mode: 'edit' | 'submit'
  readonly record: LaborRecord | undefined
  readonly workDate: string
  readonly t: WorkbenchT
  readonly onClose: () => void
  readonly onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Parameters<WorkbenchT>[0]>()
  const active = useRef<AbortController>()
  const defaults = laborDraft(record, workDate || beijingDate())
  const title = t(mode === 'submit' ? 'labor.submit' : record ? 'labor.edit' : 'labor.add')
  useEffect(() => () => { active.current?.abort() }, [])
  const save = (data: FormData) => {
    if (active.current) return
    const hours = readFormText(data, 'hours').trim()
    if (mode === 'edit' && !validLaborHours(hours)) { setError('labor.hoursError'); return }
    const controller = new AbortController()
    active.current = controller
    setError(undefined)
    setBusy(true)
    const task = readFormText(data, 'task_id')
    const work = mode === 'submit' && record ? submitLabor(projectCode, record.id, controller.signal)
      : saveLabor(projectCode, record?.id, {
        hours, work_date: readFormText(data, 'work_date'), work_type: readFormText(data, 'work_type'),
        description: readFormText(data, 'description'), ...(task ? { task_id: Number(task) } : {}),
        ...(record?.completion_status ? { completion_status: record.completion_status } : {}),
      }, controller.signal)
    void work.then(() => {
      if (!controller.signal.aborted) onSaved()
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(registrationWriteError(failure))
    }).finally(() => {
      if (controller.signal.aborted) return
      active.current = undefined
      setBusy(false)
    })
  }
  return <Modal open title={title} closeLabel={t('registration.cancel')} onClose={() => { if (!busy) onClose() }}>
    <form className={css.form} onSubmit={(event) => { event.preventDefault(); save(new FormData(event.currentTarget)) }}>
      {mode === 'submit' ? <p>{t('labor.submitConfirm')}</p> : <>
        <label className={css.field}>{t('labor.work_date')}<Input type="date" name="work_date" defaultValue={defaults.work_date} required disabled={busy} /></label>
        <label className={css.field}>{t('labor.hours')}<Input inputMode="decimal" name="hours" defaultValue={defaults.hours} required disabled={busy} /></label>
        <label className={css.field}>{t('labor.work_type')}<select name="work_type" defaultValue={defaults.work_type} disabled={busy}>
          {laborTypes.map(type => <option key={type} value={type}>{t(`labor.${type}`)}</option>)}
        </select></label>
        <label className={css.field}>{t('labor.task_id')}<Input type="number" min={1} max={Number.MAX_SAFE_INTEGER} name="task_id" defaultValue={defaults.task_id} disabled={busy} /></label>
        <label className={css.field}>{t('labor.description')}<textarea rows={3} name="description" defaultValue={defaults.description} disabled={busy} /></label>
      </>}
      {error && <p role="alert">{t(error)}</p>}
      <div className={css.inline}>
        <Button type="submit" variant="primary" disabled={busy}>{t(mode === 'submit' ? 'registration.submit' : 'registration.save')}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t('registration.cancel')}</Button>
      </div>
    </form>
  </Modal>
}
