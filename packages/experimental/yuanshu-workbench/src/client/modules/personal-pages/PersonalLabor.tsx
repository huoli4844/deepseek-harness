/** 个人工时卡片：每次挂载、切换周期或刷新时重新读取后台。 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { ArchiveListFooter } from '../business-modules/ArchiveListFooter.tsx'
import { listLaborMonth } from '../business-modules/project-registration-api.ts'
import type { LaborRecord } from '../business-modules/project-registration-model.ts'
import { personalLaborRange } from './viewmodel.ts'
import css from './personal-pages.module.css'

/** 本地分页大小：整月记录在客户端排序后切片展示。 */
const aggregatePageSize = 20

/** 表格行：工时记录附上项目名称。 */
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

/** 汇总本人全部项目在所选周期的工时记录。 */
export function PersonalLabor({ period, userId, t, onReady }: {
  readonly period: 'week' | 'month'
  readonly userId: number
  readonly t: WorkbenchT
  readonly onReady?: ((ready: boolean) => void) | undefined
}) {
  const [number, setNumber] = useState(1)
  const [sort, setSort] = useState<ArchiveSort>()
  const [attempt, setAttempt] = useState(0)
  const [aggregate, setAggregate] = useState<{
    readonly records: readonly LaborRecord[]
    readonly projects: readonly { readonly id: number; readonly name: string }[]
  }>()
  const [error, setError] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setAggregate(undefined)
    setError(false)
    onReady?.(false)
    const range = personalLaborRange({ period })
    // 后台只有按项目的工时列表，全部项目需先取项目目录再逐项目汇总整页记录。
    void listLaborMonth({ dateFrom: range.dateFrom, dateTo: range.dateTo, userId }, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      if (value === undefined || value.records.some(row => row.user_id !== userId)) throw new Error('Unexpected labor data')
      setAggregate({ records: value.records, projects: value.projects })
      onReady?.(true)
    }).catch((err: unknown) => {
      // 失败原因（限流/权限/校验）写入控制台，便于区分“接口失败”与“数据校验失败”。
      console.error('[yuanshu] 个人页工时汇总失败', err)
      if (!controller.signal.aborted) setError(true)
    })
    return () => { controller.abort() }
  }, [period, userId, number, sort, attempt, onReady])
  const rows = useMemo(() => {
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
    { key: 'project', label: t('personalPages.project') },
    { key: 'hours', label: t('personalPages.hours') },
    { key: 'description', label: t('personalPages.description'), width: 280 },
  ]
  const pageCount = rows?.pageCount
  const tableRows = (rows?.rows.slice((number - 1) * aggregatePageSize, number * aggregatePageSize) ?? []).map(({ record, project }) => ({
    key: record.id, cells: {
      work_date: record.work_date, project, hours: record.hours, description: record.description,
    } }))
  return <>
    {error ? <div role="alert">{t('registration.loadError')}{' '}
      <Button onClick={() => { setAttempt(value => value + 1) }}>{t('registration.retry')}</Button>
    </div> : aggregate === undefined ? <p role="status">{t('registration.loading')}</p> : <>
      {rows?.rows.length === 0 && <p>{t('labor.empty')}</p>}
      <div className={css.scroll}><ArchiveTable columns={columns} rows={tableRows} sort={sort} stickyHeader onSort={(key) => {
        setNumber(1)
        setSort(previous => ({ key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }))
      }} /></div>
      <ArchiveListFooter resource="labor" t={t} archiveTotal={undefined} page={number} pageCount={pageCount}
        canGoNext={number < (pageCount ?? 1)} ready onPage={setNumber} />
    </>}
  </>
}
