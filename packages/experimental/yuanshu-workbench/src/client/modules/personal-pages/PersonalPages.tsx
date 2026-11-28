/** 编排个人页的身份验证、恢复、注册和切换。 */
import { useEffect, useState } from 'react'
import { Button, IconLayersOutlineRegular, IconSettingsOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { assistantAccountKey, createCredentialGuard } from '../business-forms/index.ts'
import type { PersonalPage } from './model.ts'
import { renderPersonalWidget } from './personal-widgets.tsx'
import { PersonalPageSettings } from './PersonalPageSettings.tsx'
import { personalPagesChanged, clearPersonalPages, readPersonalPages, removePersonalPage, savePersonalPageSettings } from './source.ts'
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
      void readPersonalPages(account).then((restored) => {
        if (sameAccount()) setPages(restored)
      }).catch(() => { setError('storageError') })
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
    {page ? <>
      {page.widgets.map(widget => <section key={widget.id}>{renderPersonalWidget(widget, userId, t)}</section>)}
    </> : pages.length > 0 ? <p>{t('personalPages.allHidden')}</p> : <div className={css.emptyCard}>
      <div className={css.emptyIcon} aria-hidden="true"><IconLayersOutlineRegular size={22} /></div>
      <h2 className={css.emptyTitle}>{t('personalPages.emptyTitle')}</h2>
      <p className={css.emptyDesc}>{t('personalPages.emptyDesc')}</p>
      <ol className={css.emptySteps}>
        <li>{t('personalPages.emptyStep1')}</li>
        <li>{t('personalPages.emptyStep2')}</li>
        <li>{t('personalPages.emptyStep3')}</li>
      </ol>
    </div>}
    {editing && <PersonalPageSettings pages={pages} t={t} onClose={() => { setEditing(false) }} onSave={(settings) => {
      if (!sameAccount()) return Promise.resolve('storageError')
      return savePersonalPageSettings(account, settings).then((saved) => {
        if (!saved) return 'duplicate'
        setEditing(false)
        return undefined
      }).catch(() => 'storageError')
    }} onRemove={(id) => {
      if (!sameAccount()) return
      setActive(undefined)
      void removePersonalPage(account, id).catch(() => { setError('storageError') })
    }} onRemoveAll={() => {
      if (!sameAccount()) return
      setActive(undefined)
      void clearPersonalPages(account).catch(() => { setError('storageError') })
    }} />}
  </section>
}
