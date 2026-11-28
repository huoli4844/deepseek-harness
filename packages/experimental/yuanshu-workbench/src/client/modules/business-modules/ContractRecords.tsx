/** 展示合同筛选表单和台账列表，不直接请求后台。 */
import { Button, IconSearchOutlineRegular, IconLayersOutlineRegular, IconChecklistOutlineRegular, Input, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import { contractColumns, type ContractFilters, type ContractPage, type ContractSort } from './contract-model.ts'
import type { ContractView } from './contract-project-model.ts'
import { ContractProjectCards } from './ContractProjectCards.tsx'
import { contractCells } from './contract-viewmodel.ts'
import css from './contract-management.module.css'

/** 渲染合同查询条件、当前页记录及分页。 */
export function ContractRecords({
  result, loading, error, page, pageCount, sort, t, view = 'list', onView,
  onSearch, onSort, onPage, onRetry,
}: {
  readonly view?: ContractView
  readonly onView?: (view: ContractView) => void
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
    <div className={css.recordToolbar}>
      <form className={css.filters} aria-label={t('contract.filters')} onSubmit={(event) => {
        event.preventDefault()
        onSearch({ keyword: readFormText(new FormData(event.currentTarget), 'keyword') })
      }}>
        <label>{t('contract.keywordLabel')}
          <Input name="keyword" maxLength={100} placeholder={t('contract.keyword')} />
        </label>
        <Button type="submit" variant="outline" aria-label={t('contract.search')} icon={<IconSearchOutlineRegular />} />
      </form>
      {onView && <div className={css.viewSwitch} role="group" aria-label={t('contract.viewMode')}>
        <Tooltip label={t('contract.cardsView')} side="top" portal>
          <Button size="sm" variant={view === 'cards' ? 'outline' : 'toolbar'} aria-label={t('contract.cardsView')}
            aria-pressed={view === 'cards'} icon={<IconLayersOutlineRegular />} onClick={() => { onView('cards') }} />
        </Tooltip>
        <Tooltip label={t('contract.listView')} side="top" portal>
          <Button size="sm" variant={view === 'list' ? 'outline' : 'toolbar'} aria-label={t('contract.listView')}
            aria-pressed={view === 'list'} icon={<IconChecklistOutlineRegular />} onClick={() => { onView('list') }} />
        </Tooltip>
      </div>}
    </div>
    {view === 'cards' && result && <p className={css.statsHint}>{t('contract.projectMatches', { count: result.total })}</p>}
    {loading && <p role="status" className={css.recordStatus}>{t('contract.loading')}</p>}
    {error !== undefined && <div role="alert" className={css.recordStatus}>
      {t(error === 'login' ? 'contract.login' : error === 'denied' ? 'contract.denied' : 'contract.listError')}
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('contract.retry')}</Button>
    </div>}
    {result !== undefined && view === 'cards' && <ContractProjectCards projects={result.projects ?? []} loading={loading} t={t} />}
    {result !== undefined && view === 'list' && <div className={css.recordsTable} aria-busy={loading}>
      <ArchiveTable stickyHeader columns={columns}
        rows={result.items.map(item => ({ key: item.id, cells: contractCells(item, t) }))}
        sort={sort} onSort={onSort} />
    </div>}
    {!loading && error === undefined && result?.total === 0 && <p role="status" className={css.recordStatus}>{t('contract.empty')}</p>}
    <ArchiveListFooter resource="contract" t={t} archiveTotal={result?.archiveTotal}
      ready={result !== undefined} page={page} pageCount={pageCount}
      canGoNext={pageCount !== undefined && page < pageCount} onPage={onPage} />
  </section>
}
