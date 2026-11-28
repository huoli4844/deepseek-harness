/** 对照云端汇总与明细解析所选项目的财务数据，不依赖展示组件。 */
import { requestProject } from './project-registration-api.ts'
import type { ProjectCost } from './budget-model.ts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cents(value: unknown): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Missing amount')
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(String(value))
  if (!match) throw new Error('Invalid amount')
  return BigInt((match[1] ?? '') + (match[2] ?? '') + (match[3] ?? '').padEnd(2, '0'))
}

async function load(code: string, resource: 'budgets' | 'costs', signal: AbortSignal) {
  const data = await requestProject('/' + encodeURIComponent(code) + '/' + resource, signal)
  if (!record(data) || !record(data.summary) || !Array.isArray(data.items)) throw new Error('Invalid finance response')
  return { summary: data.summary, items: data.items as readonly unknown[] }
}

/** 使用预算接口返回的项目汇总，预算版本和分项由服务端处理。 */
export async function loadBudgets(code: string, signal: AbortSignal) {
  const { summary, items } = await load(code, 'budgets', signal)
  return { amount: items.length ? cents(summary.budget_total) : null, committed: items.length ? cents(summary.committed_total) : null,
    forecast: items.length ? cents(summary.forecast_total) : null }
}

/** 统计采用成本接口总额，趋势按各笔成本的交易月归集。 */
export async function loadCosts(code: string, signal: AbortSignal) {
  const { summary, items } = await load(code, 'costs', signal)
  const costs = items.map((item): ProjectCost => {
    if (!record(item)) throw new Error('Invalid cost')
    const date = item.trans_date
    if (date != null && date !== '' && (typeof date !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])-\d{2}/u.test(date))) throw new Error('Invalid cost date')
    return { amount: cents(item.amount), month: typeof date === 'string' && date ? date.slice(0, 7) : null }
  })
  return { amount: costs.length ? cents(summary.total) : null, costs }
}
