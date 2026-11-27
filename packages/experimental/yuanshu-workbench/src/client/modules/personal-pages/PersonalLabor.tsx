/** 个人工时页每次挂载、切换或刷新时重新读取后台。 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { ArchiveListFooter } from '../business-modules/ArchiveListFooter.tsx'
import { listLabor, listLaborMonth } from '../business-modules/project-registration-api.ts'
import type { LaborRecord, RegistrationPage } from '../business-modules/project-registration-model.ts'
import { personalLaborRange } from './viewmodel.ts'
import type { PersonalPage } from './model.ts'
import css from './personal-pages.module.css'

/** 汇总模式本地分页大小；单项目模式仍走后台分页。 */
const aggregatePageSize = 20

/** 汇总模式表格行：工时记录附上项目名称。 */
interface AggregateRow {
  readonly record: LaborRecord
  readonly project: string
}

/** 汇总记录排序：工时按数值比较，其余按文本比较；direction 决定升降序。 */
function compareRows(left: AggregateRow, right: AggregateRow, key: string, direction: 'asc' | 'desc'): number {
  const sign = direction === 'asc' ? 1 : -1
  if (key === 'hours') return sign * ((Number(left.record.hours) || 0) - (Number(right.record.hours) || 0))
  if (key === 'project') return sign * left.project.localeCompare(right.project, 'zh-CN')
  const leftValue = key === 'work_date' ? (left.record.work_date ?? '') : left.record.description
  const rightValue = key === 'work_date' ? (right.record.work_date ?? '') : right.record.description
  return sign * leftValue.localeCompare(rightValue, 'zh-CN')
}

/** 只显示当前员工的项目工时；未限定项目时汇总本人全部项目的记录。 */
export function PersonalLabor({ page, userId, t, onReady }: {
  readonly page: PersonalPage
  readonly userId: number
  readonly t: WorkbenchT
  readonly onReady?: ((ready: boolean) => void) | undefined
}) {
  const scoped = typeof page.projectCode === 'string' && page.projectCode !== ''
  const [number, setNumber] = useState(1)
  const [sort, setSort] = useState<ArchiveSort>()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<RegistrationPage<LaborRecord>>()
  const [aggregate, setAggregate] = useState<{
    readonly records: readonly LaborRecord[]
    readonly projects: readonly { readonly id: number; readonly name: string }[]
  }>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setResult(undefined)
    setAggregate(undefined)
    setError(false)
    onReady?.(false)
    const range = personalLaborRange(page)
    if (scoped) {
      void listLabor(range, number, sort, controller.signal, userId).then((value) => {
        if (controller.signal.aborted) return
        if (value.items.some(row => row.user_id !== userId)) throw new Error('Unexpected labor owner')
        setResult(value)
        onReady?.(true)
      }).catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    } else {
      // 后台只有按项目的工时列表，全部项目需先取项目目录再逐项目汇总整页记录
      void listLaborMonth({ dateFrom: range.dateFrom, dateTo: range.dateTo, userId }, controller.signal).then((value) => {
        if (controller.signal.aborted) return
        if (value === undefined || value.records.some(row => row.user_id !== userId)) throw new Error('Unexpected labor data')
        setAggregate({ records: value.records, projects: value.projects })
        onReady?.(true)
      }).catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    }
    return () => { controller.abort() }
  }, [page, userId, number, sort, attempt, onReady, scoped])
  const rows = useMemo<{ readonly rows: readonly AggregateRow[]; readonly pageCount: number } | undefined>(() => {
    if (aggregate === undefined) return undefined
    const mapped = aggregate.records.map(record => ({
      record,
      project: aggregate.projects.find(item => item.id === record.project_id)?.name ?? '',
    }))
    const effective = sort ?? { key: 'work_date', direction: 'desc' as const }
    const sorted = [...mapped].sort((left, right) => compareRows(left, right, effective.key, effective.direction))
    return { rows: sorted, pageCount: Math.max(1, Math.ceil(sorted.length / aggregatePageSize)) }
  }, [aggregate, sort])
  const columns = [
    { key: 'work_date', label: t('personalPages.workDate') },
    ...(scoped ? [] : [{ key: 'project', label: t('personalPages.project') }]),
    { key: 'hours', label: t('personalPages.hours') },
    { key: 'description', label: t('personalPages.description'), width: 280 },
  ]
  const pageCount = scoped
    ? (result === undefined ? undefined : Math.max(1, Math.ceil(result.total / result.pageSize)))
    : rows?.pageCount
  const tableRows = scoped
    ? (result?.items ?? []).map(row => ({ key: row.id, cells: {
      work_date: row.work_date, hours: row.hours, description: row.description,
    } }))
    : (rows?.rows.slice((number - 1) * aggregatePageSize, number * aggregatePageSize) ?? []).map(({ record, project }) => ({
      key: record.id, cells: {
        work_date: record.work_date, project, hours: record.hours, description: record.description,
      } }))
  return <>
    {error ? <div role="alert">{t('registration.loadError')}{' '}
      <Button onClick={() => { setAttempt(value => value + 1) }}>{t('registration.retry')}</Button>
    </div> : (scoped ? result : aggregate) === undefined ? <p role="status">{t('registration.loading')}</p> : <>
      {(scoped ? result?.items.length === 0 : rows?.rows.length === 0) && <p>{t('labor.empty')}</p>}
      <div className={css.scroll}><ArchiveTable columns={columns} rows={tableRows} sort={sort} stickyHeader onSort={(key) => {
        setNumber(1)
        setSort(previous => ({ key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }))
      }} /></div>
      <ArchiveListFooter resource="labor" t={t} archiveTotal={scoped ? result?.archiveTotal : undefined}
        page={number} pageCount={pageCount} canGoNext={number < (pageCount ?? 1)} ready onPage={setNumber} />
    </>}
  </>
}
