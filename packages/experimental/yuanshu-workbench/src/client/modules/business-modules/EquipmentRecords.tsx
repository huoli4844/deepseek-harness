/** 展示设备筛选表单和台账列表，不直接请求后台。 */
import {
  Button, IconEditOutlineRegular, IconSearchOutlineRegular, IconTrashOutlineRegular, Input, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import {
  equipmentColumns, type EquipmentFilters, type EquipmentPage, type EquipmentRecord, type EquipmentSort,
} from './equipment-model.ts'
import { equipmentCells } from './equipment-viewmodel.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import businessCss from './business-modules.module.css'
import css from './equipment-ledger.module.css'

/** 渲染设备查询条件、当前页记录及分页。 */
export function EquipmentRecords({
  result, loading, error, page, pageCount, sort, disabled,
  onSearch, onSort, onPage, onRetry, onCreate, onEdit, onDelete, t,
}: {
  readonly result: EquipmentPage | undefined
  readonly loading: boolean
  readonly error: 'login' | 'denied' | 'failure' | undefined
  readonly page: number
  readonly pageCount: number | undefined
  readonly sort: EquipmentSort | undefined
  readonly disabled: boolean
  readonly onSearch: (filters: EquipmentFilters) => void
  readonly onSort: (key: string) => void
  readonly onPage: (page: number) => void
  readonly onRetry: () => void
  readonly onCreate: () => void
  readonly onEdit: (record: EquipmentRecord) => void
  readonly onDelete: (record: EquipmentRecord) => void
  readonly t: WorkbenchT
}) {
  const columns = equipmentColumns.map(({ key, width }) => ({ key, width, label: t(`equipment.${key}`) }))
  const records = new Map<number, EquipmentRecord>(result?.items.map(record => [record.id, record]) ?? [])
  return <section className={css.records} aria-label={t('equipment.filters')}>
    <form className={css.filters} aria-label={t('equipment.filters')} onSubmit={(event) => {
      event.preventDefault()
      onSearch({ keyword: readFormText(new FormData(event.currentTarget), 'keyword') })
    }}>
      <label>{t('equipment.keywordLabel')}
        <Input name="keyword" maxLength={100} placeholder={t('equipment.keyword')} />
      </label>
      <Button type="submit" variant="outline" aria-label={t('equipment.search')} icon={<IconSearchOutlineRegular />} />
      <div className={css.filterActions}>
        <Button type="button" variant="primary" disabled={disabled} onClick={onCreate}>{t('equipment.create')}</Button>
      </div>
    </form>
    {loading && <p role="status" className={css.recordStatus}>{t('equipment.loading')}</p>}
    {error !== undefined && <div role="alert" className={css.recordStatus}>
      {t(error === 'login' ? 'equipment.login' : error === 'denied' ? 'equipment.denied' : 'equipment.listError')}
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('equipment.retry')}</Button>
    </div>}
    {result !== undefined && <div className={css.recordsTable} aria-busy={loading}>
      <ArchiveTable stickyHeader columns={columns} rows={result.items.map(item => ({ key: item.id, cells: equipmentCells(item, t) }))}
        sort={sort} onSort={onSort} actionsLabel={t('equipment.actions')} renderActions={(key) => {
          const record = records.get(Number(key))
          if (record === undefined) return null
          return <div className={businessCss.businessModuleActions}>
            <Tooltip label={t('equipment.edit')} side="top" portal><Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
              icon={<IconEditOutlineRegular size={16} />} aria-label={t('equipment.edit')} disabled={disabled} onClick={() => { onEdit(record) }} /></Tooltip>
            <Tooltip label={t('equipment.delete')} side="top" portal><Button size="sm" variant="toolbar" className={businessCss.businessModuleIconButton}
              icon={<IconTrashOutlineRegular size={16} />} aria-label={t('equipment.delete')} disabled={disabled} onClick={() => { onDelete(record) }} /></Tooltip>
          </div>
        }} />
    </div>}
    {!loading && error === undefined && result?.items.length === 0 && <p role="status" className={css.recordStatus}>{t('equipment.empty')}</p>}
    <ArchiveListFooter resource="equipment" t={t} archiveTotal={result?.archiveTotal}
      ready={result !== undefined} page={page} pageCount={pageCount}
      canGoNext={pageCount !== undefined && page < pageCount} onPage={onPage} />
  </section>
}
