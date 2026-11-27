/** 编辑已发布页面的名称、顺序和显示状态。 */
import { useState } from 'react'
import { Button, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { PersonalPage } from './model.ts'
import { movePersonalPage } from './viewmodel.ts'
import css from './personal-pages.module.css'

/** 确认保存后统一应用，关闭弹窗可放弃本次调整。 */
export function PersonalPageSettings({ pages, t, onClose, onSave }: {
  readonly pages: readonly PersonalPage[]
  readonly t: WorkbenchT
  readonly onClose: () => void
  readonly onSave: (pages: readonly PersonalPage[]) => 'duplicate' | 'storageError' | undefined
}) {
  const [draft, setDraft] = useState(pages)
  const [error, setError] = useState<'duplicate' | 'storageError'>()
  const update = (id: string, patch: Partial<Pick<PersonalPage, 'name' | 'hidden'>>) => {
    setError(undefined)
    setDraft(items => items.map(item => item.id === id ? { ...item, ...patch } : item))
  }
  const up = t('personalPages.moveUp'), down = t('personalPages.moveDown')
  return <BusinessFormModal open title={t('personalPages.settings')} closeLabel={t('equipment.cancel')}
    onClose={onClose} maxWidth={EDIT_TEMPLATE.maxWidth} footer={<div className={css.actions}>
      <Button onClick={onClose}>{t('equipment.cancel')}</Button>
      {draft.length > 0 && <Button variant="primary" disabled={draft.some(page => !page.name.trim())} onClick={() => {
        setError(onSave(draft))
      }}>{t('equipment.save')}</Button>}
    </div>}>
    {draft.length === 0 ? <p>{t('personalPages.empty')}</p> : <div className={css.fields}>
      {draft.map((page, index) => <div key={page.id} className={css.settingsRow}>
        <label className={css.settingsName}>{t('personalPages.name')}
          <Input maxLength={10} value={page.name} onChange={(event) => { update(page.id, { name: event.target.value }) }} />
        </label>
        <label className={css.visibility}>
          <input type="checkbox" checked={page.hidden !== true} onChange={(event) => { update(page.id, { hidden: !event.target.checked }) }} />
          {t('personalPages.show')}
        </label>
        <Button size="sm" icon={<IconChevronUpOutlineRegular />} aria-label={up} title={up}
          disabled={index === 0} onClick={() => { setDraft(items => movePersonalPage(items, index, -1)) }} />
        <Button size="sm" icon={<IconChevronDownOutlineRegular />} aria-label={down} title={down}
          disabled={index === draft.length - 1} onClick={() => { setDraft(items => movePersonalPage(items, index, 1)) }} />
      </div>)}
      {error && <p role="alert">{t(`personalPages.${error}`)}</p>}
    </div>}
  </BusinessFormModal>
}
