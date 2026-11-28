/** 周报日历：按月显示周状态；只读后台已保存内容，不提供新增与编辑。 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { loadWeekly } from './project-registration-api.ts'
import type { WeeklySnapshot } from './project-registration-model.ts'
import { beijingDate, moveDate, weekStart } from './project-registration-viewmodel.ts'
import { isoLunarLabel } from '../../core/lunar.ts'
import { weeksInMonth, moveMonth } from './weekly-items-viewmodel.ts'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import { parseCompletedRows, parsePlanRows, parseRiskRows } from './weekly-report-rows.ts'
import css from './project-registration.module.css'
import dailyCss from './report-calendar.module.css'

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
    lines.push(t('weekly.submittedAt', { time: formatBeijingDateTime(report.submitted_at) ?? '—' }))
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

/** 选中周的只读周报详情面板：周次区间、状态、提交时间与进展/事项/风险/支持五段。 */
function WeekPanel({ week, load, t }: {
  readonly week: string
  readonly load: WeekLoad | undefined
  readonly t: WorkbenchT
}) {
  const head = <div className={dailyCss.dailyPanelHead}>
    <h2 className={dailyCss.dailyPanelTitle}>
      {t('weekly.panelTitle', { number: String(isoWeek(week)), start: week, end: moveDate(week, 6) })}
    </h2>
    {load?.state === 'ready' && <span className={css.weeklyStatusTag} data-status={weekStatus(load.snapshot)}>
      {statusLabel(weekStatus(load.snapshot), t)}
    </span>}
  </div>
  if (load === undefined || load.state === 'loading') return <div className={dailyCss.dailyPanel}>
    {head}
    <p className={dailyCss.dailyState}>{t('registration.loading')}</p>
  </div>
  if (load.state === 'error') return <div className={dailyCss.dailyPanel}>
    {head}
    <p className={dailyCss.dailyState} data-tone="error">{t('registration.loadError')}</p>
  </div>
  const report = load.snapshot?.report
  if (report === undefined) return <div className={dailyCss.dailyPanel}>
    {head}
    <p className={dailyCss.dailyState}>{t('weekly.noReport')}</p>
  </div>
  const itemLines = (rows: readonly { readonly description: string; readonly project_name?: string; readonly project_code?: string }[]) =>
    rows.map((row) => {
      const project = row.project_name || row.project_code
      return `- ${row.description || t('weekly.itemDescription')}${project === undefined || project === '' ? '' : ` [${project}]`}`
    }).join('\n')
  const riskLines = parseRiskRows(report.issues_and_risks)
    .map(row => `- ${row.description}${row.impact === '' ? '' : ` [${row.impact}]`}`).join('\n')
  const sections = [
    { label: t('weekly.progress_summary'), text: report.progress_summary.trim() },
    { label: t('weekly.completed_work'), text: itemLines(parseCompletedRows(report.completed_work)) },
    { label: t('weekly.planned_work'), text: itemLines(parsePlanRows(report.planned_work)) },
    { label: t('weekly.issues_and_risks'), text: riskLines },
    { label: t('weekly.need_support'), text: report.need_support.trim() },
  ].filter(section => section.text.trim() !== '')
  return <div className={dailyCss.dailyPanel}>
    {head}
    {report.submitted_at !== undefined && <p className={dailyCss.dailyPanelMeta}>
      {t('weekly.submittedAt', { time: formatBeijingDateTime(report.submitted_at) ?? '—' })}
    </p>}
    {sections.map(section => <div key={section.label} className={dailyCss.dailySection}>
      <span className={dailyCss.dailySectionLabel}>{section.label}</span>
      <p className={dailyCss.dailySectionText}>{section.text}</p>
    </div>)}
  </div>
}

/** 周报日历页面：月份导航、按周状态日历与选中周的只读周报；右上角承载日报/周报切换。 */
export function WeeklyReportCalendar({ t, month, date, onMonth, onDate, modeSwitcher }: {
  readonly t: WorkbenchT
  readonly month: string
  readonly date: string
  readonly onMonth: (month: string) => void
  readonly onDate: (date: string) => void
  /** 日报/周报切换胶囊，由外层屏注入并渲染在头部右上角。 */
  readonly modeSwitcher?: ReactNode
}) {
  const today = beijingDate()
  const selected = weekStart(date)
  const [loads, setLoads] = useState<Record<string, WeekLoad>>({})
  const weeks = useMemo(() => weeksInMonth(month), [month])
  /** 每周一行，周一至周日；空白月外日期由同月相邻周补齐。 */
  const rows = useMemo(() => weeks.map(week => Array.from({ length: 7 }, (_, index) => moveDate(week, index))), [weeks])
  // 只为当前月份中尚未加载的周取数据；每自然周调用一次周报接口（无列表接口）。
  useEffect(() => {
    const targets = weeks
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
  // 选中周不在当前月历行（如跨月选中）时按需补一次加载。
  useEffect(() => {
    if (loads[selected] !== undefined) return
    const controller = new AbortController()
    void loadWeekly(selected, controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return
      setLoads(previous => ({ ...previous, [selected]: { state: 'ready', snapshot } }))
    }).catch(() => {
      if (controller.signal.aborted) return
      setLoads(previous => ({ ...previous, [selected]: { state: 'error' } }))
    })
    return () => { controller.abort() }
  }, [loads, selected])
  const goMonth = onMonth
  return <div className={`${css.screen} ${css.weeklyScreen}`}>
    <header className={`${css.weeklyTopbar} ${dailyCss.topbarTop}`}>
      <div className={css.weeklyHeaderLeft}>
        <div className={css.weeklyTitleRow}>
          <h1 className={css.weeklyTitle}>{t('weekly.calendarTitle')}</h1>
        </div>
        <p className={css.weeklySubtitle}>{t('weekly.calendarSubtitle')}</p>
      </div>
      {modeSwitcher !== undefined && <div className={css.weeklyHeaderRight}>{modeSwitcher}</div>}
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
          onClick={() => { onDate(week) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onDate(week)
          }}
        >
          {days.map((day, column) => <div
            key={day}
            className={css.weeklyCalendarCell}
            data-outside={day.slice(0, 7) !== month}
            data-today={day === today}
          >
            <span className={css.weeklyCalendarDay}>{String(Number(day.slice(8, 10)))}</span>
            <span className={css.weeklyCalendarLunar}>{isoLunarLabel(day)}</span>
            {column === 0 && status !== undefined && <span className={css.weeklyStatusTag} data-status={status}>
              {statusLabel(status, t)}
            </span>}
          </div>)}
          {/* 悬停卡片在日历行内部渲染，继承工作台当前主题，而不是全局弹层主题。 */}
          <div className={css.weeklyRowTooltip} aria-hidden="true">{tooltip}</div>
        </div>
      })}
    </div>
    <WeekPanel week={selected} load={loads[selected]} t={t} />
  </div>
}
