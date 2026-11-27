/** 编排个人页的身份验证、恢复、注册和切换。 */
import { useEffect, useState } from 'react'
import { Button, IconSettingsOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { assistantAccountKey, createCredentialGuard } from '../business-forms/index.ts'
import type { PersonalPage } from './model.ts'
import { PersonalLabor } from './PersonalLabor.tsx'
import { PersonalPageSettings } from './PersonalPageSettings.tsx'
import { personalPagesChanged, readPersonalPages, savePersonalPageSettings } from './source.ts'
import css from './personal-pages.module.css'

/** 统一呈现当前账号注册的页面，侧栏只保留一个入口。 */
export function PersonalPages({ t }: { readonly t: WorkbenchT }) {
  const [sameAccount] = useState(createCredentialGuard)
  const [account, setAccount] = useState<string>()
  const [error, setError] = useState<'signIn' | 'storageError'>()
  const [pages, setPages] = useState<readonly PersonalPage[]>([])
  const [active, setActive] = useState<string>()
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void assistantAccountKey(controller.signal).then((identity) => {
      if (controller.signal.aborted || !sameAccount()) return
      try {
        setPages(readPersonalPages(identity))
        setAccount(identity)
      } catch { setError('storageError') }
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
        setEditing(false)
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
      try { setPages(readPersonalPages(account)) } catch { setError('storageError') }
    }
    personalPagesChanged.addEventListener('change', refresh)
    return () => { personalPagesChanged.removeEventListener('change', refresh) }
  }, [account, sameAccount])

  if (!sameAccount() || error) return <p role="alert">{t(`personalPages.${error ?? 'signIn'}`)}</p>
  if (!account) return <p role="status">{t('registration.loading')}</p>
  const visible = pages.filter(item => item.hidden !== true)
  const page = visible.find(item => item.id === active) ?? visible[0]
  const userId = Number(account.split(':')[1])
  return <section className={css.screen}>
    <div className={css.toolbar}>
      <nav className={css.pages} aria-label={t('personalPages.pages')}>
        {visible.map(item => <Button key={item.id} size="sm" variant={item.id === page?.id ? 'primary' : 'outline'}
          aria-pressed={item.id === page?.id} onClick={() => { setActive(item.id) }}>{item.name}</Button>)}
      </nav>
      <Button size="sm" variant="outline" icon={<IconSettingsOutlineRegular />} aria-label={t('personalPages.settings')}
        title={t('personalPages.settings')} onClick={() => { setEditing(true) }} />
    </div>
    {page ? <PersonalLabor key={page.id} page={page} userId={userId} t={t} /> : <p>{t(pages.length > 0 ? 'personalPages.allHidden' : 'personalPages.empty')}</p>}
    {editing && <PersonalPageSettings pages={pages} t={t} onClose={() => { setEditing(false) }} onSave={(settings) => {
      if (!sameAccount()) return 'storageError'
      try {
        if (!savePersonalPageSettings(account, settings)) return 'duplicate'
        setEditing(false)
        return undefined
      } catch { return 'storageError' }
    }} />}
  </section>
}
