/** 编排个人页的身份验证、恢复、注册和切换；页面管理统一在工作台设置的「个人页」页签。 */
import { useEffect, useState } from 'react'
import { Button, IconLayersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { renderPersonalWidget } from './personal-widgets.tsx'
import { usePersonalPagesSession } from './session.ts'
import css from './personal-pages.module.css'

/** 统一呈现当前账号注册的页面，侧栏只保留一个入口。 */
export function PersonalPages({ t }: { readonly t: WorkbenchT }) {
  const { sameAccount, account, pages, error } = usePersonalPagesSession()
  const [active, setActive] = useState<string>()
  useEffect(() => {
    // 账号失效后清除当前选中页，避免切换账号后残留旧页 id。
    if (!sameAccount()) setActive(undefined)
  }, [sameAccount])
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
  </section>
}
