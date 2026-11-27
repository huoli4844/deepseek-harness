/** 周报日历：按月展示每周状态，点选整周查看后台返回的周报，不提供新增与编辑。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { loadWeekly } from './project-registration-api.ts'
import type { WeeklySnapshot } from './project-registration-model.ts'
import { beijingDate, moveDate, weekStart } from './project-registration-viewmodel.ts'
import { weeksInMonth } from './weekly-items-viewmodel.ts'
import { parseCompletedRows, parsePlanRows, parseRiskRows } from './weekly-report-rows.ts'
import css from './project-registration.module.css'

/** 一周从周一开始，与后台自然周保持一致。 */
const WEEKDAYS = ['week.0', 'week.1', 'week.2', 'week.3', 'week.4', 'week.5', 'week.6'] as const

/** 单周加载结果。 */
interface WeekLoad {
  readonly state: 'loading' | 'ready' | 'error'
  readonly snapshot?: WeeklySnapshot
}

/** 周状态：后台没有该周记录时为未填写。 */
type WeekStatus = 'submitted' | 'draft' | 'missing'

/** 计算自然周起始日对应的 ISO 周次，用于周标题。 */
function isoWeek(start: string): number {
  const date = new Date(`${start}T00:00:00Z`)
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 3)
  const januaryFourth = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const firstThursday = new Date(januaryFourth)
  firstThursday.setUTCDate(januaryFourth.getUTCDate() + 3 - (januaryFourth.getUTCDay() + 6) % 7)
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) + 1
}

/** 月份加减，返回 yyyy-MM。 */
function moveMonth(month: string, delta: number): string {
  const [year = 1970, value = 1] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** 读取单周快照的周报状态。 */
function weekStatus(snapshot: WeeklySnapshot | undefined): WeekStatus {
  const report = snapshot?.report
  if (report === undefined) return 'missing'
  return report.status === 'submitted' ? 'submitted' : 'draft'
}

/** 周状态文案。 */
function statusLabel(status: WeekStatus, t: WorkbenchT): string {
  return t(status === 'submitted' ? 'registration.submitted'
    : status === 'draft' ? 'registration.draft' : 'weekly.statusMissing')
}

/** 生成整周周报的 tooltip 文本（多行），悬停时直接显示在日历行上。 */
function weekTooltip(week: string, load: WeekLoad | undefined, t: WorkbenchT): string {
  const header = t('weekly.weekTooltip', {
    number: String(isoWeek(week)),
    start: week,
    end: moveDate(week, 6),
    status: load === undefined || load.state === 'loading'
      ? t('registration.loading')
      : load.state === 'error' ? t('registration.loadError') : statusLabel(weekStatus(load.snapshot), t),
  })
  const report = load?.state === 'ready' ? load.snapshot?.report : undefined
  if (report === undefined) return [header, t('weekly.noReport')].join('\n')
  const lines: string[] = [header]
  if (report.submitted_at !== undefined) {
    lines.push(t('weekly.submittedAt', { time: report.submitted_at.slice(0, 16).replace('T', ' ') }))
  }
  if (report.progress_summary.trim() !== '') {
    lines.push(t('weekly.progress_summary'), report.progress_summary.trim())
  }
  const completed = parseCompletedRows(report.completed_work)
  if (completed.length > 0) {
    lines.push(t('weekly.completed_work'))
    for (const row of completed) {
      const project = row.project_name || row.project_code
      lines.push(`- ${row.description || t('weekly.itemDescription')}${project === '' ? '' : ` [${project}]`}`)
    }
  }
  const plans = parsePlanRows(report.planned_work)
  if (plans.length > 0) {
    lines.push(t('weekly.planned_work'))
    for (const row of plans) {
      const project = row.project_name || row.project_code
      lines.push(`- ${row.description || t('weekly.itemDescription')}${project === '' ? '' : ` [${project}]`}`)
    }
  }
  const risks = parseRiskRows(report.issues_and_risks)
  if (risks.length > 0) {
    lines.push(t('weekly.issues_and_risks'))
    for (const row of risks) lines.push(`- ${row.description}${row.impact === '' ? '' : ` [${row.impact}]`}`)
  }
  if (report.need_support.trim() !== '') {
    lines.push(t('weekly.need_support'), report.need_support.trim())
  }
  if (lines.length === 1) lines.push(t('weekly.emptyContent'))
  return lines.join('\n')
}

/** 周报日历页面：月份导航、按周状态日历与选中周的只读周报。 */
export function WeeklyDailyReportsScreen({ t }: {
  readonly t: WorkbenchT
  readonly role?: string | undefined
}) {
  const today = beijingDate()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [selected, setSelected] = useState(() => weekStart(today))
  const [loads, setLoads] = useState<Record<string, WeekLoad>>({})
  const loadsRef = useRef(loads)
  loadsRef.current = loads
  const weeks = useMemo(() => weeksInMonth(month), [month])
  /** 每周一行，周一至周日；空白月外日期由同月相邻周补齐。 */
  const rows = useMemo(() => weeks.map(week => Array.from({ length: 7 }, (_, index) => moveDate(week, index))), [weeks])
  // 只为当前月份中尚未加载的周取数据；每自然周调用一次周报接口（无列表接口）。
  useEffect(() => {
    const targets = weeks.filter(week => loadsRef.current[week] === undefined)
    if (targets.length === 0) return
    const controller = new AbortController()
    setLoads((previous) => {
      const next = { ...previous }
      for (const week of targets) next[week] = { state: 'loading' }
      return next
    })
    for (const week of targets) {
      void loadWeekly(week, controller.signal).then((snapshot) => {
        if (controller.signal.aborted) return
        setLoads(previous => ({ ...previous, [week]: { state: 'ready', snapshot } }))
      }).catch(() => {
        if (controller.signal.aborted) return
        setLoads(previous => ({ ...previous, [week]: { state: 'error' } }))
      })
    }
    return () => { controller.abort() }
  }, [weeks])
  const goMonth = (next: string): void => {
    setMonth(next)
    const first = weeksInMonth(next)[0]
    setSelected(next === today.slice(0, 7) ? weekStart(today) : first ?? weekStart(`${next}-01`))
  }
  return <div className={`${css.screen} ${css.weeklyScreen}`}>
    <header className={css.weeklyTopbar}>
      <div className={css.weeklyHeaderLeft}>
        <div className={css.weeklyTitleRow}>
          <h1 className={css.weeklyTitle}>{t('weekly.calendarTitle')}</h1>
        </div>
        <p className={css.weeklySubtitle}>{t('weekly.calendarSubtitle')}</p>
      </div>
    </header>
    <div className={css.weeklyToolbar}>
      <div className={css.weeklyWeekBar}>
        <Button size="sm" variant="toolbar" icon={<IconChevronLeftOutlineRegular size={16} />}
          aria-label={t('weekly.previousMonth')} onClick={() => { goMonth(moveMonth(month, -1)) }} />
        <span className={css.weeklyMonthLabel}>
          {t('weekly.monthLabel', { year: month.slice(0, 4), month: String(Number(month.slice(5))) })}
        </span>
        <Button size="sm" variant="toolbar" icon={<IconChevronRightOutlineRegular size={16} />}
          aria-label={t('weekly.nextMonth')} onClick={() => { goMonth(moveMonth(month, 1)) }} />
      </div>
      <div className={css.weeklyLegend}>
        <span data-status="submitted"><i aria-hidden="true" />{t('registration.submitted')}</span>
        <span data-status="draft"><i aria-hidden="true" />{t('registration.draft')}</span>
        <span data-status="missing"><i aria-hidden="true" />{t('weekly.statusMissing')}</span>
        <Button size="sm" variant="toolbar" onClick={() => { goMonth(today.slice(0, 7)) }}>{t('weekly.today')}</Button>
      </div>
    </div>
    <div className={css.weeklyCalendar}>
      <div className={css.weeklyWeekdays}>
        {WEEKDAYS.map(key => <span key={key}>{t(key)}</span>)}
      </div>
      {rows.map((days, index) => {
        const week = weeks[index] ?? weekStart(days[0] ?? today)
        const load = loads[week]
        const status = load?.state === 'ready' ? weekStatus(load.snapshot) : undefined
        const tooltip = weekTooltip(week, load, t)
        return <div
          key={week}
          className={css.weeklyCalendarRow}
          role="button"
          tabIndex={0}
          aria-pressed={week === selected}
          data-selected={week === selected}
          onClick={() => { setSelected(week) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            setSelected(week)
          }}
        >
          {days.map((day, column) => <div
            key={day}
            className={css.weeklyCalendarCell}
            data-outside={day.slice(0, 7) !== month}
            data-today={day === today}
          >
            <span className={css.weeklyCalendarDay}>{String(Number(day.slice(8, 10)))}</span>
            {column === 0 && status !== undefined && <span className={css.weeklyStatusTag} data-status={status}>
              {statusLabel(status, t)}
            </span>}
          </div>)}
          {/* 悬停卡片在日历行内部渲染，继承工作台当前主题，而不是全局弹层主题。 */}
          <div className={css.weeklyRowTooltip} aria-hidden="true">{tooltip}</div>
        </div>
      })}
    </div>
  </div>
}
