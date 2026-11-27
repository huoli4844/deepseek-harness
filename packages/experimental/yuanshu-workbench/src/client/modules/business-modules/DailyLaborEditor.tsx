/** 渲染当日多条工时事项的编辑列表，写入由容器管理。 */
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { RegistrationProject } from './project-registration-model.ts'
import { completionStatuses, laborTypes } from './project-registration-viewmodel.ts'
import type { LaborDraftRow } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

/** 展示可增删的事项行，并在整批保存前保持所有输入。 */
export function DailyLaborEditor({ projects, rows, busy, t, onAdd, onUpdate, onRemove, onSave }: {
  readonly projects: readonly RegistrationProject[]
  readonly rows: readonly LaborDraftRow[]
  readonly busy: boolean
  readonly t: WorkbenchT
  readonly onAdd: () => void
  readonly onUpdate: (key: string, patch: Partial<LaborDraftRow>) => void
  readonly onRemove: (key: string) => void
  readonly onSave: () => void
}) {
  return <section className={css.column} aria-label={t('labor.entriesTitle')}>
    <h3>{t('labor.entriesTitle')}</h3>
    {rows.map(row => <div key={row.key} className={css.entry}>
      <div className={css.entryGrid}>
        <label className={css.field}>{t('registration.project')}
          <select value={row.projectCode} disabled={busy} onChange={(event) => {
            onUpdate(row.key, { projectCode: event.currentTarget.value })
          }}>
            <option value="">{t('registration.selectProject')}</option>
            {projects.map(item => <option key={item.code} value={item.code}>{item.code} {item.name}</option>)}
          </select>
        </label>
        <label className={css.field}>{t('labor.work_type')}
          <select value={row.work_type} disabled={busy} onChange={(event) => {
            onUpdate(row.key, { work_type: event.currentTarget.value })
          }}>
            {laborTypes.map(value => <option key={value} value={value}>{t(`labor.${value}`)}</option>)}
          </select>
        </label>
        <label className={css.field}>{t('labor.hours')}
          <Input inputMode="decimal" value={row.hours} disabled={busy} onChange={(event) => {
            onUpdate(row.key, { hours: event.currentTarget.value })
          }} />
        </label>
        <label className={css.field}>{t('labor.completion_status')}
          <select value={row.completion_status} disabled={busy} onChange={(event) => {
            onUpdate(row.key, { completion_status: event.currentTarget.value })
          }}>
            <option value="">{t('labor.chooseCompletion')}</option>
            {completionStatuses.map(value => <option key={value} value={value}>{t(`labor.completion.${value}`)}</option>)}
          </select>
        </label>
        <div className={css.entryAction}>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { onRemove(row.key) }}>{t('labor.removeItem')}</Button>
        </div>
      </div>
    </div>)}
    {rows.length === 0 && <p>{t('labor.entriesEmpty')}</p>}
    <div className={css.inline}>
      <Button type="button" variant="outline" disabled={busy || projects.length === 0} onClick={onAdd}>{t('labor.addItem')}</Button>
      <Button type="button" variant="primary" disabled={busy || rows.length === 0} onClick={onSave}>{t('labor.saveAll')}</Button>
    </div>
  </section>
}
