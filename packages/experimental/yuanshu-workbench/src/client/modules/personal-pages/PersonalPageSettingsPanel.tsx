/** 工作台设置中的个人页面板：编辑页面名称、顺序与显示状态；卸载操作即时生效并需二次确认。 */
import { useState } from 'react'
import { Button, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { PersonalPage } from './model.ts'
import { clearPersonalPages, removePersonalPage, savePersonalPageSettings } from './source.ts'
import { usePersonalPagesSession } from './session.ts'
import { movePersonalPage } from './viewmodel.ts'
import css from './personal-pages.module.css'

/** 面板状态提示：saved 为保存成功，其余沿用既有错误文案键。 */
type PanelNotice = 'saved' | 'duplicate' | 'storageError'

/**
 * 渲染设置弹窗「个人页」页签的内容区；数据由共享 hook 自取，无需调用方传页面列表。
 * @param props - 文案函数。
 * @returns 面板元素；账号未就绪或异常时显示状态提示。
 */
export function PersonalPageSettingsPanel({ t }: { readonly t: WorkbenchT }) {
  const { sameAccount, account, pages } = usePersonalPagesSession()
  // undefined 表示尚未开始编辑：草稿跟随远端列表；一旦编辑则固定为用户视图。
  const [draft, setDraft] = useState<readonly PersonalPage[]>()
  const [armed, setArmed] = useState<string>()
  const [notice, setNotice] = useState<PanelNotice>()
  const shown = draft ?? pages
  const update = (id: string, patch: Partial<Pick<PersonalPage, 'name' | 'hidden'>>) => {
    setNotice(undefined)
    setDraft(items => (items ?? pages).map(item => item.id === id ? { ...item, ...patch } : item))
  }
  const remove = (id: string) => {
    setDraft(items => (items ?? pages).filter(item => item.id !== id))
    setArmed(undefined)
    if (account !== undefined) void removePersonalPage(account, id).catch(() => { setNotice('storageError') })
  }
  const removeAll = () => {
    setDraft([])
    setArmed(undefined)
    if (account !== undefined) void clearPersonalPages(account).catch(() => { setNotice('storageError') })
  }
  const save = () => {
    if (account === undefined) return
    // saved=false 表示名称重复；true 表示已写入，退出编辑态并跟随远端列表。
    void savePersonalPageSettings(account, shown).then((saved) => {
      if (saved) {
        setNotice('saved')
        setDraft(undefined)
      } else setNotice('duplicate')
    }).catch(() => { setNotice('storageError') })
  }
  if (!sameAccount() || account === undefined) {
    return <p className={css.panelNote} role="alert">{t('personalPages.signIn')}</p>
  }
  const up = t('personalPages.moveUp'), down = t('personalPages.moveDown')
  const removeLabel = t('personalPages.remove'), confirmLabel = t('personalPages.confirmRemove')
  return <div className={css.panel}>
    {shown.length === 0 ? <p className={css.panelNote}>{t('personalPages.empty')}</p> : <div className={css.fields}>
      {shown.map((page, index) => <div key={page.id} className={css.settingsRow}>
        <label className={css.settingsName}>{t('personalPages.name')}
          <Input maxLength={10} value={page.name} onChange={(event) => { update(page.id, { name: event.target.value }) }} />
        </label>
        <label className={css.visibility}>
          <input type="checkbox" checked={page.hidden !== true} onChange={(event) => { update(page.id, { hidden: !event.target.checked }) }} />
          {t('personalPages.show')}
        </label>
        <Button size="sm" icon={<IconChevronUpOutlineRegular />} aria-label={up} title={up}
          disabled={index === 0} onClick={() => { setDraft(items => movePersonalPage(items ?? pages, index, -1)) }} />
        <Button size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={down} title={down}
          disabled={index === shown.length - 1} onClick={() => { setDraft(items => movePersonalPage(items ?? pages, index, 1)) }} />
        {armed === page.id
          ? <Button size="sm" onClick={() => { remove(page.id) }}>{confirmLabel}</Button>
          : <Button size="sm" onClick={() => { setArmed(page.id) }}>{removeLabel}</Button>}
      </div>)}
    </div>}
    {notice !== undefined && <p className={css.panelNote} role={notice === 'saved' ? 'status' : 'alert'}>{t(`personalPages.${notice}`)}</p>}
    {shown.length > 0 && <div className={css.actions}>
      {armed === 'all'
        ? <Button onClick={() => { removeAll() }}>{t('personalPages.confirmRemoveAll')}</Button>
        : <Button onClick={() => { setArmed('all') }}>{t('personalPages.removeAll')}</Button>}
      <Button variant="primary" disabled={shown.some(page => !page.name.trim())} onClick={save}>{t('equipment.save')}</Button>
    </div>}
  </div>
}
