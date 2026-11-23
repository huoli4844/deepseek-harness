/**
 * 侧栏左下角的当前用户摘要：头像 + 姓名，紧凑单行显示。
 * 纯展示组件，数据由外层容器注入。
 */
import type { IdentityUserModel } from '../model.ts'
import { Avatar } from './Avatar.tsx'
import type { IdentityT } from './ProfileScreen.tsx'
import css from '../identity.module.css'

/**
 * 渲染当前登录用户摘要（仅头像与姓名，不显示 ID 与角色）。
 * @param props.user - 视图模型中的用户展示数据。
 * @param props.t - 命名空间翻译函数。
 */
export function UserBadge({ user, t }: {
  readonly user: IdentityUserModel
  readonly t: IdentityT
}) {
  const name = user.displayName || t('profile.value.unknown')
  return <div className={css.userBadge} aria-label={name}>
    <Avatar model={user} size={24} />
    <strong className={css.userName}>{name}</strong>
  </div>
}
