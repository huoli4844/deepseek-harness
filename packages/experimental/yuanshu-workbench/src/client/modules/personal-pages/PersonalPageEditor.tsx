/** 创建个人页：只需填写不超过 10 个字符的页面名称，预览确认后发布。复用工作台固定编辑弹窗。 */
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import { BusinessFormModal } from '../../shared/BusinessFormModal.tsx'
import type { PersonalPage } from './model.ts'
import { PersonalLabor } from './PersonalLabor.tsx'
import css from './personal-pages.module.css'

/** 页面名称上限，超出部分直接不可输入。 */
const nameMaxLength = 10

/** 发布前显示员工亲自确认的切换按钮名称和实时预览。 */
export function PersonalPageEditor({ t, userId, initialName, onClose, onPublish }: {
  readonly t: WorkbenchT
  readonly userId: number
  readonly initialName: string
  readonly onClose: () => void
  readonly onPublish: (page: PersonalPage) => 'duplicate' | 'storageError' | undefined
}) {
  const [name, setName] = useState(initialName)
  const [preview, setPreview] = useState<PersonalPage>()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<'duplicate' | 'storageError'>()
  return <BusinessFormModal open title={t('personalPages.add')} closeLabel={t('equipment.cancel')}
    onClose={onClose} maxWidth={EDIT_TEMPLATE.maxWidth} footer={<div className={css.actions}>
      <Button onClick={onClose}>{t('equipment.cancel')}</Button>
      {preview ? <>
        <Button onClick={() => { setPreview(undefined); setReady(false); setError(undefined) }}>{t('personalPages.back')}</Button>
        <Button variant="primary" disabled={!ready} onClick={() => {
          setError(onPublish(preview))
        }}>{t('personalPages.publish')}</Button>
      </> : <Button variant="primary" disabled={!name.trim()} onClick={() => {
        // 不选择项目与日期：页面默认汇总本人全部项目的本月工时
        setPreview({ id: randomUUID(), name: name.trim(), kind: 'project-labor', period: 'month' })
      }}>{t('personalPages.preview')}</Button>}
    </div>}>
    {error && <p role="alert">{t(`personalPages.${error}`)}</p>}
    {preview ? <>
      <p>{t('personalPages.confirmName')} <strong>{preview.name}</strong></p>
      <PersonalLabor page={preview} userId={userId} t={t} onReady={setReady} />
    </> : <div className={css.fields}>
      <label>{t('personalPages.name')}<Input autoFocus maxLength={nameMaxLength} value={name}
        onChange={(event) => { setName(event.target.value) }} /></label>
    </div>}
  </BusinessFormModal>
}
