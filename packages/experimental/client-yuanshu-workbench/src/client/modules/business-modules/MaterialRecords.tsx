/** 展示物料筛选表单和列表，不直接请求后台。 */
import { Button, IconEditOutlineRegular, IconTrashOutlineRegular, Input, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import { materialColumns, type MaterialFilters, type MaterialPage, type MaterialRecord, type MaterialSort } from './material-model.ts'
import { materialCells } from './material-viewmodel.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import businessCss from './business-modules.module.css'
import css from './material-management.module.css'

/** 渲染物料查询条件、当前页记录及分页。 */
export function MaterialRecords({ result, loading, error, page, pageCount, sort, disabled, onSearch, onSort, onPage, onRetry, onEdit, onDelete, t }: {
  readonly result: MaterialPage | undefined
  readonly loading: boolean
  readonly error: 'login' | 'denied' | 'failure' | undefined
  readonly page: number
  readonly pageCount: number | undefined
  readonly sort: MaterialSort | undefined
  readonly disabled: boolean
  readonly onSearch: (filters: MaterialFilters) => void
  readonly onSort: (key: string) => void
  readonly onPage: (page: number) => void
  readonly onRetry: () => void
  readonly onEdit: (record: MaterialRecord) => void
  readonly onDelete: (record: MaterialRecord) => void
  readonly t: WorkbenchT
}) {
  const columns = materialColumns.map(({ key, width }) => ({ key, width, label: t(`material.${key}`) }))
  const records = new Map<number | string, MaterialRecord>(result?.items.map(record => [record.id, record]) ?? [])
  return <section className={css.records} aria-label={t('material.filters')}>
    <MaterialSearchForm result={result} onSearch={onSearch} t={t} />
    {loading && <p role="status" className={css.recordStatus}>{t('material.loading')}</p>}
    {error !== undefined && <div role="alert" className={css.recordStatus}>
      {t(error === 'login' ? 'material.login' : error === 'denied' ? 'material.denied' : 'material.listError')}
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('material.retry')}</Button>
    </div>}
    {result !== undefined && <div className={css.recordsTable} aria-busy={loading}>
      <ArchiveTable stickyHeader columns={columns} rows={result.items.map(item => ({ key: item.id, cells: materialCells(item) }))}
        sort={sort} onSort={onSort} actionsLabel={t('material.actions')} renderActions={key => {
          const record = records.get(key)
          if (record === undefined) return null
          return <div className={businessCss.businessModuleActions}>
            <Tooltip label={t('material.edit')} side="top" portal><Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
              icon={<IconEditOutlineRegular size={16} />} aria-label={t('material.edit')} disabled={disabled} onClick={() => { onEdit(record) }} /></Tooltip>
            <Tooltip label={t('material.delete')} side="top" portal><Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
              icon={<IconTrashOutlineRegular size={16} />} aria-label={t('material.delete')} disabled={disabled} onClick={() => { onDelete(record) }} /></Tooltip>
          </div>
        }} />
    </div>}
    {!loading && error === undefined && result?.items.length === 0 && <p role="status" className={css.recordStatus}>{t('material.empty')}</p>}
    <ArchiveListFooter resource="material" t={t} archiveTotal={result?.archiveTotal}
      ready={result !== undefined} page={page} pageCount={pageCount}
      canGoNext={pageCount !== undefined && page < pageCount} onPage={onPage} />
  </section>
}

function MaterialSearchForm({ result, onSearch, t }: {
  readonly result: MaterialPage | undefined
  readonly onSearch: (filters: MaterialFilters) => void
  readonly t: WorkbenchT
}) {
  return <form className={css.filters} aria-label={t('material.filters')} onSubmit={(event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onSearch({
      code: readFormText(data, 'code'), name: readFormText(data, 'name'),
      materialType: readFormText(data, 'materialType'), criticalLevel: readFormText(data, 'criticalLevel'),
    })
  }}>
    <div className={css.filterFields}>
      <label className={businessCss.businessModuleSelect}>{t('material.code')}
        <Input name="code" maxLength={100} />
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.name')}
        <Input name="name" maxLength={200} />
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.material_type')}
        <select name="materialType">
          <option value="">{t('material.allOptions')}</option>
          {result?.materialTypes.map(option => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.critical_level')}
        <select name="criticalLevel">
          <option value="">{t('material.allOptions')}</option>
          {result?.criticalLevels.map(option => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
    </div>
    <div className={css.filterActions}>
      <Button type="submit" variant="primary">{t('material.search')}</Button>
    </div>
  </form>
}
