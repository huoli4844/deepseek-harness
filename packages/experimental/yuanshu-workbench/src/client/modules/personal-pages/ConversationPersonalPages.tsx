/** 在发起创建的对话中挂载预览和人工确认流程。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { createCredentialGuard, dismissPersonalPage, pendingPersonalPage } from '../business-forms/source.ts'
import { PersonalPageEditor } from './PersonalPageEditor.tsx'
import { savePersonalPage } from './source.ts'

/** 接收当前会话的待办，由本人发布到本机个人页。 */
export function ConversationPersonalPages({ session, t }: { readonly session: string; readonly t: WorkbenchT }) {
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof pendingPersonalPage>>>()
  const [sameAccount] = useState(createCredentialGuard)
  const dismissed = useRef<string>()
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (!sameAccount()) { setDraft(undefined); return }
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
      const request = await pendingPersonalPage(session, signal).catch(() => undefined)
      if (controller.signal.aborted) return
      if (sameAccount()) setDraft(request?.id === dismissed.current ? undefined : request)
      timer = setTimeout(() => { void poll() }, 2000)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [session, sameAccount])

  if (!draft || !sameAccount()) return null
  const close = () => {
    dismissed.current = draft.id
    setDraft(undefined)
    void dismissPersonalPage(session, draft.id, AbortSignal.timeout(5000)).catch(() => undefined)
  }
  return <PersonalPageEditor key={draft.id} t={t} userId={Number(draft.account.split(':')[1])}
    initialName={draft.name}
    {...('widgets' in draft && Array.isArray(draft.widgets) && draft.widgets.length > 0
      ? { initialWidgets: draft.widgets, autoPreview: true } : {})}
    onClose={close} onPublish={(page) => {
      if (!sameAccount()) return Promise.resolve('storageError')
      return savePersonalPage(draft.account, { ...page, id: draft.id }).then((published) => {
        if (!published) return 'duplicate'
        close()
        return undefined
      }).catch(() => 'storageError')
    }} />
}
