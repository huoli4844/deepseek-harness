/** 右键菜单纯组件：按坐标弹出，点击外部或按 Esc 关闭，不持有业务状态。 */
import { useEffect, useRef } from 'react'
import css from '../doclib.module.css'

/** 单个菜单项。 */
export interface ContextMenuItem {
  readonly id: string
  readonly label: string
  readonly run: () => void
  readonly disabled?: boolean
}

/** 菜单状态：屏幕坐标与菜单项。 */
export interface ContextMenuState {
  readonly x: number
  readonly y: number
  readonly items: readonly ContextMenuItem[]
}

/**
 * 右键菜单：固定定位在鼠标处，点击菜单项后关闭。
 * @param props - 菜单位置、菜单项与关闭回调。
 */
export function FileContextMenu({ menu, onClose }: {
  readonly menu: ContextMenuState
  readonly onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return <div ref={ref} className={css.menu} role="menu"
    style={{ left: menu.x, top: menu.y }}>
    {menu.items.map(item => <button key={item.id} type="button" role="menuitem"
      className={css.menuItem} disabled={item.disabled === true}
      onClick={() => { onClose(); item.run() }}>{item.label}</button>)}
  </div>
}
