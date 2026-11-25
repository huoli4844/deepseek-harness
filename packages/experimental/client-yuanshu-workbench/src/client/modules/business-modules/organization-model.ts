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
}

/** 成员分页结果。 */
export interface OrganizationMemberPage {
  readonly list: readonly OrganizationMember[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
}

/** 成员列表查询条件。 */
export interface OrganizationQuery {
  readonly departmentId: number | undefined
  readonly keyword: string
  readonly page: number
  readonly pageSize: number
}
