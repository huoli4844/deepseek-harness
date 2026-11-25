/** 组织架构与成员列表的界面模型，只保留渲染所需字段。 */

/** 部门树节点。 */
export interface DepartmentNode {
  readonly id: number
  readonly name: string
  readonly parentId: number
  readonly leader: string
  readonly status: number
  /** 本部门及其全部子部门的成员总数。 */
  readonly totalMembers: number
  readonly children: readonly DepartmentNode[]
}

/** 组织成员条目。 */
export interface OrganizationMember {
  readonly id: number
  readonly username: string
  readonly nickname: string
  readonly email: string
  readonly phone: string
  readonly departmentId: number
  readonly status: number
  readonly roles: readonly string[]
  readonly roleIds: readonly number[]
}

/** 元枢角色条目，仅保留编辑弹窗展示所需字段。 */
export interface OrganizationRole {
  readonly id: number
  readonly name: string
  readonly code: string
}

/** 成员分页结果。 */
export interface OrganizationMemberPage {
  readonly list: readonly OrganizationMember[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

/** 组织架构树快照：部门树 + 未分配部门成员数量。 */
export interface OrganizationTree {
  readonly departments: readonly DepartmentNode[]
  /** 部门 ID 为空或 0 的成员数量。 */
  readonly unassignedCount: number
}

/**
 * 成员编辑草稿，覆盖元枢允许修改的全部字段。
 * 邮箱为元枢必填项；手机号留空表示保持原值不变（元枢不支持清空手机号）。
 */
export interface MemberDraft {
  readonly nickname: string
  readonly email: string
  readonly phone: string
  /** 1 表示启用、0 表示停用。 */
  readonly status: number
  /** 授予的角色 ID 集合；与成员当前角色集合比较后按需提交。 */
  readonly roleIds: readonly number[]
}

/** 成员列表查询条件；departmentId 为 0 表示只查询未分配部门的成员。 */
export interface OrganizationQuery {
  readonly departmentId: number | undefined
  readonly keyword: string
  readonly page: number
  readonly pageSize: number
}
