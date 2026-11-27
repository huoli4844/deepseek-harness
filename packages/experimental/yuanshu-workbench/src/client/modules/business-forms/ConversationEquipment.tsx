/** 挂载会话内预填业务登记弹窗；轮询独立于日报数据的读写状态。 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { DynamicRecordDialog } from './DynamicRecordDialog.tsx'
import { createCredentialGuard, dismissEquipment, pendingEquipment } from './source.ts'

export function ConversationEquipment({ session, t }: { readonly session: string; readonly t: WorkbenchT }) {
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof pendingEquipment>>>()
  const dismissed = useRef<string>()
  useEffect(() => {
    const account = createCredentialGuard()
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      if (!account()) { setDraft(undefined); return }
      const item = await pendingEquipment(session, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]))
        .catch(() => undefined)
      if (controller.signal.aborted) return
      if (item && item.id !== dismissed.current && account()) setDraft(item)
      timer = setTimeout(() => { void poll() }, 2000)
    }
    timer = setTimeout(() => { void poll() }, 1500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [session])
  if (!draft) return null
  const close = () => {
    dismissed.current = draft.id
    setDraft(undefined)
    void dismissEquipment(session, draft.id, AbortSignal.timeout(5000)).catch(() => undefined)
  }
  return <DynamicRecordDialog key={draft.id} draft={draft} session={session} t={t} onClose={close} />
}
