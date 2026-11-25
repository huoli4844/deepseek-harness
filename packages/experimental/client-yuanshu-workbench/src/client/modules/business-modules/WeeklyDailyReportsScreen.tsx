/** 编排周报日期选择与登记。 */
import { useCallback, useMemo, useState } from 'react'
import { Button, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { AccessRole } from './access-role.ts'
import { WeeklyReportEditor } from './WeeklyReportEditor.tsx'
import type { WeeklyDraft, WeeklySnapshot } from './project-registration-model.ts'
import { beijingDate, moveDate, weekStart } from './project-registration-viewmodel.ts'
import { WeeklyOverview, type WeeklyReportActions } from './WeeklyOverview.tsx'
import type { WeeklyItemsSummary } from './weekly-items-model.ts'
import { weeksInMonth } from './weekly-items-viewmodel.ts'
import { parseCompletedRows, parseRiskRows } from './weekly-report-rows.ts'
import css from './project-registration.module.css'

const blankDraft: WeeklyDraft = { progress_summary: '', completed_work: '', planned_work: '', issues_and_risks: '', need_support: '' }

/** 计算自然周起始日对应的 ISO 周次，用于周选择文案。 */
function isoWeek(start: string): number {
  const date = new Date(`${start}T00:00:00Z`)
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 3)
  const januaryFourth = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4))
  const firstThursday = new Date(januaryFourth)
  firstThursday.setUTCDate(januaryFourth.getUTCDate() + 3 - (januaryFourth.getUTCDay() + 6) % 7)
  return Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000)) + 1
}

/** 按案例版式展示周报内容与提交前概览。 */
export function WeeklyDailyReportsScreen({ t, role }: {
  readonly t: WorkbenchT
  readonly role?: AccessRole | undefined
}) {
  const [selected, setSelected] = useState(() => ({ month: beijingDate().slice(0, 7), start: weekStart(beijingDate()) }))
  const [busy, setBusy] = useState(false)
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>()
  const [draft, setDraft] = useState<WeeklyDraft>(blankDraft)
  const [actions, setActions] = useState<WeeklyReportActions>()
  const onActions = useCallback((value: WeeklyReportActions | undefined) => { setActions(value) }, [])
  // 概览直接汇总表单里的完成事项，保证编辑时实时联动。
  const summary = useMemo<WeeklyItemsSummary>(() => {
    const rows = parseCompletedRows(draft.completed_work)
    const byProject = new Map<string, number>()
    for (const row of rows) {
      const name = row.project_name || row.project_code
      if (name) byProject.set(name, (byProject.get(name) ?? 0) + 1)
    }
    return {
      total: rows.length,
      completed: rows.filter(row => row.completion_status === 'completed').length,
      inProgress: rows.filter(row => row.completion_status === 'in_progress').length,
      risks: parseRiskRows(draft.issues_and_risks).length,
      byProject: [...byProject].map(([name, count]) => ({ name, count })),
    }
  }, [draft.completed_work, draft.issues_and_risks])
  const weeks = weeksInMonth(selected.month)
  const start = selected.start
  const status = snapshot?.report?.status === 'submitted' ? 'submitted' : 'draft'
  return <div className={`${css.screen} ${css.weeklyScreen}`}>
    <header className={css.weeklyTopbar}>
      <div className={css.weeklyHeaderLeft}>
        <div className={css.weeklyTitleRow}>
          <h1 className={css.weeklyTitle}>{t('weekly.title')}</h1>
          {role === 'employee' && <span className={css.viewRole}>{t('weekly.view.employee')}</span>}
        </div>
        <p className={css.weeklySubtitle}>{t('weekly.subtitle')}</p>
      </div>
      <div className={css.weeklyHeaderRight}>
        <label className={css.weeklyMonth}>{t('weekly.month')}
          <Input type="month" value={selected.month} disabled={busy} onChange={(event) => {
            const month = event.currentTarget.value
            if (/^\d{4}-\d{2}$/u.test(month)) {
              const first = weeksInMonth(month)[0]
              if (first) setSelected({ month, start: first })
            }
          }} />
        </label>
        <div className={css.weeklyWeekBar}>
          <Button size="sm" variant="toolbar" icon={<IconChevronLeftOutlineRegular size={16} />}
            aria-label={t('weekly.previousWeek')} disabled={busy}
            onClick={() => { const previous = moveDate(start, -7); setSelected({ month: previous.slice(0, 7), start: previous }) }} />
          <select className={css.weeklyWeekSelect} disabled={busy} value={start} aria-label={t('weekly.week')} onChange={(event) => {
            const value = event.currentTarget.value
            setSelected(previous => ({ ...previous, start: value }))
          }}>
            {weeks.map(week => <option key={week} value={week}>
              {t('weekly.weekOption', { number: isoWeek(week), start: week, end: moveDate(week, 6) })}
            </option>)}
          </select>
          <Button size="sm" variant="toolbar" icon={<IconChevronRightOutlineRegular size={16} />}
            aria-label={t('weekly.nextWeek')} disabled={busy}
            onClick={() => { const next = moveDate(start, 7); setSelected({ month: next.slice(0, 7), start: next }) }} />
          <span className={css.weeklyStatusTag} data-status={status}>
            {t(status === 'submitted' ? 'registration.submitted' : 'registration.draft')}
          </span>
        </div>
      </div>
    </header>
    <div className={css.weeklyLayout}>
      <main className={css.weeklyMain}>
        <WeeklyReportEditor start={start} role={role}
          t={t} onBusy={setBusy} onSnapshot={setSnapshot} onDraft={setDraft} onActions={onActions} />
      </main>
      <WeeklyOverview snapshot={snapshot} summary={summary} draft={draft} actions={actions} t={t} />    </div>
  </div>
}
