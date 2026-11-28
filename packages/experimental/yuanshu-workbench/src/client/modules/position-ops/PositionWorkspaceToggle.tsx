/** 岗位工作台容器：内容区右上角可切换「岗位工作」与采购/质量/行政/物资/财务/研发/供应商/人力资源业务流程静态模板（测试阶段不限角色）。 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import {
  ADMIN_TEMPLATE, DEV_TEMPLATE, FINANCE_TEMPLATE, HR_TEMPLATE, MATERIALS_TEMPLATE,
  PROCUREMENT_TEMPLATE, QUALITY_TEMPLATE, SUPPLIER_TEMPLATE,
} from '../procurement-chain/procurement-chain-model.ts'
import type { FlowTemplate } from '../procurement-chain/procurement-chain-model.ts'
import { FlowChainView } from '../procurement-chain/ProcurementChain.tsx'
import css from './position-workspace.module.css'

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

/** 渲染切换按钮行与当前视图：默认岗位工作，可切换各岗位业务链路模板。 */
export function PositionWorkspaceToggle({ t, children }: {
  readonly t: WorkbenchT
  readonly children: ReactNode
}) {
  const [view, setView] = useState<ChainView | 'operations'>('operations')
  return <div className={css.screen}>
    <div className={css.bar}>
      <span className={css.barSpacer} aria-hidden="true" />
      <div className={css.switcher} role="group" aria-label={t('procurementChain.title')}>
        <Button size="sm" variant={view === 'operations' ? 'outline' : 'toolbar'} aria-pressed={view === 'operations'}
          onClick={() => { setView('operations') }}>{t('procurementChain.viewOperations')}</Button>
        {(Object.keys(CHAIN_VIEWS) as readonly ChainView[]).map(name => (
          <Button key={name} size="sm" variant={view === name ? 'outline' : 'toolbar'} aria-pressed={view === name}
            onClick={() => { setView(name) }}>{t(CHAIN_VIEWS[name].label)}</Button>
        ))}
      </div>
    </div>
    {view === 'operations' ? children : <FlowChainView template={CHAIN_VIEWS[view].template} t={t} />}
  </div>
}
