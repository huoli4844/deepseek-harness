/**
 * 编排合同台账查询与列表展示。
 * 数据请求经合同数据层完成，不直接读取凭据或实现 HTTP 协议。
 */
import type { WorkbenchT } from '../../app/page-api.ts'
import { ContractRecords } from './ContractRecords.tsx'
import { ContractStatsPanel } from './ContractStatsPanel.tsx'
import { useContractStats, useContracts } from './use-contracts.ts'
import css from './contract-management.module.css'

/** 渲染合同管理统计与列表。 */
export function ContractManagementScreen({ t }: { readonly t: WorkbenchT }) {
  const contracts = useContracts()
  const stats = useContractStats()
  return <div className={css.screen}>
    <ContractStatsPanel stats={stats.stats} status={stats.status} t={t} />
    <ContractRecords view={contracts.view} onView={contracts.changeView} result={contracts.result}
      loading={contracts.loading} error={contracts.error}
      page={contracts.page} pageCount={contracts.pageCount} sort={contracts.sort} t={t}
      onSearch={contracts.search} onSort={contracts.sortBy} onPage={contracts.goToPage} onRetry={contracts.retry} />
  </div>
}
