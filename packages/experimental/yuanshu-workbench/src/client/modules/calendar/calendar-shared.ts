/** 日历事项数据模型、本地持久化与共享状态：供日历页与岗位工作台概览复用。 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TaskId } from '../../core/model.ts'
import { createCalendarEvent, fetchCalendarEvents, fetchDefaultCalendarId } from './calendar-api.ts'

/** 事项处理状态：待处理为默认；已完成绿色、遗留/待上会黄色、转风险红色、移交蓝色。 */
export type CalendarStatus = 'pending' | 'completed' | 'deferred' | 'risk' | 'transferred' | 'meeting'

/** 全部合法状态（用于 localStorage 容错解析）。 */
export const STATUSES: readonly CalendarStatus[] = ['pending', 'completed', 'deferred', 'risk', 'transferred', 'meeting']

/** 一个日历事项：本地演示事项（可增删改）或真实日程（只读）。 */
export interface CalendarItem {
  readonly id: string
  /** 日期 ISO 格式 yyyy-mm-dd。 */
  readonly date: string
  /** 可选时刻 HH:mm。 */
  readonly time?: string
  readonly title: string
  /** 关联的项目任务 id；undefined 表示未关联。 */
  readonly taskId: TaskId | undefined
  /** 处理状态；已完成的事项显示为绿色。 */
  readonly status: CalendarStatus
  /** 真实日程（来自元枢个人日程）为只读。 */
  readonly readonly?: boolean
}

/** 新增 / 编辑弹窗的表单状态。 */
export type FormState =
  | { readonly kind: 'add'; readonly date: string }
  | { readonly kind: 'edit'; readonly id: string }
  | undefined

/** 表单草稿字段。 */
export interface CalendarDraft {
  readonly title: string
  readonly date: string
  readonly time: string
  readonly taskId: string
  readonly status: CalendarStatus
}

/** 日期 → ISO 字符串（本地时区）。 */
export function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 本地事项的持久化键（刷新不丢）。 */
const LOCAL_ITEMS_KEY = 'workbench-calendar-items'

/** 后台日程 → 只读日历事项。 */
function backendEventsToItems(events: readonly { id: number; title: string; startAt: string | undefined }[]): CalendarItem[] {
  return events.flatMap((event) => {
    if (event.startAt === undefined || event.title === '') return []
    const parsed = new Date(event.startAt)
    if (Number.isNaN(parsed.getTime())) return []
    return [{
      id: `real-${event.id}`,
      date: isoOf(parsed),
      time: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`,
      title: event.title,
      taskId: undefined,
      status: 'pending',
      readonly: true,
    }]
  })
}

/** 从 localStorage 恢复本地事项；解析失败返回空列表。兼容旧数据的 done 布尔字段，并过滤历史演示种子。 */
function loadLocalItems(): CalendarItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_ITEMS_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const items: CalendarItem[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : undefined
      const date = typeof row.date === 'string' ? row.date : undefined
      const title = typeof row.title === 'string' ? row.title : undefined
      // 演示种子（seed-*）不再展示：老用户本地缓存里的种子一并清除。
      if (id === undefined || date === undefined || title === undefined || id.startsWith('seed-')) continue
      const rawStatus = typeof row.status === 'string' ? row.status as CalendarStatus : undefined
      items.push({
        id,
        date,
        ...(typeof row.time === 'string' ? { time: row.time } : {}),
        title,
        taskId: typeof row.taskId === 'number' ? row.taskId as TaskId : undefined,
        status: rawStatus !== undefined && STATUSES.includes(rawStatus) ? rawStatus : row.done === true ? 'completed' : 'pending',
      })
    }
    return items
  } catch {
    return []
  }
}

/** 本地事项写入 localStorage；写入失败静默忽略（隐私模式等场景）。 */
function persistLocalItems(items: readonly CalendarItem[]): void {
  try {
    localStorage.setItem(LOCAL_ITEMS_KEY, JSON.stringify(items))
  } catch {
    // 忽略持久化失败，事项仍保留在内存中。
  }
}

/** 日历事项共享状态：本地事项、后台只读日程与新增/编辑/删除操作。 */
export function useCalendarItems() {
  const [items, setItems] = useState<CalendarItem[]>(loadLocalItems)
  const [realItems, setRealItems] = useState<CalendarItem[]>([])
  const [form, setForm] = useState<FormState>(undefined)
  const [draft, setDraft] = useState<CalendarDraft>({ title: '', date: '', time: '', taskId: '', status: 'pending' })

  // 本地事项变化即持久化。
  useEffect(() => { persistLocalItems(items) }, [items])

  /** 拉取后台日程（失败静默降级为空）。 */
  const reloadReal = useCallback((signal: AbortSignal) => {
    void fetchCalendarEvents(signal).then((events) => {
      if (!signal.aborted && events.length > 0) setRealItems(backendEventsToItems(events))
    }).catch(() => undefined)
  }, [])

  // 首次加载并入后台日程。
  useEffect(() => {
    const controller = new AbortController()
    reloadReal(controller.signal)
    return () => { controller.abort() }
  }, [reloadReal])

  const allItems = useMemo(() => [...realItems, ...items], [realItems, items])

  const openAdd = (date: string) => {
    setDraft({ title: '', date, time: '', taskId: '', status: 'pending' })
    setForm({ kind: 'add', date })
  }

  const openEdit = (item: CalendarItem) => {
    if (item.readonly) return
    setDraft({
      title: item.title,
      date: item.date,
      time: item.time ?? '',
      taskId: item.taskId === undefined ? '' : String(item.taskId),
      status: item.status,
    })
    setForm({ kind: 'edit', id: item.id })
  }

  const closeForm = () => { setForm(undefined) }

  const saveItem = () => {
    if (draft.title.trim() === '' || draft.date === '') return
    const taskId = draft.taskId === '' ? undefined : Number(draft.taskId) as TaskId
    if (form?.kind === 'edit') {
      setItems(list => list.map(item => item.id === form.id
        ? {
          ...item,
          title: draft.title.trim(),
          date: draft.date,
          status: draft.status,
          ...(draft.time === '' ? {} : { time: draft.time }),
          ...(taskId === undefined ? { taskId: undefined } : { taskId }),
        }
        : item))
    } else {
      setItems(list => [...list, {
        id: `item-${Date.now()}`,
        date: draft.date,
        ...(draft.time === '' ? {} : { time: draft.time }),
        title: draft.title.trim(),
        taskId,
        status: draft.status,
      }])
    }
    setForm(undefined)
    // 新建事项同时尝试写入后台：成功后由 reload 并入只读列表，失败则保留本地。
    if (form?.kind !== 'add') return
    const controller = new AbortController()
    void (async () => {
      const calendarId = await fetchDefaultCalendarId(controller.signal).catch(() => undefined)
      if (calendarId === undefined) return
      const startAt = draft.time === '' ? `${draft.date}T09:00:00` : `${draft.date}T${draft.time}:00`
      const result = await createCalendarEvent({ calendarId, title: draft.title.trim(), startAt }, controller.signal)
        .catch(() => ({ ok: false as const }))
      if (result.ok) reloadReal(controller.signal)
    })()
  }

  const removeItem = () => {
    if (form?.kind !== 'edit') return
    setItems(list => list.filter(item => item.id !== form.id))
    setForm(undefined)
  }

  return { allItems, form, draft, setDraft, openAdd, openEdit, closeForm, saveItem, removeItem }
}
