import { useEffect, useRef, useState } from 'react'
import type { KeyboardEventHandler, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { IconCloseOutlineRegular, IconWarningOutlineRegular } from './icons/index.tsx'
import { useModalLayer } from './useModalLayer.ts'
import css from './Modal.module.css'

interface ModalBaseProps {
  open: boolean
  onClose: () => void
  title: string
  tone?: 'warning'
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
  contentClassName?: string
  shortcutModal?: string
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>
  backdropBlur?: boolean
  /** Header-drag moving; on by default so every dialog can be moved out of the way. */
  draggable?: boolean
}

type ModalProps = ModalBaseProps & (
  | { headless: true; closeLabel?: never }
  | { headless?: false; closeLabel: string }
)

/**
 * Render a centered, body-portaled modal over a blurred page mask.
 * @param props.open - whether the dialog is showing.
 * @param props.onClose - application close command, Escape, or mask click; while a menu is open inside the
 * dialog, Escape belongs to that menu first.
 * @param props.title - dialog heading (aria-label in every mode).
 * @param props.tone - warning adds an amber title icon and compact title-to-body spacing; ignored for headless dialogs.
 * @param props.closeLabel - localized accessible close-button label.
 * @param props.description - optional supporting sentence under the title.
 * @param props.children - dialog body; mark its initial-focus control with
 * data-modal-autofocus instead of React autoFocus to preserve return focus.
 * @param props.footer - action row (Cancel / Create).
 * @param props.contentClassName - optional class for a scrollable content region.
 * @param props.backdropBlur - disable when the caller already blurs the page; defaults to true.
 * @param props.draggable - header-drag moving; defaults to true (ignored for headless cards, which own their chrome).
 * @param props.shortcutModal - command scope allowed by shortcut owners; unnamed
 * dialogs block application commands unless their owner allows the "other" scope.
 * @param props.headless - render children directly in the card (no default
 * header/close/body chrome); mask, card, Escape, and aria-label remain.
 * @param props.onKeyDownCapture - handle a nested dialog's keys before the document Escape listeners.
 * @returns null when closed; otherwise the overlay tree.
 */
export function Modal({
  open, onClose, title, closeLabel, description, children, footer, className, contentClassName,
  onKeyDownCapture, headless = false, backdropBlur = true, shortcutModal, tone, draggable = true,
}: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null)
  useModalLayer(dialog, open, onClose)
  /** Drag offset from the centered position; recentered on every open. */
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  interface DragState { pointerId: number; startX: number; startY: number; baseX: number; baseY: number; bounds: DOMRect }
  const dragState = useRef<DragState | undefined>()

  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 })
  }, [open])

  /** Clamp so the header stays reachable inside the viewport while dragging. */
  const clampOffset = (x: number, y: number): { x: number; y: number } => {
    const state = dragState.current
    if (state === undefined) return { x, y }
    const rect = state.bounds
    const margin = 24
    const minX = state.baseX + (margin - rect.left)
    const maxX = state.baseX + (window.innerWidth - margin - rect.right)
    const minY = state.baseY + (margin - rect.top)
    const maxY = state.baseY + (window.innerHeight - margin - rect.bottom)
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY),
    }
  }

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || headless) return
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    const rect = dialog.current?.getBoundingClientRect()
    if (rect === undefined) return
    dragState.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y, bounds: rect,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    if (state === undefined || state.pointerId !== event.pointerId) return
    setOffset(clampOffset(state.baseX + event.clientX - state.startX, state.baseY + event.clientY - state.startY))
  }

  const onHeaderPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current === undefined || dragState.current.pointerId !== event.pointerId) return
    dragState.current = undefined
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (!open) return null

  return createPortal((
    <div className={css.root} role="presentation" onKeyDownCapture={onKeyDownCapture}>
      <div className={css.mask} style={backdropBlur ? undefined : { backdropFilter: 'none' }} aria-hidden="true" onClick={onClose} />
      <div
        ref={dialog}
        tabIndex={-1}
        data-shortcut-modal={shortcutModal}
        className={clsx(css.dialog, !headless && tone === 'warning' && css.warning, className)}
        style={offset.x !== 0 || offset.y !== 0 ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {headless
          ? children
          : (
            <>
              <div className={clsx(css.content, contentClassName)}>
                <div
                  className={clsx(css.header, draggable && css.draggableHeader)}
                  onPointerDown={onHeaderPointerDown}
                  onPointerMove={onHeaderPointerMove}
                  onPointerUp={onHeaderPointerEnd}
                  onPointerCancel={onHeaderPointerEnd}
                >
                  <h2 className={css.title}>
                    {tone === 'warning' && <IconWarningOutlineRegular size={18} className={css.warningIcon} aria-hidden="true" />}
                    {title}
                  </h2>
                  <button type="button" className={css.close} aria-label={closeLabel} onClick={onClose}>
                    <IconCloseOutlineRegular size={14} />
                  </button>
                </div>
                {description !== undefined && description !== '' && (
                  <p className={css.description}>{description}</p>
                )}
                {children !== undefined && <div className={css.body}>{children}</div>}
              </div>
              {footer !== undefined && <div className={css.footer}>{footer}</div>}
            </>
          )}
      </div>
    </div>
  ), document.body)
}
