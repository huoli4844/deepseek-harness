/** 档案表格展示排序、列宽和单元格提示，仅维护列宽交互状态。 */
import { useRef, useState } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './table.module.css'

/** 定义档案列表列名、初始宽度和可排序性。 */
export interface ArchiveColumn {
  readonly key: string
  readonly label: string
  readonly width?: number
  readonly sortable?: boolean
}

/** 记录进入表格前已格式化的单元格内容。 */
export interface ArchiveRow {
  readonly key: number | string
  readonly cells: Readonly<Record<string, string | number | undefined>>
}

/** 表格当前由后台执行的排序。 */
export interface ArchiveSort {
  readonly key: string
  readonly direction: 'asc' | 'desc'
}

interface ResizeDrag {
  readonly key: string
  readonly x: number
  readonly width: number
}

const minWidth = 80
const maxWidth = 640
const defaultWidth = 132
const actionsWidth = 104

/** 渲染支持排序、调整列宽及查看完整值的档案表格。 */
export function ArchiveTable({ columns, rows, sort, onSort, actionsLabel, renderActions, stickyHeader }: {
  readonly columns: readonly ArchiveColumn[]
  readonly rows: readonly ArchiveRow[]
  readonly sort?: ArchiveSort | undefined
  readonly onSort: (key: string) => void
  readonly actionsLabel?: string
  readonly renderActions?: (key: number | string) => ReactNode
  readonly stickyHeader?: boolean
}) {
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({})
  const drag = useRef<ResizeDrag>()
  const hasActions = renderActions !== undefined
  const widthOf = (column: ArchiveColumn) => widths[column.key] ?? column.width ?? defaultWidth
  const tableWidth = columns.reduce((sum, column) => sum + widthOf(column), hasActions ? actionsWidth : 0)

  const setWidth = (key: string, width: number) => {
    const bounded = Math.max(minWidth, Math.min(maxWidth, Math.round(width)))
    setWidths(previous => previous[key] === bounded ? previous : { ...previous, [key]: bounded })
  }

  const startResize = (event: PointerEvent<HTMLSpanElement>, column: ArchiveColumn) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      key: column.key,
      x: event.clientX,
      width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? widthOf(column),
    }
  }

  return <div className={css.tableWrap}>
    <table className={`${css.table} ${css.archiveTable}${stickyHeader ? ` ${css.archiveStickyHeader}` : ''}`}
      style={{ width: tableWidth }}>
      <colgroup>
        {columns.map(column => <col key={column.key} style={{ width: widthOf(column) }} />)}
        {hasActions && <col style={{ width: actionsWidth }} />}
      </colgroup>
      <thead><tr>
        {columns.map((column, index) => {
          const direction = sort?.key === column.key ? sort.direction : undefined
          return <th key={column.key} scope="col" aria-label={column.label}
            aria-sort={direction === undefined ? undefined : direction === 'asc' ? 'ascending' : 'descending'}>
            {column.sortable === false ? <span className={css.archiveValue}>{column.label}</span>
              : <button type="button" className={css.archiveSort} onClick={() => { onSort(column.key) }}>
                <span className={css.archiveValue}>{column.label}</span>
                {direction === 'asc' && <IconChevronUpOutlineRegular aria-hidden size={14} />}
                {direction === 'desc' && <IconChevronDownOutlineRegular aria-hidden size={14} />}
              </button>}
            {(index + 1 < columns.length || hasActions) && <span className={css.archiveResize}
              role="separator" aria-orientation="vertical" aria-label={column.label}
              aria-valuemin={minWidth} aria-valuemax={maxWidth} aria-valuenow={widthOf(column)} tabIndex={0}
              onPointerDown={(event) => { startResize(event, column) }}
              onPointerMove={(event) => {
                const active = drag.current
                if (active?.key === column.key) setWidth(active.key, active.width + event.clientX - active.x)
              }}
              onLostPointerCapture={() => { drag.current = undefined }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                setWidth(column.key, widthOf(column) + (event.key === 'ArrowRight' ? 12 : -12))
              }} />}
          </th>
        })}
        {hasActions && <th scope="col" className={css.actionCell}>{actionsLabel}</th>}
      </tr></thead>
      <tbody>{rows.map(row => <tr key={row.key}>
        {columns.map((column) => {
          const value = row.cells[column.key]
          const display = value === undefined || value === '' ? '—' : String(value)
          return <Tooltip key={column.key} label={display} side="top" portal delayMs={250}>
            <td><span className={css.archiveValue}>{display}</span></td>
          </Tooltip>
        })}
        {renderActions !== undefined && <td className={css.actionCell}>{renderActions(row.key)}</td>}
      </tr>)}</tbody>
    </table>
  </div>
}
