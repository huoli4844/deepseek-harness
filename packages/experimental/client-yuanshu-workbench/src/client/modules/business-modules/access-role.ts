/**
 * 由后台身份角色判定工作台视角，不引入 React 或文案。
 *
 * 角色编码来自元枢 `/api/v1/user/me` 的 `roles`，租户角色目录中明确提供
 * `shaoshi_management`（管理层）；`shaoshi_admin` 的角色说明授予租户内全部业务数据，
 * 因此也按管理层视角处理。身份未接实（演示或缺失）时返回 undefined，不推断角色。
 */
export type AccessRole = 'management' | 'employee'

/** 后台角色目录中代表管理职责的角色编码。 */
const managementRoleCodes: ReadonlySet<string> = new Set(['shaoshi_management', 'shaoshi_admin'])

/** 仅在身份来自真实接口时判定视角，演示角色不参与。 */
export function accessRoleOf(roleCodes: readonly string[], live: boolean): AccessRole | undefined {
  if (!live) return undefined
  return roleCodes.some(code => managementRoleCodes.has(code)) ? 'management' : 'employee'
}
