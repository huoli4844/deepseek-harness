/** 展示所选日期的已有工时记录，并按后台授权提供编辑或提交。 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { LaborRecord, RegistrationProject } from './project-registration-model.ts'
import { completionStatuses, laborTypes } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

const statuses = ['draft', 'submitted', 'approved', 'rejected'] as const

/** 每条记录的只读性完全由后台 can_edit 决定，不根据状态自行推断。 */
export function LaborDayRecords({ date, records, projects, busy, t, onEdit, onSubmit }: {
  readonly date: string
  readonly records: readonly LaborRecord[]
  readonly projects: readonly RegistrationProject[]
  readonly busy: boolean
  readonly t: WorkbenchT
  readonly onEdit: (record: LaborRecord, projectCode: string) => void
  readonly onSubmit: (record: LaborRecord, projectCode: string) => void
}) {
  const readOnly = records.some(record => !record.can_edit)
  return <section className={css.column} aria-label={t('labor.dayRecords', { date })}>
    <h3>{t('labor.dayRecords', { date })}</h3>
    {records.length === 0 && <p>{t('labor.dayEmpty')}</p>}
    {records.length > 0 && <ul className={css.records}>
      {records.map((record) => {
        const project = projects.find(item => item.id === record.project_id)
        const projectCode = project?.code ?? ''
        const type = laborTypes.find(value => value === record.work_type)
        const completion = completionStatuses.find(value => value === record.completion_status)
        const status = statuses.find(value => value === record.status)
        return <li key={record.id} className={css.record}>
          <div className={css.recordTop}>
            <strong>{project === undefined ? String(record.project_id) : `${project.code} ${project.name}`}</strong>
            <span>{t('labor.hourValue', { hours: record.hours })}</span>
          </div>
          <dl className={css.recordMeta}>
            <div><dt>{t('labor.work_type')}</dt><dd>{type === undefined ? record.work_type : t(`labor.${type}`)}</dd></div>
            <div><dt>{t('labor.completion_status')}</dt><dd>{completion === undefined ? record.completion_status ?? '' : t(`labor.completion.${completion}`)}</dd></div>
            <div><dt>{t('registration.status')}</dt><dd>{status === undefined ? record.status : t(`registration.${status}`)}</dd></div>
          </dl>
          {record.description !== '' && <p className={css.recordDescription}>{record.description}</p>}
          <div className={css.inline}>
            {record.can_edit
              ? <Button type="button" variant="outline" size="sm" disabled={busy || projectCode === ''} onClick={() => { onEdit(record, projectCode) }}>{t('labor.edit')}</Button>
              : <span className={css.readOnly}>{t('labor.readOnly')}</span>}
            {record.can_submit && <Button type="button" variant="outline" size="sm" disabled={busy || projectCode === ''}
              onClick={() => { onSubmit(record, projectCode) }}>{t('labor.submit')}</Button>}
          </div>
        </li>
      })}
    </ul>}
    {readOnly && <p className={css.hint}>{t('labor.readOnlyHint')}</p>}
  </section>
}
