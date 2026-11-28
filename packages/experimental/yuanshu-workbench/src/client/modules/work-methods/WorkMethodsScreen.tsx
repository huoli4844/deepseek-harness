/** 工作方法页：集中展示各岗位业务链路静态流程，顶部按钮切换链路。 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import {
  ADMIN_TEMPLATE, DEV_TEMPLATE, FINANCE_TEMPLATE, HR_TEMPLATE, MATERIALS_TEMPLATE,
  PROCUREMENT_TEMPLATE, QUALITY_TEMPLATE, SUPPLIER_TEMPLATE,
} from '../procurement-chain/procurement-chain-model.ts'
import type { FlowTemplate } from '../procurement-chain/procurement-chain-model.ts'
import { FlowChainView } from '../procurement-chain/ProcurementChain.tsx'
import css from './work-methods.module.css'

/** 链路视图文案键与模板：键顺序即按钮顺序，satisfies 保证键面与模板合法。 */
const CHAIN_VIEWS = {
  procurement: { label: 'procurementChain.title', template: PROCUREMENT_TEMPLATE },
  quality: { label: 'qualityChain.title', template: QUALITY_TEMPLATE },
  admin: { label: 'adminChain.title', template: ADMIN_TEMPLATE },
  materials: { label: 'materialsChain.title', template: MATERIALS_TEMPLATE },
  finance: { label: 'financeChain.title', template: FINANCE_TEMPLATE },
  dev: { label: 'devChain.title', template: DEV_TEMPLATE },
  supplier: { label: 'supplierChain.title', template: SUPPLIER_TEMPLATE },
  hr: { label: 'hrChain.title', template: HR_TEMPLATE },
} as const satisfies Record<string, {
  readonly label: Parameters<WorkbenchT>[0]
  readonly template: FlowTemplate
}>

type ChainView = keyof typeof CHAIN_VIEWS

/** 渲染工作方法页：默认展示采购业务链路，可切换其余岗位链路模板。 */
export function WorkMethodsScreen({ t }: { readonly t: WorkbenchT }) {
  const [view, setView] = useState<ChainView>('procurement')
  return <div className={css.screen}>
    <div className={css.switcher} role="group" aria-label={t('nav.workMethods')}>
      {(Object.keys(CHAIN_VIEWS) as readonly ChainView[]).map(name => (
        <Button key={name} size="sm" variant={view === name ? 'outline' : 'toolbar'} aria-pressed={view === name}
          onClick={() => { setView(name) }}>{t(CHAIN_VIEWS[name].label)}</Button>
      ))}
    </div>
    <FlowChainView template={CHAIN_VIEWS[view].template} t={t} />
  </div>
}
