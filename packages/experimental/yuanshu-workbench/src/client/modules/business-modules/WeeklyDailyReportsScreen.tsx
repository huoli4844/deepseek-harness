/** 编排日报和周报的显示模式；两种日历共用月份与所选日期，不执行后台写入。 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { beijingDate } from './project-registration-viewmodel.ts'
import { WeeklyReportCalendar } from './WeeklyReportCalendar.tsx'
import { DailyReportCalendar } from './DailyReportCalendar.tsx'
import css from './report-calendar.module.css'

/** 日报/周报模式胶囊：样式与日程日历页的视角切换按钮一致。 */
function modeSwitcher(mode: 'daily' | 'weekly', setMode: (mode: 'daily' | 'weekly') => void, t: WorkbenchT): ReactNode {
  return <div className={css.modeGroup} role="group" aria-label={t('reportCalendar.mode')}>
    {(['daily', 'weekly'] as const).map(name => (
      <button key={name} type="button" className={mode === name ? css.modeButtonActive : css.modeButton}
        aria-pressed={mode === name} onClick={() => { setMode(name) }}>
        {t(name === 'daily' ? 'reportCalendar.daily' : 'reportCalendar.weekly')}
      </button>
    ))}
  </div>
}

/** 切换报告模式时保留月份和日期，仅改变日历的查询与选中粒度。 */
export function WeeklyDailyReportsScreen({ t }: { readonly t: WorkbenchT; readonly role?: string | undefined }) {
  const today = beijingDate()
  const [mode, setMode] = useState<'daily' | 'weekly'>('weekly')
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [date, setDate] = useState(() => today)
  const goMonth = (next: string) => {
    setMonth(next)
    setDate(next === today.slice(0, 7) ? today : `${next}-01`)
  }
  const props = { t, month, date, onMonth: goMonth, onDate: setDate }
  const switcher = modeSwitcher(mode, setMode, t)
  // 切换按钮渲染在日历头部右上角，不单独占用一行。
  return mode === 'weekly'
    ? <WeeklyReportCalendar {...props} modeSwitcher={switcher} />
    : <DailyReportCalendar {...props} modeSwitcher={switcher} />
}
