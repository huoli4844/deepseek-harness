/**
 * 展示组织成员编辑与删除确认弹窗。
 * 编辑弹窗覆盖元枢允许修改的全部字段：姓名、邮箱、手机号、启用状态与角色。
 * 组件只展示受控字段并调用回调，不访问网络或管理异步状态。
 */
import { useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { MemberDraft, OrganizationMember, OrganizationRole } from './organization-model.ts'
import type { OrganizationRequestError } from './use-organization.ts'
import businessCss from './business-modules.module.css'
import css from './organization.module.css'

/** 邮箱格式与元枢校验保持一致的基础模式。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/** 渲染成员启用状态切换按钮组。 */
function StatusToggle({ value, pending, t, onChange }: {
  readonly value: number
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onChange: (status: number) => void
}) {
  return <div className={css.memberToggleRow}>
    <Button size="sm" variant={value === 1 ? 'primary' : 'outline'} disabled={pending}
      onClick={() => { onChange(1) }}>{t('organization.active')}</Button>
    <Button size="sm" variant={value === 0 ? 'primary' : 'outline'} disabled={pending}
      onClick={() => { onChange(0) }}>{t('organization.inactive')}</Button>
  </div>
}

/** 渲染组织成员编辑弹窗；草稿为本地受控状态，弹窗以成员 ID 重挂载重置。 */
export function OrganizationMemberDialog({ member, departmentName, roles, rolesError, pending, error, t, onRetryRoles, onSave, onClose }: {
  readonly member: OrganizationMember
  readonly departmentName: string
  readonly roles: readonly OrganizationRole[] | undefined
  readonly rolesError: OrganizationRequestError | undefined
  readonly pending: boolean
  readonly error: OrganizationRequestError | undefined
  readonly t: WorkbenchT
  readonly onRetryRoles: () => void
  readonly onSave: (draft: MemberDraft) => void
  readonly onClose: () => void
}) {
  const [draft, setDraft] = useState<MemberDraft>(() => ({
    nickname: member.nickname,
    email: member.email,
    phone: member.phone,
    status: member.status,
    roleIds: [...member.roleIds],
  }))
  const emailValid = EMAIL_PATTERN.test(draft.email.trim())
  const canSave = draft.nickname.trim() !== '' && emailValid && roles !== undefined
  const toggleRole = (id: number): void => {
    setDraft(previous => previous.roleIds.includes(id)
      ? { ...previous, roleIds: previous.roleIds.filter(item => item !== id) }
      : { ...previous, roleIds: [...previous.roleIds, id] })
  }
  return <Modal open title={t('organization.editTitle')} closeLabel={t('organization.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending || !canSave} onClick={() => { onSave(draft) }}>
        {t('organization.save')}
      </Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('organization.cancel')}</Button>
    </div>}>
    <div className={css.memberForm}>
      <p className={css.memberFormHint}>{t('organization.username')}：{member.username}</p>
      <label>{t('organization.memberName')}<Input value={draft.nickname} disabled={pending} maxLength={100}
        onChange={(event) => { setDraft({ ...draft, nickname: event.currentTarget.value }) }} /></label>
      <label>{t('organization.email')}
        <Input value={draft.email} disabled={pending} maxLength={200}
          onChange={(event) => { setDraft({ ...draft, email: event.currentTarget.value }) }} />
        {!emailValid && <span className={css.memberFormTip}>{t('organization.emailInvalid')}</span>}
      </label>
      <label>{t('organization.phone')}
        <Input value={draft.phone} disabled={pending} maxLength={50}
          onChange={(event) => { setDraft({ ...draft, phone: event.currentTarget.value }) }} />
        <span className={css.memberFormTip}>{t('organization.phoneHint')}</span>
      </label>
      <div className={css.memberFormWide}>
        <span className={css.memberFormTip}>{t('organization.status')}</span>
        <StatusToggle value={draft.status} pending={pending} t={t}
          onChange={(status) => { setDraft({ ...draft, status }) }} />
      </div>
      <label>{t('organization.role')}
        {rolesError !== undefined
          ? <span className={css.memberFormTip}>
            {t('organization.rolesError')}
            <button type="button" className={css.linkButton} disabled={pending}
              onClick={onRetryRoles}>{t('organization.retry')}</button>
          </span>
          : roles === undefined
            ? <span className={css.memberFormTip}>{t('organization.rolesLoading')}</span>
            : <div className={css.memberRoles} role="group" aria-label={t('organization.role')}>
              {roles.length === 0 && <span className={css.memberFormTip}>{t('organization.empty')}</span>}
              {roles.map(role => <label key={role.id} className={css.memberRoleItem}>
                <input type="checkbox" disabled={pending} checked={draft.roleIds.includes(role.id)}
                  onChange={() => { toggleRole(role.id) }} />
                <span>{role.name}</span>
              </label>)}
            </div>}
      </label>
      <label>{t('organization.department')}
        <span className={css.memberFormTip}>{departmentName}</span>
        <span className={css.memberFormTip}>{t('organization.departmentReadonly')}</span>
      </label>
      {error !== undefined && <p className={`${businessCss.businessModuleFormError} ${css.memberFormWide}`} role="alert">{t(writeErrorKey(error))}</p>}
    </div>
  </Modal>
}

/** 渲染组织成员删除确认弹窗。 */
export function OrganizationMemberDeleteDialog({ member, pending, error, t, onDelete, onClose }: {
  readonly member: OrganizationMember
  readonly pending: boolean
  readonly error: OrganizationRequestError | undefined
  readonly t: WorkbenchT
  readonly onDelete: () => void
  readonly onClose: () => void
}) {
  return <Modal open title={t('organization.deleteTitle')} closeLabel={t('organization.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onDelete}>{t('organization.delete')}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('organization.cancel')}</Button>
    </div>}>
    <p>{t('organization.confirmDelete')}</p>
    <p>{member.nickname || member.username}</p>
    {error !== undefined && <p className={businessCss.businessModuleFormError} role="alert">{t(writeErrorKey(error))}</p>}
  </Modal>
}

/** 写失败原因映射为文案键。 */
function writeErrorKey(error: OrganizationRequestError): 'organization.writeUnauthorized' | 'organization.writeLoginRequired' | 'organization.writeError' {
  if (error === 'denied') return 'organization.writeUnauthorized'
  if (error === 'login') return 'organization.writeLoginRequired'
  return 'organization.writeError'
}
