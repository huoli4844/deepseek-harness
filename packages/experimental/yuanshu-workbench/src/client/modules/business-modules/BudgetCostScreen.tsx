/** 编排项目选择和两个只读财务面板，不在界面中计算业务金额。 */
import { useEffect, useState } from 'react'
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { RegistrationProjectPicker } from './RegistrationProjectPicker.tsx'
import type { RegistrationProject } from './project-registration-model.ts'
import { loadBudgets, loadCosts } from './budget-api.ts'
import { costSummary, financeAmount } from './budget-viewmodel.ts'
import css from './budget.module.css'

function useFinance<T>(project: string | undefined, revision: number, read: (code: string, signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ code: string; revision: number; value?: T; failed?: boolean }>()
  useEffect(() => {
    if (!project) return
    const controller = new AbortController()
    void read(project, controller.signal).then((value) => {
      if (!controller.signal.aborted) setResult({ code: project, revision, value })
    }, () => {
      if (!controller.signal.aborted) setResult({ code: project, revision, failed: true })
    })
    return () => { controller.abort() }
  }, [project, revision, read])
  return result?.code === project && result?.revision === revision ? result : undefined
}

async function cost(code: string, signal: AbortSignal) {
  const result = await loadCosts(code, signal)
  return { amount: result.amount, ...costSummary(result.costs) }
}

/** 展示所选项目的预算余额和按交易月归集的成本。 */
export function BudgetCostScreen({ t }: { readonly t: WorkbenchT }) {
  const [project, select] = useState<RegistrationProject>()
  const [revision, setRevision] = useState(0)
  const budgets = useFinance(project?.code, revision, loadBudgets)
  const costs = useFinance(project?.code, revision, cost)
  const planned = budgets?.value?.amount, actual = costs?.value?.amount
  const months = costs?.value?.months ?? []
  const peak = months.reduce((max, [, value]) => Math.max(max, Math.abs(Number(value))), 1)
  return <div className={css.screen}>
    <RegistrationProjectPicker compact initialSelection selected={project} onSelect={select} disabled={false} t={t} />
    <section className={css.panel}>
      <h2>{t('budget.stats')}</h2>
      <div className={css.figures}>{([
        ['budget.amount', planned], ['budget.committed', budgets?.value?.committed], ['budget.forecast', budgets?.value?.forecast], ['budget.actual', actual],
        ['budget.balance', planned != null && actual != null ? planned - actual : null],
      ] as const).map(([label, value]) => <div key={label}><span>{t(label)}</span><strong>{financeAmount(value)}</strong></div>)}</div>
      {!project ? <small>{t('budget.select')}</small> : !budgets || !costs ? <small role="status">{t('registration.loading')}</small> : null}
      {budgets?.value?.amount === null && <small>{t('budget.amount')} · {t('budget.empty')}</small>}
      {costs?.value?.amount === null && <small>{t('budget.actual')} · {t('budget.empty')}</small>}
      {(budgets?.failed || costs?.failed) && <div role="alert">
        {budgets?.failed && t('budget.budgetError')} {costs?.failed && t('budget.costError')}
        <Button size="sm" variant="outline" icon={<IconRefreshOutlineRegular />} title={t('registration.retry')} aria-label={t('registration.retry')}
          onClick={() => { setRevision(n => n + 1) }} />
      </div>}
    </section>
    <section className={css.trend}>
      <h2>{t('budget.trend')}</h2>
      {months.length ? <ol>{months.map(([month, value]) => <li key={month}>
        <time>{month}</time><meter aria-hidden="true" min={0} max={peak} value={Math.abs(Number(value))} />
        <strong>{financeAmount(value)}</strong>
      </li>)}</ol> : <small>{t(!project ? 'budget.select' : costs?.failed ? 'budget.costError' : !costs ? 'registration.loading' : 'budget.noMonths')}</small>}
      {costs?.value?.undatedCount ? <small>{t('budget.undated', { count: costs.value.undatedCount, amount: financeAmount(costs.value.undatedAmount) })}</small> : null}
    </section>
  </div>
}
