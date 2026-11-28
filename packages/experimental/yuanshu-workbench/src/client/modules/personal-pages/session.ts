/** 个人页账号与页面列表的共享取数 hook：主视图与设置面板共用同一套恢复与监听逻辑。 */
import { useEffect, useState } from 'react'
import { assistantAccountKey, createCredentialGuard } from '../business-forms/index.ts'
import type { PersonalPage } from './model.ts'
import { personalPagesChanged, readPersonalPages } from './source.ts'

export interface PersonalPagesSession {
  readonly sameAccount: () => boolean
  readonly account: string | undefined
  readonly pages: readonly PersonalPage[]
  readonly error: 'signIn' | 'storageError' | undefined
  readonly setPages: (pages: readonly PersonalPage[]) => void
  readonly setError: (error: 'signIn' | 'storageError' | undefined) => void
}

/**
 * 恢复当前账号注册的个人页并跟随外部变更刷新；账号切换时清空并提示重新登录。
 * @returns 账号守卫、账号标识、页面列表与错误状态。
 */
export function usePersonalPagesSession(): PersonalPagesSession {
  const [sameAccount] = useState(createCredentialGuard)
  const [account, setAccount] = useState<string>()
  const [error, setError] = useState<'signIn' | 'storageError'>()
  const [pages, setPages] = useState<readonly PersonalPage[]>([])
  useEffect(() => {
    const controller = new AbortController()
    void assistantAccountKey(controller.signal).then((identity) => {
      if (controller.signal.aborted || !sameAccount()) return
      void readPersonalPages(identity).then((restored) => {
        if (controller.signal.aborted || !sameAccount()) return
        setPages(restored)
        setAccount(identity)
      }).catch(() => {
        if (!controller.signal.aborted) setError('storageError')
      })
    }).catch(() => {
      if (!controller.signal.aborted) setError('signIn')
    })
    return () => { controller.abort() }
  }, [sameAccount])
  useEffect(() => {
    const checkAccount = () => {
      if (!sameAccount()) {
        setAccount(undefined)
        setPages([])
        setError('signIn')
      }
    }
    window.addEventListener('storage', checkAccount)
    return () => { window.removeEventListener('storage', checkAccount) }
  }, [sameAccount])
  useEffect(() => {
    if (!account) return
    const refresh = () => {
      if (!sameAccount()) return
      void readPersonalPages(account).then((restored) => {
        if (sameAccount()) setPages(restored)
      }).catch(() => { setError('storageError') })
    }
    personalPagesChanged.addEventListener('change', refresh)
    return () => { personalPagesChanged.removeEventListener('change', refresh) }
  }, [account, sameAccount])
  return { sameAccount, account, pages, error, setPages, setError }
}
