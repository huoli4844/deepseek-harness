/** 展示物料筛选表单和列表，不直接请求后台。 */
import {
  Button, IconEditOutlineRegular, IconSearchOutlineRegular, IconTrashOutlineRegular, Input, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveCellTag } from '../../shared/ArchiveTable.tsx'
import { readFormText } from '../../shared/form-data.ts'
import { materialColumns, type MaterialFilters, type MaterialPage, type MaterialRecord, type MaterialSort } from './material-model.ts'
import { materialCells } from './material-viewmodel.ts'
import { levelLabel, typeLabel } from './MaterialStatsPanel.tsx'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import businessCss from './business-modules.module.css'
import css from './material-management.module.css'

/** 关键等级编码到中文彩色标签；未知编码原样返回。 */
function levelTag(code: string, t: WorkbenchT): ArchiveCellTag | string {
  if (code === 'critical') return { text: t('material.level.critical'), tone: 'danger' }
  if (code === 'high' || code === 'important') {
    return { text: t(`material.level.${code}`), tone: 'warn' }
  }
  if (code === 'medium') return { text: t('material.level.medium'), tone: 'brand' }
  if (code === 'normal') return { text: t('material.level.normal'), tone: 'success' }
  if (code === 'low') return { text: t('material.level.low'), tone: 'muted' }
  return code
}

/** 渲染物料查询条件、当前页记录及分页。 */
export function MaterialRecords({
  result,
  loading,
  error,
  page,
  pageCount,
  sort,
  disabled,
  typeOptions,
  levelOptions,
  onSearch,
  onSort,
  onPage,
  onRetry,
  onEdit,
  onDelete,
  t,
}: {
  readonly result: MaterialPage | undefined
  readonly loading: boolean
  readonly error: 'login' | 'denied' | 'failure' | undefined
  readonly page: number
  readonly pageCount: number | undefined
  readonly sort: MaterialSort | undefined
  readonly disabled: boolean
  readonly typeOptions?: readonly string[] | undefined
  readonly levelOptions?: readonly string[] | undefined
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
  // 类型用中文文本展示，关键等级用彩色标签区分严重度。
  const rows = (result?.items ?? []).map((item) => {
    const cells = materialCells(item)
    const type = cells.material_type
    const level = cells.critical_level
    return { key: item.id, cells: {
      ...cells,
      material_type: typeof type === 'string' && type !== '' ? typeLabel(type, t) : type,
      critical_level: typeof level === 'string' && level !== '' ? levelTag(level, t) : level,
    } }
  })
  return <section className={css.records} aria-label={t('material.filters')}>
    <MaterialSearchForm result={result} typeOptions={typeOptions} levelOptions={levelOptions} onSearch={onSearch} t={t} />
    {loading && <p role="status" className={css.recordStatus}>{t('material.loading')}</p>}
    {error !== undefined && <div role="alert" className={css.recordStatus}>
      {t(error === 'login' ? 'material.login' : error === 'denied' ? 'material.denied' : 'material.listError')}
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('material.retry')}</Button>
    </div>}
    {result !== undefined && <div className={css.recordsTable} aria-busy={loading}>
      <ArchiveTable stickyHeader columns={columns} rows={rows}
        sort={sort} onSort={onSort} actionsLabel={t('material.actions')} renderActions={(key) => {
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

function MaterialSearchForm({ result, typeOptions, levelOptions, onSearch, t }: {
  readonly result: MaterialPage | undefined
  readonly typeOptions: readonly string[] | undefined
  readonly levelOptions: readonly string[] | undefined
  readonly onSearch: (filters: MaterialFilters) => void
  readonly t: WorkbenchT
}) {
  // 线上列表响应不再返回筛选选项，优先使用统计聚合出的全量取值。
  const types = typeOptions ?? result?.materialTypes ?? []
  const levels = levelOptions ?? result?.criticalLevels ?? []
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
          {/* 下拉选项用中文名称展示，保留原编码作为提交值。 */}
          {types.filter(option => option !== '').map(option => <option value={option} key={option}>{typeLabel(option, t)}</option>)}
        </select>
      </label>
      <label className={businessCss.businessModuleSelect}>{t('material.critical_level')}
        <select name="criticalLevel">
          <option value="">{t('material.allOptions')}</option>
          {levels.filter(option => option !== '').map(option => <option value={option} key={option}>{levelLabel(option, t)}</option>)}
        </select>
      </label>
    </div>
    <div className={css.filterActions}>
      <Button type="submit" variant="primary" aria-label={t('material.search')} icon={<IconSearchOutlineRegular />} />
    </div>
  </form>
}
