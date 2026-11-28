/** 目录数据卡片：按草稿预填的只读接口路径实时查询，支持表格、数字统计卡与条形图三种视图。 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import type { PersonalWidget } from './model.ts'
import { fieldLabel } from './field-labels.ts'
import css from './personal-pages.module.css'

/** 单卡最大展示行数，与宿主代理的裁剪上限一致。 */
const maxRows = 50

/** 表格单元格取值：仅渲染原始类型字段，避免嵌套对象撑爆表格。 */
function cellValue(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return undefined
}

/** 从后台响应中取出记录数组与总数：兼容 data.items 分页结构与裸数组。 */
function extractData(data: unknown): { rows: readonly Record<string, unknown>[]; total: number } {
  const candidate = Array.isArray(data) ? data
    : typeof data === 'object' && data !== null && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : undefined
  if (candidate === undefined) return { rows: [], total: 0 }
  const rows = candidate.filter((row): row is Record<string, unknown> =>
    typeof row === 'object' && row !== null && !Array.isArray(row)).slice(0, maxRows)
  const total = !Array.isArray(data) && typeof (data as { total?: unknown }).total === 'number'
    ? (data as { total: number }).total : rows.length
  return { rows, total }
}

/** 表格行标识：优先 id 字段，缺失时按所选列拼接兜底。 */
function rowKey(row: Record<string, unknown>, keys: readonly { readonly key: string }[]): string {
  const id = row.id
  if (typeof id === 'string') return id
  if (typeof id === 'number') return String(id)
  return keys.map(({ key }) => String(cellValue(row[key]) ?? '')).join('|')
}

/** 数值格式化：整数千分位，小数最多两位。 */
function fmt(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString('zh-CN') : String(Math.round(value * 100) / 100)
}

/** 通用数据卡片：路径与参数由创建对话从只读目录中选定，员工确认后每次挂载实时查询。 */
export function DataQueryCard({ widget, t, onReady }: {
  readonly widget: PersonalWidget
  readonly t: WorkbenchT
  readonly onReady?: ((ready: boolean) => void) | undefined
}) {
  const [sort, setSort] = useState<ArchiveSort>()
  const [attempt, setAttempt] = useState(0)
  const [rows, setRows] = useState<readonly Record<string, unknown>[]>()
  /** 查询失败说明：优先展示代理返回的具体原因，便于员工与创建对话直接定位。 */
  const [error, setError] = useState<string>()
  /** 目录随数据下发的字段中文说明；卡片自身 labels 优先。 */
  const [remoteLabels, setRemoteLabels] = useState<Readonly<Record<string, string>>>({})
  /** 后台数据总数，count 聚合时优先于本地行数。 */
  const [total, setTotal] = useState(0)
  const path = widget.path ?? ''
  // 未传参数时固定空对象引用，避免 effect 因依赖变化反复重新查询。
  const params = useMemo(() => widget.params ?? {}, [widget.params])
  useEffect(() => {
    const controller = new AbortController()
    setRows(undefined)
    setError(undefined)
    onReady?.(false)
    const query = new URLSearchParams({ path, limit: String(maxRows), ...params })
    const token = localStorage.getItem('workbench-client-token')
    const head = new Headers({ 'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '' })
    if (token) head.set('authorization', `Bearer ${token}`)
    void fetch(`/yuanshu-workbench/data-query?${query.toString()}`, { headers: head, signal: controller.signal })
      .then(async (response) => {
        const payload = await (response.json().catch(() => undefined)) as {
          data?: unknown
          labels?: unknown
          error?: unknown
        } | undefined
        if (!response.ok || payload === undefined) {
          throw new Error(typeof payload?.error === 'string' && payload.error !== '' ? payload.error : `HTTP ${String(response.status)}`)
        }
        if (typeof payload.labels === 'object' && payload.labels !== null && !Array.isArray(payload.labels)) {
          setRemoteLabels(payload.labels as Readonly<Record<string, string>>)
        }
        const { rows: value, total } = extractData(payload.data)
        if (controller.signal.aborted) return
        setRows(value)
        setTotal(total)
        onReady?.(true)
      })
      .catch((err: unknown) => {
        console.error('[yuanshu] 个人页数据卡片查询失败', err)
        if (!controller.signal.aborted) {
          setError(err instanceof Error && err.message !== '' && !err.message.startsWith('HTTP ')
            ? err.message : t('registration.loadError'))
        }
      })
    return () => { controller.abort() }
  }, [path, params, attempt, onReady, t])
  // 字段展示名：卡片自带标签 > 目录说明 > 内置中文词典 > 下划线转空格的字段名。
  const labelOf = (key: string): string => widget.labels?.[key] ?? remoteLabels[key] ?? fieldLabel(key)
  const columns = useMemo(() => {
    const first = rows?.[0]
    if (first === undefined) return []
    const available = Object.keys(first).filter(key => cellValue(first[key]) !== undefined)
    const picked = widget.columns === undefined
      ? available.slice(0, 6)
      : widget.columns.filter(key => available.includes(key)).slice(0, 8)
    return picked.map(key => ({ key, label: labelOf(key) }))
  }, [rows, widget.columns, widget.labels, remoteLabels])
  const sorted = useMemo(() => {
    if (rows === undefined || sort === undefined) return rows ?? []
    const { key, direction } = sort
    const sign = direction === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => {
      const a = cellValue(left[key]), b = cellValue(right[key])
      if (typeof a === 'number' && typeof b === 'number') return sign * (a - b)
      return sign * String(a ?? '').localeCompare(String(b ?? ''), 'zh-CN')
    })
  }, [rows, sort])
  // 数字统计卡：按聚合方式（sum/avg/max/min）计算数值列；count 直接取后台总数。
  const numericKeys = useMemo(() => {
    const first = rows?.[0]
    if (first === undefined) return []
    return Object.keys(first).filter(key => typeof first[key] === 'number')
  }, [rows])
  const aggregate = widget.aggregate ?? 'sum'
  const statValues = useMemo(() => {
    const map = new Map<string, number>()
    if (rows === undefined) return map
    if (aggregate === 'count') return map.set('total', total)
    for (const key of numericKeys) {
      const values = rows.flatMap(row => typeof row[key] === 'number' ? [row[key]] : [])
      if (values.length === 0) continue
      if (aggregate === 'avg') map.set(key, values.reduce((left, right) => left + right, 0) / values.length)
      else if (aggregate === 'max') map.set(key, Math.max(...values))
      else if (aggregate === 'min') map.set(key, Math.min(...values))
      else map.set(key, values.reduce((left, right) => left + right, 0))
    }
    return map
  }, [rows, numericKeys, aggregate, total])
  const statKeys = useMemo(() => aggregate === 'count'
    ? ['total']
    : (widget.columns?.filter(key => numericKeys.includes(key)) ?? numericKeys).slice(0, 6),
  [aggregate, widget.columns, numericKeys])
  // 条形图：取第一个数值列作度量，名称类字段作标签，按数值降序。
  const { valueKey, labelKey } = useMemo(() => {
    const wanted = widget.columns?.filter(key => numericKeys.includes(key)) ?? numericKeys
    const value = wanted[0]
    if (value === undefined) return { valueKey: undefined, labelKey: undefined }
    const first = rows?.[0]
    const textKeys = first === undefined ? []
      : Object.keys(first).filter(key => key !== value && typeof first[key] === 'string')
    const preferred = ['name', 'code', 'title', 'label'].find(key => textKeys.includes(key)) ?? textKeys[0]
    return { valueKey: value, labelKey: preferred }
  }, [widget.columns, numericKeys, rows])
  const bars = useMemo(() => {
    if (rows === undefined || valueKey === undefined) return []
    return rows.flatMap((row) => {
      const value = row[valueKey]
      if (typeof value !== 'number') return []
      const text = cellValue(row[labelKey ?? ''])
      return [{ label: text === undefined ? '' : String(text), value }]
    }).sort((left, right) => right.value - left.value)
  }, [rows, valueKey, labelKey])
  const view = widget.view ?? 'table'
  if (path === '') return <p role="status">{t('personalPages.dataNotConfigured')}</p>
  if (error) return <div role="alert">{t('registration.loadError')}{' '}
    <Button onClick={() => { setAttempt(value => value + 1) }}>{t('registration.retry')}</Button>
  </div>
  if (rows === undefined) return <p role="status">{t('registration.loading')}</p>
  if (rows.length === 0) return <p>{t('personalPages.dataEmpty')}</p>
  if (view === 'stats' && statKeys.length > 0) return <div className={css.statGrid}>
    {statKeys.map(key => <div key={key} className={css.statTile}>
      <span className={css.statValue}>{fmt(statValues.get(key) ?? 0)}</span>
      <span className={css.statLabel}>{key === 'total' ? t('personalPages.totalCount') : labelOf(key)}</span>
    </div>)}
  </div>
  if (view === 'bar' && valueKey !== undefined) return bars.length === 0 ? <p>{t('personalPages.dataEmpty')}</p>
    : <div className={css.barList}>{bars.map((bar, index) => <div key={`${bar.label}-${String(index)}`} className={css.barRow}>
      <span className={css.barLabel}>{bar.label === '' ? '—' : bar.label}</span>
      <span className={css.barTrack}><span className={css.barFill}
        style={{ width: `${Math.max(4, Math.round(bar.value / (bars[0]?.value || 1) * 100))}%` }} /></span>
      <span className={css.barValue}>{fmt(bar.value)}</span>
    </div>)}</div>
  return <div className={css.scroll}><ArchiveTable columns={columns} stickyHeader sort={sort}
    rows={sorted.map(row => ({ key: rowKey(row, columns),
      cells: Object.fromEntries(columns.map(({ key }) => [key, cellValue(row[key])])) }))}
    onSort={(key) => {
      setSort(previous => ({ key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }))
    }} /></div>
}
