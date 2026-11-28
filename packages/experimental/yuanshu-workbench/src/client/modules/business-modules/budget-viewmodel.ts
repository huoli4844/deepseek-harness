/** 汇总项目预算与成本，保持版本独立、交易月份和缺失日期，不依赖界面或网络。 */
import type { ProjectCost } from './budget-model.ts'

/** 趋势只使用有交易日期的成本，无日期记录单独汇总。 */
export function costSummary(costs: readonly ProjectCost[]) {
  const months = new Map<string, bigint>()
  let undatedAmount = 0n, undatedCount = 0
  for (const row of costs) {
    if (row.month) months.set(row.month, (months.get(row.month) ?? 0n) + row.amount)
    else { undatedCount++; undatedAmount += row.amount }
  }
  return { undatedCount, undatedAmount,
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)) }
}

/** 以两位小数显示金额，空数据沿用工作台占位。 */
export function financeAmount(value: bigint | null | undefined): string {
  if (value == null) return '— — —'
  const abs = value < 0n ? -value : value
  return (value < 0n ? '-' : '') + (abs / 100n).toLocaleString('zh-CN') + '.' + String(abs % 100n).padStart(2, '0')
}
