/** 定义周报概览使用的条目汇总类型，不依赖界面与请求。 */

/** 周报侧栏使用的条目汇总。 */
export interface WeeklyItemsSummary {
  readonly total: number
  readonly completed: number
  readonly inProgress: number
  readonly risks: number
  readonly byProject: readonly { readonly name: string; readonly count: number }[]
}
