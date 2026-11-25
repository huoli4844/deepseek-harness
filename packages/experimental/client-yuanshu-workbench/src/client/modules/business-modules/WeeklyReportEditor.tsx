/** 管理指定项目自然周的周报请求生命周期。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { loadWeekly, saveWeekly, submitWeekly } from './project-registration-api.ts'
import type { RegistrationProject, WeeklyDraft, WeeklySnapshot } from './project-registration-model.ts'
import type { AccessRole } from './access-role.ts'
import { blankWeekly, registrationWriteError, weeklyFields } from './project-registration-viewmodel.ts'
import { WeeklyReportForm, WeeklyWorkSummary } from './WeeklyReportForm.tsx'
import type { WeeklyReportActions } from './WeeklyOverview.tsx'
import css from './project-registration.module.css'

/** 结合当前周的查询和写入状态渲染登记，并把保存与提交动作上报给右栏。 */
export function WeeklyReportEditor({ project, start, role, t, onBusy, onLabor, onProject, onSnapshot, onDraft, onActions }: {
  readonly project: RegistrationProject | undefined
  readonly start: string
  readonly role?: AccessRole | undefined
  readonly t: WorkbenchT
  readonly onBusy: (busy: boolean) => void
  readonly onLabor: () => void
  readonly onProject: (project: RegistrationProject | undefined) => void
  readonly onSnapshot?: (snapshot: WeeklySnapshot | undefined) => void
  readonly onDraft?: (draft: WeeklyDraft) => void
  readonly onActions?: (actions: WeeklyReportActions | undefined) => void
}) {
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>()
  const [draft, setDraft] = useState<WeeklyDraft>(blankWeekly)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [notice, setNotice] = useState<{ readonly error: boolean; readonly key: Parameters<WorkbenchT>[0] }>()
  const write = useRef<AbortController>()
  // 用 ref 读取最新草稿，避免每次输入都重建保存回调并触发动作上报。
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => () => { write.current?.abort() }, [])
  useEffect(() => {
    setLoadFailed(false)
    onSnapshot?.(undefined)
    setSnapshot(undefined)
    // 未选项目时四张卡片仍然渲染，只把内容切回空白并禁用编辑。
    if (project === undefined) {
      setDraft(blankWeekly)
      onDraft?.(blankWeekly)
      return
    }
    const controller = new AbortController()
    void loadWeekly(project.code, start, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setSnapshot(value)
      onSnapshot?.(value)
      setDraft(value.report ?? blankWeekly)
      onDraft?.(value.report ?? blankWeekly)
    }).catch(() => { if (!controller.signal.aborted) setLoadFailed(true) })
    return () => { controller.abort() }
  }, [project, start, retry, onSnapshot, onDraft])
  const persist = useCallback((submit: boolean) => {
    if (write.current || project === undefined) return
    const request = new AbortController()
    write.current = request
    setBusy(true)
    onBusy(true)
    setNotice(undefined)
    const operation = submit
      ? submitWeekly(project.code, start, request.signal)
      : saveWeekly(project.code, start, draftRef.current, request.signal)
    void operation.then((value) => {
      if (request.signal.aborted) return
      setSnapshot(value)
      onSnapshot?.(value)
      setDraft(value.report ?? blankWeekly)
      onDraft?.(value.report ?? blankWeekly)
      setNotice({ error: false, key: submit ? 'registration.submitted' : 'registration.saved' })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setNotice({ error: true, key: registrationWriteError(error) })
    }).finally(() => {
      if (request.signal.aborted) return
      write.current = undefined
      setBusy(false)
      onBusy(false)
    })
  }, [project, start, onBusy, onSnapshot, onDraft])
  const report = snapshot?.report
  const dirty = weeklyFields.some(key => draft[key] !== (report ?? blankWeekly)[key])
  const actions = useMemo<WeeklyReportActions | undefined>(() => snapshot === undefined ? undefined : {
    save: () => { persist(false) },
    submit: () => { persist(true) },
    busy,
    canSubmit: report?.status === 'draft' && !dirty,
  }, [snapshot, busy, dirty, persist, report?.status])
  useEffect(() => { onActions?.(actions) }, [actions, onActions])
  useEffect(() => () => { onActions?.(undefined) }, [onActions])
  const changeFields = (fields: Partial<WeeklyDraft>) => {
    setDraft(previous => ({ ...previous, ...fields }))
    onDraft?.({ ...draft, ...fields })
  }
  const changeField = (field: keyof WeeklyDraft, value: string) => { changeFields({ [field]: value }) }
  return <div className={css.column}>
    {project !== undefined && snapshot === undefined && (loadFailed
      ? <div className={css.inline} role="alert">{t('registration.loadError')}
        <Button size="sm" variant="outline" onClick={() => { setRetry(value => value + 1) }}>{t('registration.retry')}</Button>
      </div>
      : <p role="status">{t('registration.loading')}</p>)}
    <WeeklyReportForm project={project} report={report} draft={draft} busy={busy || (project !== undefined && snapshot === undefined)}
      t={t} onField={changeField} onFields={changeFields} onProject={onProject} />
    {notice && <div role={notice.error ? 'alert' : 'status'}>{t(notice.key)}</div>}
    {snapshot !== undefined && <WeeklyWorkSummary snapshot={snapshot} onLabor={onLabor} disabled={busy} showEmployees={role !== 'employee'} t={t} />}
  </div>
}
