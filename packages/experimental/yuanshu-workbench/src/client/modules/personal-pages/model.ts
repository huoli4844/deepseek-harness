/** 个人页定义只保存显示配置，不保存业务查询结果。 */

/** 当前可注册的动态页面类型。 */
export interface PersonalPage {
  readonly id: string
  readonly name: string
  readonly kind: 'project-labor'
  /** 为空表示不限定项目，汇总本人全部项目的工时。 */
  readonly projectCode?: string
  readonly period: 'week' | 'month'
  readonly hidden?: boolean
}
