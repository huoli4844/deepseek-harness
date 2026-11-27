/** 编排项目工时的选择、分页和写入。 */
import { useEffect, useState } from 'react'
import { Button, IconSearchOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import { LaborEditor, LaborTable } from './LaborRecords.tsx'
import { RegistrationProjectPicker } from './RegistrationProjectPicker.tsx'
import { listLabor } from './project-registration-api.ts'
import type { LaborRecord, RegistrationPage, RegistrationProject, RegistrationRange } from './project-registration-model.ts'
import { recordPageCount } from './record-list-viewmodel.ts'
import { DailyLaborEntry } from './DailyLaborEntry.tsx'
import css from './project-registration.module.css'

/** 渲染当前所选项目的工时明细，可接收周报跳转条件。 */
export function WorkHoursScreen({ t, initial, userId }: {
  readonly t: WorkbenchT
  readonly initial?: { readonly range: RegistrationRange; readonly project: RegistrationProject } | undefined
  readonly userId?: number | undefined
}) {
  return initial === undefined ? <DailyLaborEntry t={t} userId={userId} /> : <LaborDetail t={t} initial={initial} />
}

function LaborDetail({ t, initial }: {
  readonly t: WorkbenchT
  readonly initial: { readonly range: RegistrationRange; readonly project: RegistrationProject }
}) {
  const [project, setProject] = useState<RegistrationProject | undefined>(initial.project)
  const [period, setPeriod] = useState(initial.range)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<ArchiveSort>()
  const [rows, setRows] = useState<RegistrationPage<LaborRecord>>()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rangeError, setRangeError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState<{ readonly kind: 'edit' | 'submit'; readonly record?: LaborRecord }>()
  const projectCode = project?.code ?? ''
  useEffect(() => {
    if (!projectCode) return
    const controller = new AbortController()
    setError(false)
    setLoading(true)
    void listLabor({ ...period, projectCode }, page, sort, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setRows(result)
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize))
      if (page > lastPage) setPage(lastPage)
    }).catch(() => {
      if (!controller.signal.aborted) setError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => { controller.abort() }
  }, [projectCode, period, page, sort, attempt])
  const pageCount = recordPageCount(rows?.total, rows?.pageSize ?? 20)
  return <div className={css.screen}>
    <RegistrationProjectPicker selected={project} disabled={editor !== undefined} t={t} onSelect={(item) => {
      setProject(item); setPage(1); setRows(undefined); setError(false); setLoading(item !== undefined)
    }} />
    <form className={css.inline} onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const dateFrom = readFormText(data, 'dateFrom')
      const dateTo = readFormText(data, 'dateTo')
      if (dateFrom && dateTo && dateFrom > dateTo) { setRangeError(true); return }
      setRangeError(false)
      setPeriod({ projectCode, dateFrom, dateTo, status: readFormText(data, 'status') })
      setPage(1)
    }}>
      <label className={css.field}>{t('labor.dateFrom')}<Input name="dateFrom" type="date" defaultValue={period.dateFrom} /></label>
      <label className={css.field}>{t('labor.dateTo')}<Input name="dateTo" type="date" defaultValue={period.dateTo} /></label>
      <label className={css.field}>{t('registration.status')}
        <select name="status" defaultValue={period.status ?? ''}>
          <option value="">{t('registration.allStatuses')}</option>
          {(['draft', 'submitted', 'approved', 'rejected'] as const).map(status => <option key={status} value={status}>{t(`registration.${status}`)}</option>)}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={!projectCode} aria-label={t('registration.search')} icon={<IconSearchOutlineRegular />} />
      <Button type="button" variant="primary" disabled={!projectCode} onClick={() => { setEditor({ kind: 'edit' }) }}>{t('labor.add')}</Button>
    </form>
    {rangeError && <p role="alert">{t('labor.rangeError')}</p>}
    {projectCode && <>
      {loading && <p role="status">{t('registration.loading')}</p>}
      {error && <div role="alert" className={css.inline}>{t('registration.loadError')}
        <Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>{t('registration.retry')}</Button>
      </div>}
      {rows && <>
        {!loading && rows.items.length === 0 && <p>{t('labor.empty')}</p>}
        <div className={css.scrollArea}>
          <LaborTable rows={rows.items} sort={sort} t={t} onSort={(key) => {
            setSort(previous => ({ key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }))
            setPage(1)
          }} onAction={(kind, record) => { setEditor({ kind, record }) }} />
        </div>
        <ArchiveListFooter archiveTotal={rows.archiveTotal} resource="labor" t={t} ready page={page}
          pageCount={pageCount} canGoNext={page < (pageCount ?? 1)} onPage={(next) => { setPage(next) }} />
      </>}
    </>}
    {editor && <LaborEditor projectCode={projectCode} mode={editor.kind} record={editor.record} workDate={period.dateFrom}
      t={t} onClose={() => { setEditor(undefined) }} onSaved={() => { setEditor(undefined); setAttempt(value => value + 1) }} />}
  </div>
}
