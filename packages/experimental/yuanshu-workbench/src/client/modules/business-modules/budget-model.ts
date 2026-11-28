/** 项目成本只读模型，不依赖接口或视图。 */

/** 项目成本的入账金额和所属月份，缺失交易日期时保留空值。 */
export interface ProjectCost {
  readonly amount: bigint
  readonly month: string | null
}
