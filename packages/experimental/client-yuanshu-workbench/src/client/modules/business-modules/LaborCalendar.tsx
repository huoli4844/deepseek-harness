/** 显示可选择日期的月历，并按填报情况着色。 */
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { HolidayCalendar } from './holiday-calendar-api.ts'
import { laborDayState, moveDate, shiftMonth, weekStart } from './project-registration-viewmodel.ts'
import type { LaborDayState } from './project-registration-viewmodel.ts'
import css from './daily-labor.module.css'

/** 着色状态的提示文案键；普通日期没有额外文案。 */
const stateLabels = {
  filled: 'labor.calendarFilled', missing: 'labor.calendarMissing', rest: 'labor.calendarRest',
} as const

function dayLabel(day: string, state: LaborDayState, t: WorkbenchT): string {
  if (state === 'filled' || state === 'missing' || state === 'rest') return `${day} · ${t(stateLabels[state])}`
  return day
}

/**
 * 渲染工作日期选取和月份切换。
 *
 * filledDays 为当月已填报日期集合；未加载完成或加载失败时传 undefined，
 * 此时不判断“缺填”，避免误标红。holidays 缺失时只按周末判断，视为降级。
 */
export function LaborCalendar({ date, month, today, filledDays, holidays, disabled, onDate, onMonth, t }: {
  readonly date: string
  readonly month: string
  readonly today: string
  readonly filledDays: ReadonlySet<string> | undefined
  readonly holidays: HolidayCalendar | undefined
  readonly disabled: boolean
  readonly onDate: (value: string) => void
  readonly onMonth: (value: string) => void
  readonly t: WorkbenchT
}) {
  const gridStart = weekStart(`${month}-01`)
  const calendar = { filled: filledDays, rests: holidays?.rests, workdays: holidays?.workdays }
  return <section aria-label={t('labor.calendar')} className={css.calendar}>
    <div className={css.month}>
      <Tooltip label={t('labor.previousMonth')} portal>
        <Button variant="toolbar" size="sm" icon={<IconChevronLeftOutlineRegular size={16} />}
          aria-label={t('labor.previousMonth')} disabled={disabled} onClick={() => { onMonth(shiftMonth(month, -1)) }} />
      </Tooltip>
      <output aria-live="polite">{month}</output>
      <Tooltip label={t('labor.nextMonth')} portal>
        <Button variant="toolbar" size="sm" icon={<IconChevronRightOutlineRegular size={16} />}
          aria-label={t('labor.nextMonth')} disabled={disabled} onClick={() => { onMonth(shiftMonth(month, 1)) }} />
      </Tooltip>
    </div>
    <div className={css.days}>
      {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map(day => <span key={day}>{t(`labor.day.${day}`)}</span>)}
      {Array.from({ length: 42 }, (_, index) => moveDate(gridStart, index)).map(day => {
        const state = laborDayState(day, month, today, calendar)
        return <button type="button" key={day} className={css.day} aria-pressed={day === date}
          data-outside={state === 'outside'} data-state={state} aria-label={dayLabel(day, state, t)} disabled={disabled}
          onClick={() => { onDate(day) }}>{state === 'rest' ? t('labor.calendarRest') : Number(day.slice(8))}</button>
      })}
    </div>
  </section>
}
