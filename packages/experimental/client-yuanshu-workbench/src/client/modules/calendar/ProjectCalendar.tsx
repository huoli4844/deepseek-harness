/**
 * 工程日历 — 以日历视角看待全局的待办与已完成事项，事项关联项目任务。
 *
 * 默认月视图（大日历），可切换年视角；
 * 支持新增、编辑、删除事项；事项可关联到项目任务。
 * 后台个人日程（/personal/calendar-events）以只读方式并入日历展示；
 * 用户自建事项优先写入后台，写失败（后台契约暂不可用）时降级为本地
 * 保存（localStorage 持久化，刷新不丢）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import type { TaskId } from '../../core/model.ts'
import { createCalendarEvent, fetchCalendarEvents, fetchDefaultCalendarId } from './calendar-api.ts'
import css from './Calendar.module.css'

type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']

/** 事项处理状态：待处理为默认；已完成绿色、遗留/待上会黄色、转风险红色、移交蓝色。 */
export type CalendarStatus = 'pending' | 'completed' | 'deferred' | 'risk' | 'transferred' | 'meeting'

/** 全部合法状态（用于 localStorage 容错解析）。 */
const STATUSES: readonly CalendarStatus[] = ['pending', 'completed', 'deferred', 'risk', 'transferred', 'meeting']

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

/** 星期文案 key（周一开头，与 `week.*` 文案对应）。 */
const WEEKDAYS: readonly ('week.0' | 'week.1' | 'week.2' | 'week.3' | 'week.4' | 'week.5' | 'week.6')[] = ['week.0', 'week.1', 'week.2', 'week.3', 'week.4', 'week.5', 'week.6']

type ViewMode = 'month' | 'year'
type FormState =
  | { readonly kind: 'add'; readonly date: string }
  | { readonly kind: 'edit'; readonly id: string }
  | undefined

/** 日期 → ISO 字符串（本地时区）。 */
function isoOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 相对今天的偏移天数 → ISO 字符串。 */
function isoOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return isoOf(date)
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

/** 从 localStorage 恢复本地事项；解析失败返回演示种子。兼容旧数据的 done 布尔字段。 */
function loadLocalItems(): CalendarItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_ITEMS_KEY)
    if (raw === null) return seedItems()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return seedItems()
    const items: CalendarItem[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue
      const row = entry as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id : undefined
      const date = typeof row.date === 'string' ? row.date : undefined
      const title = typeof row.title === 'string' ? row.title : undefined
      if (id === undefined || date === undefined || title === undefined) continue
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
    return items.length === 0 ? seedItems() : items
  } catch {
    return seedItems()
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

/** 本地演示事项种子：围绕今天分布，并关联到项目任务。 */
function seedItems(): CalendarItem[] {
  return [
    { id: 'seed-1', date: isoOffset(0), time: '09:30', title: '二阶段形象进度确认会', taskId: 0, status: 'pending' },
    { id: 'seed-2', date: isoOffset(0), time: '14:00', title: '钢梁焊缝复检整改单跟进', taskId: 1, status: 'pending' },
    { id: 'seed-3', date: isoOffset(1), time: '10:00', title: '供应商产能协调会', taskId: 3, status: 'meeting' },
    { id: 'seed-4', date: isoOffset(2), time: '16:30', title: '月度进度报告提交', taskId: 2, status: 'pending' },
    { id: 'seed-5', date: isoOffset(-1), time: '11:00', title: '设备采购合同评审', taskId: 4, status: 'completed' },
    { id: 'seed-6', date: isoOffset(4), time: '09:00', title: '联合巡检 · 现场安全检查', taskId: 5, status: 'transferred' },
    { id: 'seed-7', date: isoOffset(-3), time: '15:00', title: '上周质量例会决议复核', taskId: 6, status: 'deferred' },
  ]
}

/**
 * 渲染工程日历页。
 * @param props.t - 命名空间翻译函数。
 */
export function ProjectCalendar({ t }: { readonly t: WorkbenchT }) {
  const [view, setView] = useState<ViewMode>('month')
  const today = useMemo(() => new Date(), [])
  // 锚点日期：月视图围绕它渲染；年视图用它取年份。
  const [anchor, setAnchor] = useState(today)
  const [items, setItems] = useState<CalendarItem[]>(loadLocalItems)
  const [realItems, setRealItems] = useState<CalendarItem[]>([])
  const [form, setForm] = useState<FormState>(undefined)
  const [draft, setDraft] = useState({ title: '', date: '', time: '', taskId: '', status: 'pending' as CalendarStatus })

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

  /** 按日历视图平移锚点（月 / 年）。 */
  const shift = (direction: 1 | -1) => {
    const next = new Date(anchor)
    if (view === 'month') next.setMonth(next.getMonth() + direction)
    else next.setFullYear(next.getFullYear() + direction)
    setAnchor(next)
  }

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
        .catch(() => ({ ok: false as const, message: '' }))
      if (result.ok) reloadReal(controller.signal)
    })()
  }

  const removeItem = () => {
    if (form?.kind !== 'edit') return
    setItems(list => list.filter(item => item.id !== form.id))
    setForm(undefined)
  }

  /** 任务选项：来自工作台固定演示任务，label 已本地化。 */
  const taskOptions = useMemo(() => (Object.keys(taskTitles) as TaskId[]).map(id => ({
    id,
    label: t(taskTitles[id]),
  })), [t])

  /** 月视图的 42 个格子（周一开头）。 */
  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const offset = (first.getDay() + 6) % 7
    const start = new Date(first)
    start.setDate(start.getDate() - offset)
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return { iso: isoOf(date), date, inMonth: date.getMonth() === anchor.getMonth() }
    })
  }, [anchor])

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of allItems) {
      const list = map.get(item.date) ?? []
      map.set(item.date, [...list, item])
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    }
    return map
  }, [allItems])

  const todayIso = isoOf(today)
  // 右侧「当天安排」聚焦的日期（默认今天；点击日历格切换）。
  const [selectedIso, setSelectedIso] = useState(todayIso)

  /** 日历头部标题文案。 */
  const periodTitle = view === 'month'
    ? t('calendar.periodTitle', { year: String(anchor.getFullYear()), month: String(anchor.getMonth() + 1) })
    : t('calendar.yearTitle', { year: String(anchor.getFullYear()) })

  const doneCount = items.filter(item => item.status === 'completed').length

  /** 渲染单日的事项 chips。 */
  const renderChips = (iso: string, compact: boolean) => {
    const dayItems = itemsByDate.get(iso) ?? []
    const visible = compact ? dayItems.slice(0, 2) : dayItems.slice(0, 4)
    return <>
      {visible.map(item => (
        <button
          key={item.id}
          type="button"
          className={`${css.chip} ${css[`status${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`] ?? ''} ${item.readonly ? css.chipReal : ''}`}
          onClick={(event) => {
            event.stopPropagation()
            openEdit(item)
          }}
          title={`${item.time ?? ''} ${item.title}`}
        >
          {item.time !== undefined && <small>{item.time}</small>}
          <span>{item.title}</span>
        </button>
      ))}
      {dayItems.length > visible.length && <span className={css.more}>{t('calendar.more', { count: String(dayItems.length - visible.length) })}</span>}
    </>
  }

  return <div className={css.screen}>
    {/* 页头：标题在左，视角切换（仅月 / 年）在右。 */}
    <div className={css.topbar}>
      <h2 className={css.pageTitle}>{t('nav.calendar')}</h2>
      <div className={css.headerActions}>
        {(['month', 'year'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            className={view === mode ? css.viewButtonActive : css.viewButton}
            onClick={() => { setView(mode) }}
            aria-pressed={view === mode}
          >
            {t(`calendar.view.${mode}`)}
          </button>
        ))}
      </div>
    </div>

    <div className={css.layout}>
      <div className={css.main}>
        {/* 周期导航：‹ 标题 › + 今天。 */}
        <div className={css.toolbar}>
          <div className={css.navGroup}>
            <button type="button" className={css.navArrow} aria-label={t('calendar.prev')} onClick={() => { shift(-1) }}>‹</button>
            <h2 className={css.periodTitle}>{periodTitle}</h2>
            <button type="button" className={css.navArrow} aria-label={t('calendar.next')} onClick={() => { shift(1) }}>›</button>
          </div>
          <Button variant="outline" onClick={() => { setAnchor(new Date()); setSelectedIso(todayIso) }}>{t('calendar.today')}</Button>
        </div>

        {/* 月视图：大日历网格。 */}
        {view === 'month' && <div className={css.monthGrid} role="grid" aria-label={periodTitle}>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={`wd-${index}`} className={css.weekday}>{t(WEEKDAYS[index] ?? 'week.0')}</div>
          ))}
          {monthCells.map(cell => (
            <div
              key={cell.iso}
              className={[
                css.dayCell,
                cell.inMonth ? '' : css.dayOutside,
                cell.iso === selectedIso ? css.daySelected : '',
                cell.iso === todayIso ? css.dayToday : '',
              ].filter(Boolean).join(' ')}
              onClick={() => { setSelectedIso(cell.iso) }}
            >
              <div className={css.dayHead}>
                <span className={css.dayNumber}>{cell.date.getDate()}</span>
                <button
                  type="button"
                  className={css.dayAdd}
                  aria-label={t('calendar.addOn', { date: cell.iso })}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedIso(cell.iso)
                    openAdd(cell.iso)
                  }}
                >+</button>
              </div>
              <div className={css.chipList}>{renderChips(cell.iso, false)}</div>
            </div>
          ))}
        </div>}

        {/* 年视图：12 个迷你月历。 */}
        {view === 'year' && <div className={css.yearGrid} aria-label={periodTitle}>
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const first = new Date(anchor.getFullYear(), monthIndex, 1)
            const offset = (first.getDay() + 6) % 7
            const dayCount = new Date(anchor.getFullYear(), monthIndex + 1, 0).getDate()
            return <div key={monthIndex} className={css.miniMonth}>
              <button type="button" className={css.miniTitle} onClick={() => {
                setAnchor(new Date(anchor.getFullYear(), monthIndex, 1))
                setView('month')
              }}>
                {t('calendar.miniTitle', { month: String(monthIndex + 1) })}
              </button>
              <div className={css.miniGrid}>
                {Array.from({ length: offset }, (_, padIndex) => <span key={`pad-${padIndex}`} />)}
                {Array.from({ length: dayCount }, (_, dayIndex) => {
                  const iso = isoOf(new Date(anchor.getFullYear(), monthIndex, dayIndex + 1))
                  const count = itemsByDate.get(iso)?.length ?? 0
                  return <span
                    key={iso}
                    className={`${css.miniDay} ${count > 0 ? css.miniDayBusy : ''} ${iso === todayIso ? css.miniDayToday : ''}`}
                  >
                    {dayIndex + 1}
                  </span>
                })}
              </div>
            </div>
          })}
        </div>}
      </div>

      {/* 右侧栏：当天安排 + 我的日历。 */}
      <aside className={css.aside}>
        <section className={css.asideCard} aria-label={t('calendar.planTitle')}>
          <div className={css.asideHead}>
            <div>
              <small className={css.asideDate}>{selectedIso}</small>
              <h3>{t('calendar.planTitle')}</h3>
            </div>
            <button
              type="button"
              className={css.asideAdd}
              aria-label={t('calendar.addOn', { date: selectedIso })}
              onClick={() => { openAdd(selectedIso) }}
            >+</button>
          </div>
          {(itemsByDate.get(selectedIso) ?? []).length === 0
            ? <div className={css.asideEmpty}>
              <span aria-hidden>◦ ◦ ◦</span>
              <p>{t('calendar.planEmpty')}</p>
            </div>
            : <ul className={css.planList}>
              {(itemsByDate.get(selectedIso) ?? []).map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${css.planRow} ${item.status === 'completed' ? css.planDone : ''} ${item.readonly ? css.planReadonly : ''}`}
                    onClick={() => { openEdit(item) }}
                  >
                    <span className={`${css.planDot} ${css[`dot${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`] ?? ''}`} aria-hidden />
                    {item.time !== undefined && <small>{item.time}</small>}
                    <span className={css.planTitleText}>{item.title}</span>
                  </button>
                </li>
              ))}
            </ul>}
        </section>

        <section className={css.asideCard} aria-label={t('calendar.myCalendars')}>
          <h3>{t('calendar.myCalendars')}</h3>
          <ul className={css.calList}>
            <li>
              <span className={`${css.calDot} ${css.calDotProject}`} aria-hidden />
              <span>{t('calendar.calProject')}</span>
              <span className={css.calTag}>{t('calendar.defaultTag')}</span>
            </li>
            {realItems.length > 0 && <li>
              <span className={`${css.calDot} ${css.calDotReal}`} aria-hidden />
              <span>{t('calendar.calReal')}</span>
            </li>}
          </ul>
          <p className={css.summary}>{t('calendar.summary', { total: String(allItems.length), done: String(doneCount) })}</p>
        </section>
      </aside>
    </div>

    {/* 新增 / 编辑事项弹窗（共享 Modal：可拖动、遮罩压暗）。 */}
    {form !== undefined && <Modal
      open
      title={form.kind === 'add' ? t('calendar.formAdd') : t('calendar.formEdit')}
      closeLabel={t('close')}
      onClose={() => { setForm(undefined) }}
      footer={<>
        {form.kind === 'edit' && <Button variant="outline" onClick={() => { removeItem() }}>{t('calendar.remove')}</Button>}
        <Button variant="primary" onClick={() => { saveItem() }}>{t('calendar.save')}</Button>
        <Button onClick={() => { setForm(undefined) }}>{t('cancel')}</Button>
      </>}
    >
      <label className={css.formRow}>
        <span>{t('calendar.title')}</span>
        <Input value={draft.title} onChange={(event) => { setDraft({ ...draft, title: event.target.value }) }} />
      </label>
      <label className={css.formRow}>
        <span>{t('calendar.fieldDate')}</span>
        <input type="date" className={css.nativeInput} value={draft.date}
          onChange={(event) => { setDraft({ ...draft, date: event.target.value }) }} />
      </label>
      <label className={css.formRow}>
        <span>{t('calendar.fieldTime')}</span>
        <input type="time" className={css.nativeInput} value={draft.time}
          onChange={(event) => { setDraft({ ...draft, time: event.target.value }) }} />
      </label>
      <label className={css.formRow}>
        <span>{t('calendar.fieldStatus')}</span>
        <select className={css.nativeInput} value={draft.status}
          onChange={(event) => { setDraft({ ...draft, status: event.target.value as CalendarStatus }) }}>
          {STATUSES.map(status => <option key={status} value={status}>{t(`calendar.status.${status}`)}</option>)}
        </select>
      </label>
      <label className={css.formRow}>
        <span>{t('calendar.fieldTask')}</span>
        <select className={css.nativeInput} value={draft.taskId}
          onChange={(event) => { setDraft({ ...draft, taskId: event.target.value }) }}>
          <option value="">{t('calendar.taskNone')}</option>
          {taskOptions.map(option => <option key={option.id} value={String(option.id)}>{option.label}</option>)}
        </select>
      </label>
    </Modal>}
  </div>
}
