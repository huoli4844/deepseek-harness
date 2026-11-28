/** 业务流程链路视图：岗位工作台展示的静态模板（采购/质量/行政），悬停节点高亮边框，右上角可选当前项目。 */
import { Fragment, useEffect, useState } from 'react'
import {
  IconArchiveCheckOutlineRegular, IconArchiveOutlineRegular, IconCheckCircleOutlineRegular,
  IconChecklistOutlineRegular, IconChevronRightOutlineRegular, IconClockOutlineRegular,
  IconCompareSplitOutlineRegular, IconDatabaseOutlineRegular, IconEditOutlineRegular,
  IconFilesDiffOutlineRegular, IconFlatListOutlineRegular, IconInfoOutlineRegular,
  IconListPenOutlineRegular, IconSendOutlineRegular, IconWarningTriangleOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { PROCUREMENT_TEMPLATE } from './procurement-chain-model.ts'
import type { ChainIcon, ChainNode, FlowTemplate } from './procurement-chain-model.ts'
import { listRegistrationProjects } from '../business-modules/project-registration-api.ts'
import css from './procurement-chain.module.css'

/** 图标呈现键到具体图标组件的映射。 */
const NODE_ICONS: Record<ChainIcon, typeof IconInfoOutlineRegular> = {
  inquiry: IconFlatListOutlineRegular,
  compare: IconCompareSplitOutlineRegular,
  order: IconListPenOutlineRegular,
  arrival: IconSendOutlineRegular,
  inspection: IconCheckCircleOutlineRegular,
  stock: IconDatabaseOutlineRegular,
  ledger: IconArchiveOutlineRegular,
  inbound: IconArchiveCheckOutlineRegular,
  plan: IconChecklistOutlineRegular,
  process: IconListPenOutlineRegular,
  nonconform: IconWarningTriangleOutlineRegular,
  qarchive: IconArchiveOutlineRegular,
  car: IconEditOutlineRegular,
  report: IconFilesDiffOutlineRegular,
}

/** 项目下拉的单个选项。 */
interface ProjectOption {
  readonly code: string
  readonly name: string
}

/** 单张节点卡片：序号、图标、标题、单据类型与描述。 */
function NodeCard({ node, branch, t }: {
  readonly node: ChainNode
  readonly branch: boolean
  readonly t: WorkbenchT
}) {
  const Icon = NODE_ICONS[node.icon]
  return <div className={css.card} data-branch={branch} tabIndex={0} aria-label={t(node.title)}>
    <div className={css.cardTop}>
      <span>{node.step}</span>
      <IconInfoOutlineRegular size={12} />
    </div>
    <span className={css.cardIcon}><Icon size={18} /></span>
    <h3 className={css.cardTitle}>{t(node.title)}</h3>
    <span className={css.cardDoc}>{t(node.doc)}</span>
    <p className={css.cardDescription}>{t(node.description)}</p>
  </div>
}

/** 节点之间的顺序箭头。 */
function Arrow() {
  return <span className={css.link} aria-hidden="true"><IconChevronRightOutlineRegular size={14} /></span>
}

/** 渲染一张流程模板：顶部标题与项目下拉、若干行链路（可带分组标题）、底部注脚。 */
export function FlowChainView({ template, t }: {
  readonly template: FlowTemplate
  readonly t: WorkbenchT
}) {
  const total = template.rows.reduce((sum, row) => sum + row.nodes.length, 0)
  // 项目下拉：加载失败或未登录时降级为占位文本，不阻塞模板展示。
  const [projects, setProjects] = useState<readonly ProjectOption[] | undefined>(undefined)
  const [projectCode, setProjectCode] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    listRegistrationProjects('', 1, controller.signal).then((result) => {
      if (!controller.signal.aborted) setProjects(result.items.map(item => ({ code: item.code, name: item.name })))
    }).catch(() => {
      if (!controller.signal.aborted) setProjects([])
    })
    return () => { controller.abort() }
  }, [])
  return <section className={css.screen} aria-label={t(template.title)}>
    <div className={css.topbar}>
      <div>
        <h1 className={css.title}>{t(template.title)}</h1>
        <p className={css.subtitle}>{t(template.subtitle)}</p>
      </div>
      <div className={css.meta}>
        <label className={css.projectChip}>
          {t('procurementChain.currentProject')}
          {projects !== undefined && projects.length > 0
            ? <select className={css.projectSelect} value={projectCode} aria-label={t('procurementChain.currentProject')}
              onChange={(event) => { setProjectCode(event.target.value) }}>
              {projects.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
            : <b>{projects === undefined ? t('registration.loading') : '— — —'}</b>}
        </label>
        <span className={css.nodeCount}>{t('procurementChain.nodeCount', { count: String(total) })}</span>
      </div>
    </div>
    {template.rows.map((row, rowIndex) => <Fragment key={row.label ?? `row-${rowIndex}`}>
      {row.label !== undefined && (row.branch === true
        ? <div className={css.branchHead}><IconInfoOutlineRegular size={14} />{t(row.label)}</div>
        : <div className={css.rowHead}><IconInfoOutlineRegular size={14} />{t(row.label)}</div>)}
      <div className={css.row}>
        {row.nodes.map((node, index) => <Fragment key={`${node.step}-${node.icon}`}>
          {index > 0 && <Arrow />}
          <NodeCard node={node} branch={row.branch === true} t={t} />
        </Fragment>)}
      </div>
    </Fragment>)}
    <div className={css.footer}>
      <span><IconInfoOutlineRegular size={12} />{t('procurementChain.arrowNote')}</span>
      <span><IconClockOutlineRegular size={12} />{t('procurementChain.startNote')}</span>
    </div>
  </section>
}

/** 采购业务链路模板视图。 */
export function ProcurementChain({ t }: { readonly t: WorkbenchT }) {
  return <FlowChainView template={PROCUREMENT_TEMPLATE} t={t} />
}
