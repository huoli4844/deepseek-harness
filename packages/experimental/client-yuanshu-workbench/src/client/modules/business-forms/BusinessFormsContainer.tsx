/** 表单容器管理轮询、草稿与人工确认；业务校验下沉视图模型，I/O 全部交给数据层。 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ComposerBlocks } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { DailyContent, DailyDecision, DailyField } from '../../../business-forms/model.ts'
import { bindAssistantSession, BusinessFormError, createCredentialGuard, decideForm, pendingForm } from './source.ts'
import { canSubmit, formView } from './viewmodel.ts'
import type { DailyFormView } from './model.ts'
import { BusinessForm } from './BusinessForm.tsx'
import { clearPending, pendingAccountKey, readPending, savePending, type PendingRecord } from './pending.ts'
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
  const [notice, setNotice] = useState<'daily.saved' | 'daily.submitted'>()
  const [sameAccount] = useState(createCredentialGuard)
  const write = useRef<AbortController>()
  const uncertain = useRef<DailyDecision>()
  const displayed = useRef<string>()
  const opening = useRef<AbortController>()
  const [newChatState, setNewChatState] = useState<'opening' | 'failed'>()
  const [pending, setPending] = useState<PendingRecord>()
  useEffect(() => () => { write.current?.abort(); opening.current?.abort() }, [])
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
          try { await bindAssistantSession(session, signal); renewed = Date.now() }
          finally { releaseComposer() }
        }
        const value = await pendingForm(session, controller.signal)
        if (controller.signal.aborted) return
        if (value === null && pending === undefined) setPending(await readPending())
        if (value && value.form.id !== displayed.current) {
          const next = formView(value.form, value.surface)
          displayed.current = next.form.id
          setView(next); setContent(next.content); setError(undefined); setNotice(undefined)
        }
        timer = setTimeout(() => { void poll() }, 2000)
      } catch (failure) {
        if (!controller.signal.aborted) {
          const request = failure instanceof BusinessFormError ? failure : undefined
          setLoadError(request?.newSessionRequired === true ? 'daily.unboundHistory'
            : request?.status === 404 ? 'daily.notDeployed' : 'daily.loadError')
        }
      }
    }
    setLoadError(undefined)
    void poll()
    return () => { controller.abort(); clearTimeout(timer); releaseComposer() }
  }, [session, active, retry, sameAccount, blocks, bindingReason, pending])
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
    if (action === 'retry' && prior === undefined) return
    const decision: DailyDecision = prior ?? {
      form_id: view.form.id, request_id: randomUUID(), action: action === 'retry' ? 'save' : action, content,
    }
    const controller = new AbortController()
    write.current = controller
    setBusy(true); setError(undefined)
    void decideForm(session, decision, controller.signal).then(() => {
      if (controller.signal.aborted) return
      uncertain.current = undefined
      setView(undefined); setContent(undefined)
      clearPending()
      if (decision.action !== 'cancel') setNotice(decision.action === 'submit' ? 'daily.submitted' : 'daily.saved')
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return
      const key = errorKey(failure)
      if (key === 'daily.uncertain') {
        uncertain.current = decision
        void pendingAccountKey().then((account) => {
          if (account !== undefined) savePending({ account, work_date: view.form.work_date,
            content: decision.content, evidence_refs: view.form.evidence_refs, request_id: decision.request_id,
            action: decision.action === 'cancel' ? 'save' : decision.action })
          setPending(undefined)
        })
      }
      else uncertain.current = undefined
      setError(key)
    }).finally(() => {
      write.current = undefined
      if (!controller.signal.aborted) setBusy(false)
    })
  }
  return <>
    {active && pending && !view && <div className={css.composerNotice} role="status">
      {t('daily.pendingNotice')}{' '}
      <Button size="sm" variant="outline" onClick={() => { setPending(undefined); setRetry(value => value + 1) }}>
        {t('daily.pendingRetry')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => { clearPending(); setPending(undefined) }}>
        {t('daily.pendingDismiss')}
      </Button>
    </div>}
    {active && loadError && <div className={css.composerNotice} role="alert">
      {t(newChatState === 'failed' ? 'daily.newChatFailed' : loadError)}{' '}
      {loadError === 'daily.unboundHistory'
        ? onNewChat && <Button size="sm" variant="outline" disabled={newChatState === 'opening'} onClick={openNewChat}>
          {t('daily.newChat')}
        </Button>
        : <Button size="sm" variant="outline" onClick={() => { setRetry(value => value + 1) }}>{t('daily.retry')}</Button>}
    </div>}
    {notice && <Toast text={t(notice)} tone="success" onDone={() => { setNotice(undefined) }} />}
    {view && content && <BusinessForm view={view} content={content} busy={busy} frozen={uncertain.current !== undefined}
      error={error} ready={canSubmit(content)} t={t} onChange={change} onAction={decide} />}
  </>
}
