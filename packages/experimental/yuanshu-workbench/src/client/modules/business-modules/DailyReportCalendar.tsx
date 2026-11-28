/** 日报日历：按天显示本人日报状态；只读后台已保存内容，不提供新增与编辑。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { loadCalendarDailyReport, loadDailyCalendar } from './daily-report-calendar-source.ts'
import type { DailyCalendarReport } from './daily-report-calendar-source.ts'
import { beijingDate, moveDate } from './project-registration-viewmodel.ts'
import { isoLunarLabel } from '../../core/lunar.ts'
import { weeksInMonth, moveMonth } from './weekly-items-viewmodel.ts'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import css from './project-registration.module.css'
import dailyCss from './report-calendar.module.css'

/** 一周从周一开始，与周报日历保持一致。 */
const WEEKDAYS = ['week.0', 'week.1', 'week.2', 'week.3', 'week.4', 'week.5', 'week.6'] as const

/** 天状态：后台没有该日记录时为未填写。 */
type DayStatus = 'submitted' | 'draft' | 'missing'

/** 选中日期的日报加载结果。 */
interface ReportLoad {
  readonly state: 'loading' | 'ready' | 'empty' | 'error'
  readonly report?: DailyCalendarReport
}

/** 天状态文案，未填写复用周报文案。 */
function statusLabel(status: DayStatus, t: WorkbenchT): string {
  return t(status === 'submitted' ? 'registration.submitted'
    : status === 'draft' ? 'registration.draft' : 'weekly.statusMissing')
}

/** 把月历返回的天状态整理成按日期索引的映射。 */
function dayIndex(days: readonly { readonly date: string; readonly status: 'draft' | 'submitted' }[]): Record<string, DayStatus> {
  const index: Record<string, DayStatus> = {}
  for (const day of days) index[day.date] = day.status
  return index
}

/** 天格悬停提示：状态行 + 已加载的日报摘要 + 点击引导。 */
function dayTooltip(day: string, status: DayStatus, report: DailyCalendarReport | undefined, t: WorkbenchT): string {
  const lines = [t('dailyCalendar.dayTooltip', { date: day, status: statusLabel(status, t) })]
  if (report !== undefined) {
    if (report.submitted_at !== undefined) {
      lines.push(t('weekly.submittedAt', { time: formatBeijingDateTime(report.submitted_at) ?? '—' }))
    }
    if (report.completed_work.trim() !== '') lines.push(t('dailyCalendar.completed'), report.completed_work.trim())
    if (report.in_progress_work.trim() !== '') lines.push(t('dailyCalendar.inProgress'), report.in_progress_work.trim())
    if (report.planned_work.trim() !== '') lines.push(t('dailyCalendar.planned'), report.planned_work.trim())
  }
  lines.push(t('dailyCalendar.clickHint'))
  return lines.join('\n')
}

/** 选中日期详情面板：状态、提交时间与五段正文；无日报或失败时给出对应文案。 */
function ReportPanel({ date, load, t }: {
  readonly date: string
  readonly load: ReportLoad
  readonly t: WorkbenchT
}) {
  if (load.state === 'loading') return <div className={dailyCss.dailyPanel}>
    <p className={dailyCss.dailyState}>{t('registration.loading')}</p>
  </div>
  if (load.state === 'error') return <div className={dailyCss.dailyPanel}>
    <p className={dailyCss.dailyState} data-tone="error">{t('dailyCalendar.loadError')}</p>
  </div>
  if (load.state === 'empty' || load.report === undefined) return <div className={dailyCss.dailyPanel}>
    <p className={dailyCss.dailyState}>{t('dailyCalendar.noReport')}</p>
  </div>
  const report = load.report
  const sections = [
    { label: t('dailyCalendar.completed'), text: report.completed_work },
    { label: t('dailyCalendar.inProgress'), text: report.in_progress_work },
    { label: t('dailyCalendar.planned'), text: report.planned_work },
    { label: t('weekly.issues_and_risks'), text: report.issues_and_risks },
    { label: t('weekly.need_support'), text: report.need_support },
  ].filter(section => section.text.trim() !== '')
  return <div className={dailyCss.dailyPanel}>
    <div className={dailyCss.dailyPanelHead}>
      <h2 className={dailyCss.dailyPanelTitle}>{date}</h2>
      <span className={css.weeklyStatusTag} data-status={report.status}>{statusLabel(report.status, t)}</span>
      {report.submitted_at !== undefined && <p className={dailyCss.dailyPanelMeta}>
        {t('weekly.submittedAt', { time: formatBeijingDateTime(report.submitted_at) ?? '—' })}
      </p>}
    </div>
    {sections.map(section => <div key={section.label} className={dailyCss.dailySection}>
      <span className={dailyCss.dailySectionLabel}>{section.label}</span>
      <p className={dailyCss.dailySectionText}>{section.text.trim()}</p>
    </div>)}
  </div>
}

/** 日报日历页面：月份导航、按天状态日历与选中日期的只读日报；右上角承载日报/周报切换。 */
export function DailyReportCalendar({ t, month, date, onMonth, onDate, modeSwitcher }: {
  readonly t: WorkbenchT
  readonly month: string
  readonly date: string
  readonly onMonth: (month: string) => void
  readonly onDate: (date: string) => void
  /** 日报/周报切换胶囊，由外层屏注入并渲染在头部右上角。 */
  readonly modeSwitcher?: ReactNode
}) {
  const today = beijingDate()
  const [days, setDays] = useState<Record<string, DayStatus> | undefined>(undefined)
  const [monthError, setMonthError] = useState(false)
  const [load, setLoad] = useState<ReportLoad>({ state: 'loading' })
  /** 悬停天与日报缓存：悬停时异步拉取一次，之后走缓存。 */
  const [hover, setHover] = useState<string | undefined>(undefined)
  const cache = useRef(new Map<string, DailyCalendarReport | null>())
  const rows = useMemo(() => weeksInMonth(month).map(week => Array.from({ length: 7 }, (_, index) => moveDate(week, index))), [month])
  // 月份变化时一次拉取整月日报状态。
  useEffect(() => {
    const controller = new AbortController()
    setDays(undefined)
    setMonthError(false)
    loadDailyCalendar(month, controller.signal).then((list) => {
      if (!controller.signal.aborted) setDays(dayIndex(list))
    }).catch(() => {
      if (!controller.signal.aborted) setMonthError(true)
    })
    return () => { controller.abort() }
  }, [month])
  // 选中日期变化时拉取该日日报详情。
  useEffect(() => {
    const controller = new AbortController()
    setLoad({ state: 'loading' })
    loadCalendarDailyReport(date, controller.signal).then((report) => {
      if (controller.signal.aborted) return
      cache.current.set(date, report)
      setLoad(report === null ? { state: 'empty' } : { state: 'ready', report })
    }).catch(() => {
      if (!controller.signal.aborted) setLoad({ state: 'error' })
    })
    return () => { controller.abort() }
  }, [date])
  // 悬停天预取详情（缓存命中不重复请求），供 tooltip 展示摘要。
  useEffect(() => {
    if (hover === undefined || cache.current.has(hover)) return
    const controller = new AbortController()
    loadCalendarDailyReport(hover, controller.signal).then((report) => {
      if (!controller.signal.aborted) cache.current.set(hover, report)
    }).catch(() => undefined)
    return () => { controller.abort() }
  }, [hover])
  const status = (day: string): DayStatus => days?.[day] ?? 'missing'
  const hoverReport = hover === undefined ? undefined : cache.current.get(hover) ?? undefined
  return <div className={`${css.screen} ${css.weeklyScreen}`}>
    <header className={`${css.weeklyTopbar} ${dailyCss.topbarTop}`}>
      <div className={css.weeklyHeaderLeft}>
        <div className={css.weeklyTitleRow}>
          <h1 className={css.weeklyTitle}>{t('dailyCalendar.title')}</h1>
        </div>
        <p className={css.weeklySubtitle}>{t('dailyCalendar.subtitle')}</p>
      </div>
      {modeSwitcher !== undefined && <div className={css.weeklyHeaderRight}>{modeSwitcher}</div>}
    </header>
    <div className={css.weeklyToolbar}>
      <div className={css.weeklyWeekBar}>
        <Button size="sm" variant="toolbar" icon={<IconChevronLeftOutlineRegular size={16} />}
          aria-label={t('weekly.previousMonth')} onClick={() => { onMonth(moveMonth(month, -1)) }} />
        <span className={css.weeklyMonthLabel}>
          {t('weekly.monthLabel', { year: month.slice(0, 4), month: String(Number(month.slice(5))) })}
        </span>
        <Button size="sm" variant="toolbar" icon={<IconChevronRightOutlineRegular size={16} />}
          aria-label={t('weekly.nextMonth')} onClick={() => { onMonth(moveMonth(month, 1)) }} />
      </div>
      <div className={css.weeklyLegend}>
        <span data-status="submitted"><i aria-hidden="true" />{t('registration.submitted')}</span>
        <span data-status="draft"><i aria-hidden="true" />{t('registration.draft')}</span>
        <span data-status="missing"><i aria-hidden="true" />{t('weekly.statusMissing')}</span>
        <Button size="sm" variant="toolbar" onClick={() => { onMonth(today.slice(0, 7)) }}>{t('weekly.today')}</Button>
      </div>
    </div>
    {monthError && <p className={dailyCss.dailyState} data-tone="error" role="alert">{t('dailyCalendar.loadError')}</p>}
    <div className={`${css.weeklyCalendar} ${dailyCss.dailyCalendar}`}>
      <div className={css.weeklyWeekdays}>
        {WEEKDAYS.map(key => <span key={key}>{t(key)}</span>)}
      </div>
      {rows.map(row => <div key={row[0] ?? month} className={css.weeklyCalendarRow}>
        {row.map(day => <div key={day} className={dailyCss.dailyCell}
          onMouseEnter={() => { setHover(day) }} onMouseLeave={() => { setHover(undefined) }}>
          <div
            className={`${css.weeklyCalendarCell} ${day === date ? dailyCss.dailyCellSelected : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={day === date}
            data-outside={day.slice(0, 7) !== month}
            data-today={day === today}
            data-selected={day === date}
            onClick={() => { onDate(day) }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onDate(day)
            }}
          >
            <span className={css.weeklyCalendarDay}>{String(Number(day.slice(8, 10)))}</span>
            <span className={css.weeklyCalendarLunar}>{isoLunarLabel(day)}</span>
            {status(day) !== 'missing' && <span className={css.weeklyStatusTag} data-status={status(day)}>
              {statusLabel(status(day), t)}
            </span>}
          </div>
          {hover === day && <div className={dailyCss.dailyCellTooltip} aria-hidden="true">
            {dayTooltip(day, status(day), hoverReport, t)}
          </div>}
        </div>)}
      </div>)}
    </div>
    <ReportPanel date={date} load={load} t={t} />
  </div>
}
