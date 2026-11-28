/** 以项目为单位展示合同和财务信息；仅消费视图模型，不执行请求或修改业务数据。 */
import type { WorkbenchT } from '../../app/page-api.ts'
import type { ContractProjectRecord } from './contract-project-model.ts'
import { contractProjectCard, type ProjectCardField } from './contract-project-viewmodel.ts'
import { contractAmount, contractStatusLabel, contractTypeLabel } from './contract-viewmodel.ts'
import css from './contract-project-cards.module.css'

function Fields({ entries, metrics = false }: { readonly entries: readonly ProjectCardField[]; readonly metrics?: boolean }) {
  return <dl className={metrics ? css.metrics : css.fields}>
    {entries.map(entry => <div key={entry.label}>
      <dt>{entry.label}</dt><dd title={entry.value}>{entry.value}</dd>
    </div>)}
  </dl>
}

/** 在独立滚动区渲染当前页项目卡片，每个项目可展开完整合同明细。 */
export function ContractProjectCards({ projects, loading, t }: {
  readonly projects: readonly ContractProjectRecord[]
  readonly loading: boolean
  readonly t: WorkbenchT
}) {
  return <div className={css.grid} aria-label={t('contract.projectCards')} aria-busy={loading}>
    {projects.map((project) => {
      const card = contractProjectCard(project, t)
      return <article className={css.card} key={project.code} aria-label={card.title}>
        <header className={css.header}>
          <div><h3 title={card.title}>{card.title}</h3><small title={card.code}>{card.code}</small></div>
          <span className={css.status}>{card.status}</span>
        </header>
        <Fields entries={card.overview} />
        <Fields entries={card.metrics} metrics />
        <details className={css.details}>
          <summary>{t('contract.projectDetails')}</summary>
          <Fields entries={card.details} />
          <h4>{t('contract.projectContracts')}</h4>
          {project.contracts.length === 0 && <p>{t('contract.noProjectContracts')}</p>}
          <ul className={css.contracts}>
            {project.contracts.map(contract => <li key={contract.id}>
              <div><strong title={String(contract.values.code ?? contract.id)}>{contract.values.code ?? contract.id}</strong>
                <span>{contractStatusLabel(t, contract.values.status) ?? '—'}</span></div>
              <span>{contractTypeLabel(t, contract.values.contract_type) ?? '—'} · {contract.values.counterparty_name ?? '—'}</span>
              <b>{contractAmount(contract.values.total_amount) ?? '—'}</b>
            </li>)}
          </ul>
        </details>
      </article>
    })}
  </div>
}
