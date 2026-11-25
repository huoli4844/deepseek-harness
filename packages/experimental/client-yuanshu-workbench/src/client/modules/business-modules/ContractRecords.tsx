/** 展示合同筛选表单和台账列表，不直接请求后台。 */
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import { contractColumns, type ContractFilters, type ContractPage, type ContractSort } from './contract-model.ts'
import { contractCells } from './contract-viewmodel.ts'
import css from './contract-management.module.css'

/** 渲染合同查询条件、当前页记录及分页。 */
export function ContractRecords({
  result, loading, error, page, pageCount, sort, t,
  onSearch, onSort, onPage, onRetry,
}: {
  readonly result: ContractPage | undefined
  readonly loading: boolean
  readonly error: 'login' | 'denied' | 'failure' | undefined
  readonly page: number
  readonly pageCount: number | undefined
  readonly sort: ContractSort | undefined
  readonly t: WorkbenchT
  readonly onSearch: (filters: ContractFilters) => void
  readonly onSort: (key: string) => void
  readonly onPage: (page: number) => void
  readonly onRetry: () => void
}) {
  const columns = contractColumns.map(({ key, width }) => ({ key, width, label: t(`contract.${key}`) }))
  return <section className={css.records} aria-label={t('contract.filters')}>
    <form className={css.filters} aria-label={t('contract.filters')} onSubmit={(event) => {
      event.preventDefault()
      onSearch({ keyword: readFormText(new FormData(event.currentTarget), 'keyword') })
    }}>
      <label>{t('contract.keywordLabel')}
        <Input name="keyword" maxLength={100} placeholder={t('contract.keyword')} />
      </label>
      <Button type="submit" variant="outline">{t('contract.search')}</Button>
    </form>
    {loading && <p role="status" className={css.recordStatus}>{t('contract.loading')}</p>}
    {error !== undefined && <div role="alert" className={css.recordStatus}>
      {t(error === 'login' ? 'contract.login' : error === 'denied' ? 'contract.denied' : 'contract.listError')}
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('contract.retry')}</Button>
    </div>}
    {result !== undefined && <div className={css.recordsTable} aria-busy={loading}>
      <ArchiveTable stickyHeader columns={columns}
        rows={result.items.map(item => ({ key: item.id, cells: contractCells(item, t) }))}
        sort={sort} onSort={onSort} />
    </div>}
    {!loading && error === undefined && result?.items.length === 0 && <p role="status" className={css.recordStatus}>{t('contract.empty')}</p>}
    <ArchiveListFooter resource="contract" t={t} archiveTotal={result?.archiveTotal}
      ready={result !== undefined} page={page} pageCount={pageCount}
      canGoNext={pageCount !== undefined && page < pageCount} onPage={onPage} />
  </section>
}
