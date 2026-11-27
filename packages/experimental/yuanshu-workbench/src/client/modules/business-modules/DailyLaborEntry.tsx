/**
 * 按北京时间自然周编辑工时，负责编排周数据加载、保存和提交。
 * 组件只调用项目登记数据层，不直接访问凭据或实现接口协议。
 */
import { useEffect, useRef, useState } from 'react'
import { Button, IconCheckCircleOutlineRegular, IconInfoOutlineRegular, IconWarningTriangleOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { listLaborMonth, saveLaborBatch, submitLabor } from './project-registration-api.ts'
import type { LaborBatchEntry, LaborMonthData } from './project-registration-api.ts'
import type { LaborRecord, RegistrationProject } from './project-registration-model.ts'
import { beijingDate, moveDate, registrationWriteError, validLaborHours, weekStart } from './project-registration-viewmodel.ts'
import { completionStatuses, laborTypes } from './project-registration-viewmodel.ts'
import { LaborWeekRows } from './LaborWeekRows.tsx'
import type { LaborDayDraft } from './LaborWeekRows.tsx'
import css from './project-registration.module.css'

const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
function weekEnd(start: string): string { return moveDate(start, 6) }

function ratioOf(hours: number, total: number): string {
  return total > 0 ? String(Math.round(hours / total * 10000) / 100) : '100'
}

function dayRows(records: readonly LaborRecord[], projects: readonly RegistrationProject[], start: string): readonly LaborDayDraft[] {
  return dayKeys.map((_, index) => {
    const date = moveDate(start, index)
    const existing = records.filter(item => item.work_date === date)
    const total = existing.reduce((sum, item) => sum + Number(item.hours), 0)
    let assignedRatio = 0
    return {
      key: date,
      date,
      hours: total > 0 ? String(Math.round(total * 100) / 100) : '',
      allocations: existing.length === 0 ? [{ key: `project-${date}`, projectCode: '', ratio: '100', workType: 'direct', completionStatus: 'pending', description: '' }] : existing.map((record, recordIndex) => {
        const ratio = recordIndex === existing.length - 1 ? String(100 - assignedRatio) : ratioOf(Number(record.hours), total)
        assignedRatio += Number(ratio)
        return {
          key: `record-${record.id}`,
          projectCode: projects.find(project => project.id === record.project_id)?.code ?? '',
          ratio,
          workType: record.work_type,
          completionStatus: record.completion_status ?? 'pending',
          recordId: record.id,
          description: record.description,
        }
      }),
    }
  })
}

function entriesFromDays(days: readonly LaborDayDraft[]): readonly LaborBatchEntry[] {
  return days.flatMap((day) => {
    if (day.hours === '') return []
    const totalHours = Math.round(Number(day.hours) * 100)
    let assigned = 0
    return day.allocations.map((allocation, index) => {
      const hours = index === day.allocations.length - 1
        ? totalHours - assigned
        : Math.round(totalHours * Number(allocation.ratio) / 100)
      assigned += hours
      return {
        projectCode: allocation.projectCode,
        ...(allocation.recordId === undefined ? {} : { recordId: allocation.recordId }),
        draft: {
          work_date: day.date,
          hours: (hours / 100).toFixed(2),
          work_type: allocation.workType,
          description: allocation.description,
          completion_status: allocation.completionStatus,
        },
      }
    })
  })
}

/** 渲染周工时填报主界面。 */
export function DailyLaborEntry({ t, userId }: { readonly t: WorkbenchT; readonly userId?: number | undefined }) {
  const [week, setWeek] = useState(() => weekStart(beijingDate()))
  const [data, setData] = useState<LaborMonthData>()
  const [days, setDays] = useState<readonly LaborDayDraft[]>(() => dayRows([], [], weekStart(beijingDate())))
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<{ readonly key: Parameters<WorkbenchT>[0]; readonly error?: boolean }>()
  const active = useRef<AbortController>()
  const projects = data?.projects ?? []

  useEffect(() => () => { active.current?.abort() }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setDays(dayRows([], [], week))
    void listLaborMonth({ dateFrom: week, dateTo: weekEnd(week), userId }, controller.signal).then((value) => {
      if (controller.signal.aborted) return
      setData(value)
      setDays(dayRows(value?.records ?? [], value?.projects ?? [], week))
    }).catch(() => { if (!controller.signal.aborted) setNotice({ key: 'registration.loadError', error: true })
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort() }
  }, [week, userId])

  const updateDay = (key: string, patch: Partial<LaborDayDraft>) => {
    setDays(previous => previous.map(day => day.key === key ? { ...day, ...patch } : day))
  }
  const save = (submit: boolean) => {
    const activeDays = days.filter(day => day.hours !== '')
    if (busy) return
    if (activeDays.some(day => !validLaborHours(day.hours))) { setNotice({ key: 'labor.hoursError', error: true }); return }
    if (activeDays.some(day => day.allocations.length === 0 || day.allocations.some(item => !item.projectCode))) {
      setNotice({ key: 'labor.projectRequired', error: true }); return
    }
    const invalidRatio = activeDays.some(day => day.allocations.some(item =>
      !Number.isFinite(Number(item.ratio)) || Number(item.ratio) <= 0 || Number(item.ratio) > 100)
      || Math.abs(day.allocations.reduce((sum, item) => sum + Number(item.ratio || 0), 0) - 100) > 0.0001)
    if (invalidRatio) {
      setNotice({ key: 'labor.ratioTotalError', error: true }); return
    }
    const entries = entriesFromDays(activeDays)
    if (entries.some(entry => !validLaborHours(entry.draft.hours))) { setNotice({ key: 'labor.hoursError', error: true }); return }
    if (entries.length === 0) { setNotice({ key: 'labor.entriesEmpty', error: true }); return }
    const controller = new AbortController()
    active.current = controller; setBusy(true); setNotice(undefined)
    void saveLaborBatch(entries, controller.signal).then(async (savedRecords) => {
      if (submit) for (const [index, record] of savedRecords.entries()) {
        const entry = entries[index]
        if (record.can_submit && entry) await submitLabor(entry.projectCode, record.id, controller.signal)
      }
      if (!controller.signal.aborted) setNotice({ key: submit ? 'registration.submitted' : 'registration.saved' })
    }).catch((error: unknown) => { if (!controller.signal.aborted) setNotice({ key: registrationWriteError(error), error: true })
    }).finally(() => { if (!controller.signal.aborted) { active.current = undefined; setBusy(false) } })
  }
  const total = days.reduce((sum, day) => sum + (Number(day.hours) || 0), 0)
  const blocked = days.reduce((sum, day) => sum + day.allocations.filter(item => day.hours !== '' && item.completionStatus === 'blocked').length, 0)
  // 标准工时暂取 40 小时，用于右栏进度提示，不参与提交校验。
  const standardHours = 40
  const progress = Math.min(100, total / standardHours * 100)

  return <div className={css.weekScreen}>
    <section className={css.weekPanel}>
      <header className={css.weekHeader}><Button variant="toolbar" size="sm" aria-label={t('weekly.previous')} disabled={busy} onClick={() => { setWeek(value => moveDate(value, -7)) }}>‹</Button><strong>{t('weekly.range', { start: week, end: weekEnd(week) })}</strong><Button variant="toolbar" size="sm" aria-label={t('weekly.next')} disabled={busy} onClick={() => { setWeek(value => moveDate(value, 7)) }}>›</Button></header>
      <LaborWeekRows days={days} projects={projects} busy={busy} t={t}
        workTypes={laborTypes} statuses={completionStatuses} onChange={updateDay} />
      {notice && <p role={notice.error ? 'alert' : 'status'}>{t(notice.key)}</p>}{loading && <p role="status">{t('registration.loading')}</p>}
      <div className={css.weekActions}>
        <span className={css.weekActionsTotal}>{t('labor.weekTotal')}<strong>{total.toFixed(2)} {t('labor.hourUnit')}</strong></span>
        <div className={css.weekActionButtons}>
          <Button variant="outline" disabled={busy} onClick={() => { save(false) }}>{t('registration.save')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => { save(true) }}>{t('registration.submit')}</Button>
        </div>
      </div>
    </section>
    <div className={css.weekAside}>
      <aside className={css.weekSummary}>
        <h2>{t('labor.weekSummary')}</h2>
        <p><span>{t('labor.weekTotal')}</span><strong>{total.toFixed(2)} {t('labor.hourUnit')}</strong></p>
        <p><span>{t('labor.standardHours')}</span><strong>{standardHours} {t('labor.hourUnit')}</strong></p>
        <div className={css.weekProgress} aria-hidden="true"><div style={{ width: `${progress}%` }} /></div>
        <p><span>{t('labor.weekRisks')}</span><strong>{blocked}</strong></p>
        <div className={css.weekChart} aria-label={t('labor.weekChart')}>{days.map((day, index) => {
          const hours = Number(day.hours) || 0
          return <div className={css.weekChartBar} key={day.key} data-empty={hours === 0}>
            <em>{hours === 0 ? '—' : hours}</em>
            <div style={{ height: `${total > 0 ? Math.min(100, hours / total * 100) : 0}%` }} />
            <span>{t(`labor.day.${dayKeys[index] ?? 'mon'}`)}</span>
          </div>
        })}</div>
      </aside>
      <aside className={css.syncNotice}>
        <h2>{t('labor.syncTitle')}</h2>
        <p><span className={css.syncInfo}><IconInfoOutlineRegular size={16} aria-hidden="true" /></span>{t('labor.syncSubmitted')}</p>
        <p><span className={css.syncWarning}><IconWarningTriangleOutlineRegular size={16} aria-hidden="true" /></span>{t('labor.syncRisk')}</p>
        <p><span className={css.syncSuccess}><IconCheckCircleOutlineRegular size={16} aria-hidden="true" /></span>{t('labor.syncContract')}</p>
      </aside>
    </div>
  </div>
}
