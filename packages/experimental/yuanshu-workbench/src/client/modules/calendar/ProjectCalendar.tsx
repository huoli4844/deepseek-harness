/**
 * 工程日历 — 以日历视角看待全局的待办与已完成事项，事项关联项目任务。
 *
 * 默认月视图（大日历），可切换年视角；
 * 支持新增、编辑、删除事项；事项可关联到项目任务。
 * 后台个人日程（/personal/calendar-events）以只读方式并入日历展示；
 * 用户自建事项优先写入后台，写失败（后台契约暂不可用）时降级为本地
 * 保存（localStorage 持久化，刷新不丢）。
 */
import { useMemo, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import type { TaskId } from '../../core/model.ts'
import { isoOf, useCalendarItems, type CalendarItem } from './calendar-shared.ts'
import { CalendarItemForm } from './CalendarItemForm.tsx'
import css from './Calendar.module.css'

type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']

/** 星期文案 key（周一开头，与 `week.*` 文案对应）。 */
const WEEKDAYS: readonly ('week.0' | 'week.1' | 'week.2' | 'week.3' | 'week.4' | 'week.5' | 'week.6')[] = ['week.0', 'week.1', 'week.2', 'week.3', 'week.4', 'week.5', 'week.6']

type ViewMode = 'month' | 'year'

/**
 * 渲染工程日历页。
 * @param props.t - 命名空间翻译函数。
 */
export function ProjectCalendar({ t }: { readonly t: WorkbenchT }) {
  const [view, setView] = useState<ViewMode>('month')
  const today = useMemo(() => new Date(), [])
  // 锚点日期：月视图围绕它渲染；年视图用它取年份。
  const [anchor, setAnchor] = useState(today)
  const { allItems, form, draft, setDraft, openAdd, openEdit, closeForm, saveItem, removeItem } = useCalendarItems()

  /** 按日历视图平移锚点（月 / 年）。 */
  const shift = (direction: 1 | -1) => {
    const next = new Date(anchor)
    if (view === 'month') next.setMonth(next.getMonth() + direction)
    else next.setFullYear(next.getFullYear() + direction)
    setAnchor(next)
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
  // 「当天事项」聚焦的日期（默认今天；点击日历格切换）。
  const [selectedIso, setSelectedIso] = useState(todayIso)

  /** 日历头部标题文案。 */
  const periodTitle = view === 'month'
    ? t('calendar.periodTitle', { year: String(anchor.getFullYear()), month: String(anchor.getMonth() + 1) })
    : t('calendar.yearTitle', { year: String(anchor.getFullYear()) })

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
    <div className={css.layout}>
      <div className={css.main}>
        {/* 周期导航：‹ 标题 › + 视角切换（月 / 年）+ 今天。 */}
        <div className={css.toolbar}>
          <div className={css.navGroup}>
            <button type="button" className={css.navArrow} aria-label={t('calendar.prev')} onClick={() => { shift(-1) }}>‹</button>
            <h2 className={css.periodTitle}>{periodTitle}</h2>
            <button type="button" className={css.navArrow} aria-label={t('calendar.next')} onClick={() => { shift(1) }}>›</button>
          </div>
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
            <Button variant="outline" onClick={() => { setAnchor(new Date()); setSelectedIso(todayIso) }}>{t('calendar.today')}</Button>
          </div>
        </div>

        {/* 月视图：大日历网格。 */}
        {view === 'month' && <div className={css.monthGrid} role="grid" aria-label={periodTitle}>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={`wd-${index}`} className={css.weekday}>{t(WEEKDAYS[index] ?? 'week.0')}</div>
          ))}
          {monthCells.map((cell) => {
            const dayItems = itemsByDate.get(cell.iso) ?? []
            return <div
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
              {/* 悬停 tooltip：鼠标移入日期格时展示当天事项完整列表，移走即消失（pointer-events 穿透不挡点击）。 */}
              {dayItems.length > 0 && <div className={css.dayTooltip} aria-hidden>
                <div className={css.dayTooltipHead}>{cell.iso}</div>
                <ul className={css.dayTooltipList}>
                  {dayItems.map(item => <li key={item.id}>
                    <span className={`${css.planDot} ${css[`dot${item.status.charAt(0).toUpperCase()}${item.status.slice(1)}`] ?? ''}`} aria-hidden />
                    {item.time !== undefined && <small>{item.time}</small>}
                    <span>{item.title}</span>
                  </li>)}
                </ul>
              </div>}
            </div>
          })}
        </div>}

        {/* 年视图：12 个迷你月历。 */}
        {view === 'year' && <div className={css.yearGrid} aria-label={periodTitle}>
          {Array.from({ length: 12 }, (_, monthIndex) => {
            const first = new Date(anchor.getFullYear(), monthIndex, 1)
            const offset = (first.getDay() + 6) % 7
            const dayCount = new Date(anchor.getFullYear(), monthIndex + 1, 0).getDate()
            return <button
              key={monthIndex}
              type="button"
              className={css.miniMonth}
              aria-label={t('calendar.miniTitle', { month: String(monthIndex + 1) })}
              onClick={() => {
                setAnchor(new Date(anchor.getFullYear(), monthIndex, 1))
                setView('month')
              }}
            >
              <span className={css.miniTitle}>{t('calendar.miniTitle', { month: String(monthIndex + 1) })}</span>
              <span className={css.miniGrid}>
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
              </span>
            </button>
          })}
        </div>}
      </div>

    </div>

    <CalendarItemForm
      t={t}
      form={form}
      draft={draft}
      setDraft={setDraft}
      taskOptions={taskOptions}
      onSave={saveItem}
      onRemove={removeItem}
      onClose={closeForm}
    />
  </div>
}
