/** 表头列宽拖动：把手放在列左边界，拖动时实时改写该列的像素宽度。 */
import { useCallback, useRef, useState } from 'react'
import css from '../doclib.module.css'

/** 拖动过程中的起点与初始列宽。 */
interface ColumnDrag {
  readonly startX: number
  readonly startWidth: number
}

/** 单列可调宽度范围（像素），避免拖成不可用的极窄列。 */
const COLUMN_MIN_WIDTH = 64
const COLUMN_MAX_WIDTH = 640

/**
 * 记录用户拖动后的列宽；未拖动过的列继续使用样式里的默认宽度。
 * @returns 当前列宽、按列键写入新宽度的方法。
 */
export function useColumnWidths<Key extends string>(): {
  readonly widths: Partial<Record<Key, number>>
  readonly resize: (key: Key, width: number) => void
} {
  const [widths, setWidths] = useState<Partial<Record<Key, number>>>({})
  const resize = useCallback((key: Key, width: number) => {
    const next = Math.min(COLUMN_MAX_WIDTH, Math.max(COLUMN_MIN_WIDTH, Math.round(width)))
    setWidths(previous => ({ ...previous, [key]: next }))
  }, [])
  return { widths, resize }
}

/**
 * 列宽拖动把手：位于表头单元格左边界，向右拖动收窄本列、向左拖动加宽本列。
 * @param props - 无障碍名称与新宽度回调。
 */
export function ColumnResizer(props: {
  readonly label: string
  readonly onResize: (width: number) => void
}) {
  const drag = useRef<ColumnDrag | undefined>(undefined)
  const finish = (event: React.PointerEvent<HTMLSpanElement>) => {
    drag.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  return <span className={css.columnResizer} role="separator" aria-orientation="vertical"
    aria-label={props.label} title={props.label}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault()
      drag.current = {
        startX: event.clientX,
        startWidth: event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={(event) => {
      const current = drag.current
      if (current === undefined) return
      // 把手在左边界：向右拖动等价于压缩本列。
      props.onResize(current.startWidth - (event.clientX - current.startX))
    }}
    onPointerUp={finish}
    onPointerCancel={finish} />
}
