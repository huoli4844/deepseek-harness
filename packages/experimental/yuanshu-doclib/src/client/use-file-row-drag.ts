/** 文件行拖拽：按下时预取字节，dragstart 交给宿主文件拖拽服务，对话输入框可直接接收。 */
import { useCallback, useEffect, useRef, type DragEvent, type MouseEvent, type PointerEvent } from 'react'
import type { FileDragActions, PreparedFileDrag } from '@deepseek-ai/dsh-client-ui-primitives'

/** 单行可拖拽文件：展示名、类型、体积与按需读取字节的函数。 */
export interface DraggableFile {
  readonly name: string
  readonly mimeType: string
  /** 文件字节数；超过 {@link MAX_DRAG_BYTES} 时不预取，避免按下就下载超大文件。 */
  readonly size?: number | undefined
  readonly load: (signal: AbortSignal) => Promise<Blob>
}

/** 预取上限：与预览一致，超出后不再在按下时拉取字节。 */
export const MAX_DRAG_BYTES = 64 * 1024 * 1024

/** 拖拽手势回调：挂到表格行元素上。 */
export interface FileRowDrag {
  readonly draggable: boolean
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void
  readonly onPointerUp: () => void
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void
  readonly onDragEnd: () => void
  readonly onClickCapture: (event: MouseEvent<HTMLElement>) => void
}

/** 一次预取：取消信号与已就绪的传输句柄。 */
interface Preparation {
  readonly abort: AbortController
  prepared?: PreparedFileDrag
  failed: boolean
}

const INERT = {
  draggable: false,
  onPointerDown: () => {},
  onPointerUp: () => {},
  onPointerLeave: () => {},
  onDragStart: () => {},
  onDragEnd: () => {},
  onClickCapture: () => {},
} satisfies FileRowDrag

/** 用函数读取取消状态，避免 await 后类型收窄把后续检查判成恒假。 */
function aborted(controller: AbortController): boolean {
  return controller.signal.aborted
}

/**
 * 文件行拖拽：浏览器要求 dragstart 同步写入数据，因此字节在按下时预取；
 * 预取失败或未就绪时取消本次浏览器拖拽并重试，下一次拖动即可正常开始。
 * @param actions - 宿主文件拖拽服务；缺失时整行不可拖。
 * @param file - 当前行文件；目录或不可拖条目传 undefined。
 * @returns 行上的拖拽属性与手势回调。
 */
export function useFileRowDrag(actions: FileDragActions | undefined, file: DraggableFile | undefined): FileRowDrag {
  const state = useRef<Preparation>()
  const dragged = useRef(false)

  const release = useCallback((): void => {
    const previous = state.current
    state.current = undefined
    previous?.abort.abort()
    previous?.prepared?.release()
  }, [])

  // 行内文件对象按渲染重建，卸载时才释放，避免每次重渲染都中断预取。
  useEffect(() => release, [release])

  const prepare = useCallback((): void => {
    if (actions === undefined || file === undefined) return
    if (file.size !== undefined && file.size > MAX_DRAG_BYTES) return
    if (state.current !== undefined) return
    const current: Preparation = { abort: new AbortController(), failed: false }
    state.current = current
    // 松开或窗口失焦即取消预取，避免长时间占用连接。
    window.addEventListener('pointerup', release, { once: true, signal: current.abort.signal })
    window.addEventListener('blur', release, { once: true, signal: current.abort.signal })
    void (async () => {
      try {
        const blob = await file.load(current.abort.signal)
        if (current.abort.signal.aborted) return
        const prepared = await actions.prepare({
          kind: 'blob', blob, name: file.name, mediaType: file.mimeType || blob.type,
        }, current.abort.signal)
        if (aborted(current.abort)) prepared.release()
        else current.prepared = prepared
      } catch {
        // 预取失败保持安静，真正拖拽时再给出重试提示。
        if (!current.abort.signal.aborted) current.failed = true
      }
    })()
  }, [actions, file, release])

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>): void => {
    dragged.current = false
    if (event.button !== 0) return
    // 勾选框与操作列不触发预取，避免多选时反复下载文件。
    const target = event.target
    if (target instanceof Element && target.closest('input, [data-no-drag]') !== null) return
    prepare()
  }, [prepare])

  const onDragStart = useCallback((event: DragEvent<HTMLElement>): void => {
    if (actions === undefined || file === undefined) return
    dragged.current = true
    const current = state.current
    if (current?.prepared !== undefined) {
      // 桌面端由原生拖拽接管时返回 false，取消浏览器自带数据传输。
      if (!current.prepared.start(event.dataTransfer, event.currentTarget)) {
        event.preventDefault()
        release()
      }
      return
    }
    event.preventDefault()
    if (current?.failed === true) actions.reportFailure()
    release()
    prepare()
  }, [actions, file, prepare, release])

  const onPointerUp = useCallback((): void => {
    if (!dragged.current) release()
  }, [release])

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>): void => {
    // 拖动中离开行（例如移到右侧输入框）不能释放，交给 dragend。
    if (event.buttons !== 1) release()
  }, [release])

  const onDragEnd = useCallback((): void => { release() }, [release])

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>): void => {
    if (!dragged.current) return
    event.preventDefault()
    event.stopPropagation()
    dragged.current = false
  }, [])

  if (actions === undefined || file === undefined) return INERT
  return { draggable: true, onPointerDown, onPointerUp, onPointerLeave, onDragStart, onDragEnd, onClickCapture }
}
