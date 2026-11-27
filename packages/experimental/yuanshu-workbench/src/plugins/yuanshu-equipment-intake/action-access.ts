/** 判定当前会话能否执行指定业务操作。仅使用员工在当前租户的有效权限，不读取菜单目录。 */
import type { EmployeeAccessStore } from '../../employee-access.ts'
import type { BusinessForms } from '../yuanshu-business-forms/index.ts'

/** 区分已授权、未获授权和无法核实。 */
export type ActionAccess = 'permission_granted' | 'permission_denied' | 'permission_unverified'

/** 绑定查询发起时的凭证，防止异步读取期间发生账号或租户切换。 */
export async function checkActionAccess(forms: BusinessForms, lease: ReturnType<BusinessForms['require']>,
  access: Pick<EmployeeAccessStore, 'read'> | undefined, permission: string | undefined): Promise<ActionAccess> {
  if (!access || !permission) return 'permission_unverified'
  try {
    const { authorization, tenant } = lease.credential
    const value = await access.read(authorization, tenant)
    const current = forms.browser(lease.session.id, lease.credential)
    if (value.userId !== current.identity.user || value.tenantId !== String(current.identity.tenant)
      || value.permissions === null) return 'permission_unverified'
    return value.permissions.includes(permission) ? 'permission_granted' : 'permission_denied'
  } catch {
    return 'permission_unverified'
  }
}

/** 为登记流程解释拒绝或查询失败。 */
export function createAccessError(result: Exclude<ActionAccess, 'permission_granted'>): Error {
  return new Error(result === 'permission_denied' ? '当前账号无此新增权限' : '暂时无法核实当前账号的新增权限')
}
