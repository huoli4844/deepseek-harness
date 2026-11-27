/** 表单容器管理轮询、草稿与人工确认；业务校验下沉视图模型，I/O 全部交给数据层。 */
/* oxlint-disable @stylistic/max-len */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComposerBlocks } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { DailyContent, DailyDecision, DailyField, WeeklyContent, WeeklyDecision } from '../../../business-forms/model.ts'
import { bindAssistantSession, BusinessFormError, createCredentialGuard, decideForm, decideWeeklyForm, pendingForm, pendingWeeklyForm } from './source.ts'
import { canSubmit, formView } from './viewmodel.ts'
import type { DailyFormView } from './model.ts'
import { BusinessForm } from './BusinessForm.tsx'
import { WeeklyBusinessForm } from './WeeklyBusinessForm.tsx'
import { recordReportTask, type ReportTask } from './recovery-store.ts'
import { recoveryResult } from './recovery-viewmodel.ts'
import css from './business-forms.module.css'

type ErrorKey = 'daily.error' | 'daily.auth' | 'daily.conflict' | 'daily.uncertain'
function errorKey(error: unknown): ErrorKey {
  if (!(error instanceof BusinessFormError) || error.status >= 500) return 'daily.uncertain'
  if (error.status === 401 || error.status === 403) return 'daily.auth'
  return error.status === 409 ? 'daily.conflict' : 'daily.error'
}

/** 在当前聊天内托管日报表单，切换会话时由 key 销毁旧状态。 */
export function BusinessFormsContainer({ session, active, t, blocks, onNewChat }: {
  readonly session: string
  readonly active: boolean
  readonly t: WorkbenchT
  readonly blocks?: ComposerBlocks | undefined
  readonly onNewChat?: (signal: AbortSignal) => Promise<void>
}) {
  const [view, setView] = useState<DailyFormView>()
  const [content, setContent] = useState<DailyContent>()
  const [error, setError] = useState<ErrorKey>()
  const [loadError, setLoadError] = useState<'daily.loadError' | 'daily.notDeployed' | 'daily.unboundHistory'>()
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<'daily.saved' | 'daily.submitted' | 'weekly.saved' | 'weekly.submitted'>()
  const [sameAccount] = useState(createCredentialGuard)
  const write = useRef<AbortController>()
  const uncertain = useRef<DailyDecision>()
  const displayed = useRef<string>()
  const opening = useRef<AbortController>()
  const [newChatState, setNewChatState] = useState<'opening' | 'failed'>()
  const account = useRef<string>()
  const [weekly, setWeekly] = useState<{ form: import('../../../business-forms/model.ts').WeeklyForm; surface: import('../../../business-forms/a2ui.ts').BusinessSurface }>()
  const [weeklyContent, setWeeklyContent] = useState<WeeklyContent>()
  const [weeklyBusy, setWeeklyBusy] = useState(false)
  const [weeklyFrozen, setWeeklyFrozen] = useState(false)
  const [weeklyError, setWeeklyError] = useState<string>()
  const weeklyWrite = useRef<AbortController>()
  const weeklyRetry = useRef<WeeklyDecision>()
  const weeklyFormId = useRef<string>()
  useEffect(() => () => { write.current?.abort(); weeklyWrite.current?.abort(); opening.current?.abort() }, [])
  const [storageFailed, setStorageFailed] = useState(false)
  const store = (task: ReportTask) => {
    try { recordReportTask(task) } catch { setStorageFailed(true) }
  }
  const bindingReason = t('daily.binding')
  useLayoutEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const id = session as Parameters<ComposerBlocks['set']>[0]
    const store = blocks?.storeFor(id)
    const block = { reason: bindingReason }
    if (store?.getSnapshot() === undefined) blocks?.set(id, block)
    const releaseComposer = () => {
      if (store?.getSnapshot() === block) blocks?.set(id, undefined)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let renewed = 0
    const poll = async () => {
      try {
        if (!sameAccount()) { releaseComposer(); setView(undefined); setContent(undefined); setLoadError('daily.loadError'); return }
        if (Date.now() - renewed >= 45_000) {
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])
          try { account.current = await bindAssistantSession(session, signal); renewed = Date.now() }
          finally { releaseComposer() }
        }
        const value = await pendingForm(session, controller.signal)
        if (controller.signal.aborted) return
        if (value && value.form.id !== displayed.current) {
          const next = formView(value.form, value.surface)
          displayed.current = next.form.id
          setView(next); setContent(next.content); setError(undefined); setNotice(undefined)
        }
        const weeklyValue = await pendingWeeklyForm(session, controller.signal)
        controller.signal.throwIfAborted()
        setLoadError(undefined)
        if (weeklyValue && weeklyFormId.current !== weeklyValue.form.id) {
          weeklyFormId.current = weeklyValue.form.id
          setWeekly(weeklyValue)
          setWeeklyContent(weeklyValue.form.content)
          setWeeklyError(undefined)
          setWeeklyFrozen(false)
        }
        timer = setTimeout(() => { void poll() }, 2000)
      } catch (failure) {
        if (!controller.signal.aborted) {
          const request = failure instanceof BusinessFormError ? failure : undefined
          setLoadError(request?.newSessionRequired === true ? 'daily.unboundHistory'
            : request?.status === 404 ? 'daily.notDeployed' : 'daily.loadError')
          if (request === undefined || request.status >= 500) timer = setTimeout(() => { void poll() }, 2000)
        }
      }
    }
    setLoadError(undefined)
    void poll()
    return () => { controller.abort(); clearTimeout(timer); releaseComposer() }
  }, [session, active, retry, sameAccount, blocks, bindingReason])
  const openNewChat = () => {
    if (opening.current !== undefined || onNewChat === undefined) return
    const controller = new AbortController()
    opening.current = controller
    setNewChatState('opening')
    void onNewChat(AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])).then(() => {
      if (!controller.signal.aborted) setNewChatState(undefined)
    }, () => {
      if (!controller.signal.aborted) setNewChatState('failed')
    }).finally(() => { opening.current = undefined })
  }
  const change = (key: DailyField, value: string) => {
    setContent(previous => previous === undefined ? previous : { ...previous, [key]: value })
    setError(undefined)
  }
  const decide = (action: 'save' | 'submit' | 'cancel' | 'retry') => {
    if (!sameAccount()) { setView(undefined); setContent(undefined); setLoadError('daily.loadError'); return }
    if (write.current || !view || !content) return
    const prior = uncertain.current
    if (action === 'cancel' && prior !== undefined) {
      uncertain.current = undefined
      setView(undefined)
      setContent(undefined)
      return
    }
    if (action === 'retry' && prior === undefined) return
    const decision: DailyDecision = prior ?? {
      form_id: view.form.id, request_id: randomUUID(), action: action === 'retry' ? 'save' : action, content,
    }
    const controller = new AbortController()
    write.current = controller
    const task: ReportTask | undefined = decision.action !== 'cancel' && account.current
      ? { form: view.form, request: { kind: 'daily', account: account.current, date: view.form.work_date,
        action: decision.action, request_id: decision.request_id, content: decision.content,
        evidence: view.form.evidence_refs, version: view.form.expected_version }, time: Date.now(), result: 'sending' } : undefined
    if (task) store(task)
    setBusy(true); setError(undefined)
    void decideForm(session, decision, controller.signal).then(() => {
      if (controller.signal.aborted) return
      uncertain.current = undefined
      setView(undefined); setContent(undefined)
      if (task) store({ ...task, result: 'success' })
      if (decision.action !== 'cancel') setNotice(decision.action === 'submit' ? 'daily.submitted' : 'daily.saved')
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      const key = errorKey(failure)
      if (task) store({ ...task, result: recoveryResult(failure) })
      uncertain.current = key === 'daily.uncertain' ? decision : undefined
      setError(key)
    }).finally(() => {
      write.current = undefined
      if (!controller.signal.aborted) setBusy(false)
    })
  }
  const decideWeekly = (action: 'save' | 'submit' | 'cancel' | 'retry') => {
    if (!sameAccount() || weeklyWrite.current || !weekly || !weeklyContent) return
    if (action === 'cancel' && weeklyFrozen) {
      weeklyRetry.current = undefined
      setWeekly(undefined)
      setWeeklyContent(undefined)
      setWeeklyFrozen(false)
      return
    }
    const decision: WeeklyDecision | undefined = action === 'retry' ? weeklyRetry.current
      : { form_id: weekly.form.id, request_id: randomUUID(), action, content: weeklyContent }
    if (decision === undefined) return
    const controller = new AbortController()
    weeklyWrite.current = controller
    const task: ReportTask | undefined = decision.action !== 'cancel' && account.current
      ? { form: weekly.form, request: { kind: 'weekly', account: account.current, date: weekly.form.period_start,
        action: decision.action, request_id: decision.request_id, content: decision.content,
        baseRevision: weekly.form.base_revision ?? null }, time: Date.now(), result: 'sending' } : undefined
    if (task) store(task)
    setWeeklyBusy(true)
    setWeeklyError(undefined)
    void decideWeeklyForm(session, decision, controller.signal).then(() => {
      if (controller.signal.aborted) return
      weeklyRetry.current = undefined
      weeklyFormId.current = undefined
      setWeekly(undefined)
      setWeeklyContent(undefined)
      setWeeklyFrozen(false)
      if (task) store({ ...task, result: 'success' })
      if (decision.action !== 'cancel') setNotice(decision.action === 'submit' ? 'weekly.submitted' : 'weekly.saved')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      if (task) store({ ...task, result: recoveryResult(error) })
      const key = errorKey(error)
      const uncertain = key === 'daily.uncertain'
      weeklyRetry.current = uncertain ? decision : undefined
      setWeeklyFrozen(uncertain)
      setWeeklyError(t(uncertain ? 'weekly.form.uncertain' : key))
    }).finally(() => {
      weeklyWrite.current = undefined
      if (!controller.signal.aborted) setWeeklyBusy(false)
    })
  }
  return <>
    {active && loadError && <div className={css.composerNotice} role="alert">
      {t(newChatState === 'failed' ? 'daily.newChatFailed' : loadError)}{' '}
      {loadError === 'daily.unboundHistory'
        ? onNewChat && <Button size="sm" variant="outline" disabled={newChatState === 'opening'} onClick={openNewChat}>
          {t('daily.newChat')}
        </Button>
        : <Button size="sm" variant="outline" onClick={() => { setRetry(value => value + 1) }}>{t('daily.retry')}</Button>}
    </div>}
    {storageFailed && <p role="alert">{t('reportTasks.storageError')}</p>}
    {notice && <Toast text={t(notice)} tone="success" onDone={() => { setNotice(undefined) }} />}
    {view && content && <BusinessForm view={view} content={content} busy={busy} frozen={uncertain.current !== undefined} allowCloseWhenFrozen={account.current !== undefined && !storageFailed}
      error={error} ready={canSubmit(content)} t={t} onChange={change} onAction={decide} />}
    {weekly && weeklyContent && <WeeklyBusinessForm form={weekly.form} surface={weekly.surface} content={weeklyContent} busy={weeklyBusy} frozen={weeklyFrozen} allowCloseWhenFrozen={account.current !== undefined && !storageFailed}
      error={weeklyError ?? ''} t={t} onChange={setWeeklyContent} onAction={decideWeekly} />}
  </>
}
