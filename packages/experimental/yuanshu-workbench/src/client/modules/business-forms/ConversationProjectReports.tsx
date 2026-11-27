/** 编排逐项目人工确认与 Excel 下载，不直接访问后台。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ProjectReportContent } from '../../../business-forms/project-report.ts'
import { ProjectReportEditor } from './ProjectReportEditor.tsx'
import { downloadProjectReports } from './project-report-export.ts'
import { BusinessFormError, createCredentialGuard, decideProjectReport, pendingProjectReport } from './source.ts'

type Pending = NonNullable<Awaited<ReturnType<typeof pendingProjectReport>>>

/** 当前会话只展示一份项目周报，收到成功回执后等待两秒。 */
export function ConversationProjectReports({ session, t }: { readonly session: string; readonly t: WorkbenchT }) {
  const [item, setItem] = useState<Pending>()
  const [sameAccount] = useState(createCredentialGuard)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    async function poll() {
      if (!sameAccount()) { setItem(undefined); return }
      const result = await pendingProjectReport(session, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]))
        .then(data => ({ data }), () => undefined)
      if (controller.signal.aborted || !sameAccount()) return
      const data = result?.data
      if (data) setItem((current) => {
        if (current?.draft.id === data.draft.id && current.draft.state === data.draft.state) return current
        return data
      })
      timer = setTimeout(() => { void poll() }, 1000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [session, sameAccount])
  return item && sameAccount() ? <ProjectReportStep key={item.draft.id} item={item} session={session} t={t} sameAccount={sameAccount}
    onAdvance={() => { setItem(current => current?.draft.id === item.draft.id ? undefined : current) }} /> : null
}

function ProjectReportStep({ item, session, t, sameAccount, onAdvance }: {
  readonly item: Pending
  readonly session: string
  readonly t: WorkbenchT
  readonly sameAccount: () => boolean
  readonly onAdvance: () => void
}) {
  const { draft, rows } = item
  const [content, setContent] = useState<ProjectReportContent>(draft.content)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string>()
  const inFlight = useRef(false)
  const downloaded = useRef(false)
  const success = draft.state === 'submitted' || submitted

  useEffect(() => {
    if (!success) return
    const controller = new AbortController()
    const stopped = () => controller.signal.aborted || !sameAccount()
    async function advance() {
      if (stopped()) return
      try {
        await decideProjectReport(session, draft, 'advance', AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]))
        if (!stopped()) onAdvance()
      } catch {
        if (!stopped()) timer = setTimeout(() => { void advance() }, 2000)
      }
    }
    let timer = setTimeout(() => { void advance() }, 2000)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [success, draft.id, session, sameAccount, onAdvance, draft])

  async function act(submit: boolean) {
    if (inFlight.current || success || !sameAccount()) return
    inFlight.current = true
    setBusy(true)
    setError(undefined)
    try {
      if (submit && rows && !downloaded.current) {
        await downloadProjectReports(rows, t)
        downloaded.current = true
      }
      if (!sameAccount()) return
      const action = submit && !draft.exportOnly ? 'submit' : 'advance'
      await decideProjectReport(session, { ...draft, content }, action, AbortSignal.timeout(32_000))
      if (!sameAccount()) return
      if (action === 'submit') setSubmitted(true)
      else onAdvance()
    } catch (failure) {
      if (sameAccount()) {
        const status = failure instanceof BusinessFormError ? failure.status : undefined
        const message = failure instanceof BusinessFormError ? failure.validationMessage : undefined
        setError(message ?? t(status === 409 ? 'projectReport.conflict' : 'projectReport.error'))
      }
    } finally { inFlight.current = false; setBusy(false) }
  }
  return <ProjectReportEditor draft={success ? { ...draft, state: 'submitted' } : draft} content={content} t={t} busy={busy}
    error={error ?? (draft.state === 'uncertain' ? t('recordForm.uncertain') : undefined)}
    onCancel={() => { void act(false) }} onSubmit={() => { void act(true) }}
    onChange={(key, value) => { setContent(previous => ({ ...previous, [key]: value })) }} />
}
