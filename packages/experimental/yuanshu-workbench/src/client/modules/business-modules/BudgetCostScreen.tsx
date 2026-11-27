/** 预算与成本模块页面，当前只展示该模块的接入状态。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import { BusinessModuleScreen } from './BusinessModuleScreen.tsx'

/** 渲染预算与成本模块。 */
export function BudgetCostScreen({ t }: { readonly t: WorkbenchT }) {
  return <BusinessModuleScreen titleKey="position.module.budget" t={t} />
}
