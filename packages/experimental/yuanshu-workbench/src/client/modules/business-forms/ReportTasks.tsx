/** 待办事项中的日报和周报恢复入口，复用受控表单和工作台同源写入。 */
import { useEffect, useRef, useState } from 'react'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { listRegistrationProjects } from '../business-modules/project-registration-api.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import { dailySurface, weeklySurface } from '../../../business-forms/a2ui.ts'
import type { DailyContent, WeeklyContent } from '../../../business-forms/model.ts'
import { BusinessForm } from './BusinessForm.tsx'
import { WeeklyBusinessForm } from './WeeklyBusinessForm.tsx'
import { reportTasks, recordReportTask, recoveryChanged, type ReportTask, type ReportReceipt } from './recovery-store.ts'
import { cachedReportAccount } from './account-cache.ts'
import { recoveryResult } from './recovery-viewmodel.ts'
import { assistantAccountKey, createCredentialGuard, hasEnterpriseLogin, submitRecovery } from './source.ts'
import { canSubmit, formView } from './viewmodel.ts'
import css from './business-forms.module.css'

const timeText = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' })
const failureKeys = {
  sending: 'reportTasks.uncertain', uncertain: 'reportTasks.uncertain', invalid: 'reportTasks.invalid',
  auth: 'reportTasks.auth', conflict: 'reportTasks.conflict', expired: 'reportTasks.expired',
} as const
type Entry = ReportTask | ReportReceipt
type Action = 'save' | 'submit' | 'cancel' | 'retry'

function isDaily(task: ReportTask): task is Extract<ReportTask, { form: { work_date: string } }> {
  return task.request.kind === 'daily'
}

function statusKey(row: Entry) {
  if (row.result !== 'success') return failureKeys[row.result]
  if (row.request.kind === 'daily') return row.request.action === 'submit' ? 'daily.submitted' : 'daily.saved'
  return row.request.action === 'submit' ? 'weekly.submitted' : 'weekly.saved'
}

/** 展示当前企业账号已确认的回执及可重新打开的失败事项。 */
export function ReportTasks({ t }: { readonly t: WorkbenchT }) {
  const [rows, setRows] = useState<readonly Entry[]>([])
  const [active, setActive] = useState<ReportTask>()
  const [sameAccount] = useState(createCredentialGuard)
  const [loadingFailed, setLoadingFailed] = useState(false)
  const [storageFailed, setStorageFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [projects, setProjects] = useState<readonly import('../../../business-forms/model.ts').WeeklyProject[]>([])
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<ReportReceipt>()
  const write = useRef<AbortController>()
  useEffect(() => () => { write.current?.abort() }, [])
  useEffect(() => {
    if (!hasEnterpriseLogin() || !sameAccount()) return
    const controller = new AbortController()
    let account: string | undefined
    const refresh = () => {
      if (account && sameAccount()) setRows(reportTasks(account))
      else { setRows([]); setActive(undefined) }
    }
    setLoadingFailed(false)
    void assistantAccountKey(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])).then((value) => {
      if (controller.signal.aborted) return
      account = value
      refresh()
    }).catch(async (error: unknown) => {
      if (controller.signal.aborted) return
      setLoadingFailed(true)
      if (recoveryResult(error) !== 'uncertain') return
      account = await cachedReportAccount().catch(() => undefined)
      if (!sameAccount()) return
      refresh()
    })
    window.addEventListener(recoveryChanged, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      controller.abort()
      window.removeEventListener(recoveryChanged, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [sameAccount, retry])
  const weeklyOpen = active?.request.kind === 'weekly'
  useEffect(() => {
    if (!weeklyOpen) return
    const controller = new AbortController()
    void listRegistrationProjects('', 1, controller.signal).then((value) => {
      if (!controller.signal.aborted && sameAccount()) setProjects(value.items)
    }).catch(() => {})
    return () => { controller.abort() }
  }, [weeklyOpen, sameAccount])
  const store = (task: ReportTask) => {
    try { recordReportTask(task) } catch { setStorageFailed(true) }
  }
  const frozen = active?.result === 'sending' || active?.result === 'uncertain'
  const act = (action: Action) => {
    if (!active || write.current || !sameAccount()) return
    if (action === 'cancel') { setActive(undefined); return }
    if (frozen && action !== 'retry') return
    const request = action === 'retry' ? active.request : { ...active.request, action, request_id: randomUUID() }
    const attempt: ReportTask = isDaily(active) && request.kind === 'daily'
      ? { form: active.form, request, time: Date.now(), result: 'sending' }
      : request.kind === 'weekly' && !isDaily(active)
        ? { form: active.form, request, time: Date.now(), result: 'sending' }
        : active
    store(attempt)
    const controller = new AbortController()
    write.current = controller
    setBusy(true)
    void submitRecovery(request, AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])).then(() => {
      if (controller.signal.aborted) return
      store({ ...attempt, result: 'success' })
      setReceipt({ time: attempt.time, request, result: 'success' })
      setActive(undefined)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const result = recoveryResult(error)
      const failed = { ...attempt, result }
      store(failed)
      setActive(failed)
    }).finally(() => { if (!controller.signal.aborted) { write.current = undefined; setBusy(false) } })
  }
  const editDaily = (key: keyof DailyContent, value: string) => {
    if (!active || !isDaily(active)) return
    const edited = { ...active, request: { ...active.request, content: { ...active.request.content, [key]: value } } }
    setActive(edited)
  }
  const editWeekly = (content: WeeklyContent) => {
    if (!active || isDaily(active)) return
    const previousContent = active.request.previousContent ?? active.request.content
    setActive({ ...active, request: { ...active.request, previousContent, content } })
  }
  if (!sameAccount()) return null
  return <>
    {loadingFailed && <p role="status">{t('reportTasks.loadError')}{' '}
      <Button size="sm" onClick={() => { setRetry(value => value + 1) }}>{t('daily.retry')}</Button>
    </p>}
    {storageFailed && <p role="alert">{t('reportTasks.storageError')}</p>}
    {rows.length > 0 && <section className={css.reportTasks} aria-label={t('reportTasks.title')}>
      <h3>{t('reportTasks.title')}</h3>
      {rows.map(row => <article className={css.reportTask} key={row.result === 'success' ? `${row.request.kind}:${row.request.date}:${row.time}` : row.form.id}>
        <div>
          <strong>{t(row.request.kind === 'daily' ? 'reportTasks.daily' : 'reportTasks.weekly')} · {row.request.date}</strong>
          <div>{t(statusKey(row))}</div>
          <time dateTime={new Date(row.time).toISOString()}>{timeText.format(row.time)}</time>
        </div>
        {row.result !== 'success' && <Button size="sm" variant="outline" onClick={() => { setActive(row) }}>{t('reportTasks.open')}</Button>}
      </article>)}
    </section>}
    {receipt && <Toast text={t(statusKey(receipt))} tone="success" onDone={() => { setReceipt(undefined) }} />}
    {active && <RecoveredReport key={active.form.id} task={active} projects={projects} busy={busy} frozen={frozen} t={t}
      onDaily={editDaily} onWeekly={editWeekly} onAction={act} />}
  </>
}

function RecoveredReport({ task, projects, busy, frozen, t, onDaily, onWeekly, onAction }: {
  readonly task: ReportTask
  readonly projects: readonly import('../../../business-forms/model.ts').WeeklyProject[]
  readonly busy: boolean
  readonly frozen: boolean
  readonly t: WorkbenchT
  readonly onDaily: (key: keyof DailyContent, value: string) => void
  readonly onWeekly: (content: WeeklyContent) => void
  readonly onAction: (action: Action) => void
}) {
  const message = task.result === 'success' ? 'reportTasks.invalid' : failureKeys[task.result]
  if (isDaily(task)) return <BusinessForm view={formView(task.form, dailySurface(task.form.id, task.form.content))}
    content={task.request.content} busy={busy} frozen={frozen} allowCloseWhenFrozen error={message}
    ready={canSubmit(task.request.content)} t={t} onChange={onDaily} onAction={onAction} />
  return <WeeklyBusinessForm form={{ ...task.form, projects: projects.length ? projects : task.form.projects }}
    surface={weeklySurface(task.form.id, task.form.content)}
    content={task.request.content} busy={busy} frozen={frozen} allowCloseWhenFrozen
    error={t(message)} t={t} onChange={onWeekly} onAction={onAction} />
}
