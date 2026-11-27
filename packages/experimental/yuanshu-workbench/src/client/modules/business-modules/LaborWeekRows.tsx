/**
 * 展示一周七天的工时、类型、状态和项目比例分配控件。
 * 仅接收视图数据与回调，不保存状态或发起请求。
 */
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { RegistrationProject } from './project-registration-model.ts'
import type { completionStatuses, laborTypes } from './project-registration-viewmodel.ts'
import css from './project-registration.module.css'

/** 每日工时在项目间的分配。 */
export interface LaborProjectAllocation {
  readonly key: string
  readonly projectCode: string
  readonly ratio: string
  readonly workType: string
  readonly completionStatus: string
  readonly recordId?: number
  readonly description: string
  readonly isLast?: boolean
}

/** 周视图中一天的可编辑内容。 */
export interface LaborDayDraft {
  readonly key: string
  readonly date: string
  readonly hours: string
  readonly allocations: readonly LaborProjectAllocation[]
}

/** 渲染日期工时与项目比例分配。 */
export function LaborWeekRows({ days, projects, busy, t, workTypes, statuses, onChange }: {
  readonly days: readonly LaborDayDraft[]
  readonly projects: readonly RegistrationProject[]
  readonly busy: boolean
  readonly t: WorkbenchT
  readonly workTypes: typeof laborTypes
  readonly statuses: typeof completionStatuses
  readonly onChange: (key: string, patch: Partial<LaborDayDraft>) => void
}) {
  const updateAllocation = (day: LaborDayDraft, allocationKey: string, field: 'projectCode' | 'ratio' | 'workType' | 'completionStatus', value: string) => {
    onChange(day.key, { allocations: day.allocations.map(item => item.key === allocationKey ? { ...item, [field]: value } : item) })
  }
  return <div className={css.weekRows}>
    <div className={css.weekRowHeader}><span>{t('labor.work_date')}</span><span>{t('labor.hours')}</span><span>{t('labor.projectSplit')}</span></div>
    {days.map((day, index) => <div className={css.weekRow} key={day.key} data-weekend={index > 4}>
      <span>{t(`labor.day.${(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[index] ?? 'mon'}`)} {day.date.slice(5)}</span>
      <Input aria-label={t('labor.hours')} inputMode="decimal" placeholder={index > 4 ? t('labor.rest') : undefined} value={day.hours} disabled={busy} onChange={(event) => { onChange(day.key, { hours: event.currentTarget.value }) }} />
      <div className={css.projectAllocations}>
        <div className={css.projectAllocationHeader}><span>{t('labor.project')}</span><span>{t('labor.splitRatio')}</span><span /><span>{t('labor.work_type')}</span><span>{t('labor.completion_status')}</span><span /></div>
        {day.allocations.map(allocation => <div className={css.projectAllocation} key={allocation.key}>
          <select aria-label={t('labor.project')} value={allocation.projectCode} disabled={busy} onChange={(event) => { updateAllocation(day, allocation.key, 'projectCode', event.currentTarget.value) }}>
            <option value="">{t('registration.selectProject')}</option>{projects.map(project => <option key={project.code} value={project.code} disabled={day.allocations.some(item => item.key !== allocation.key && item.projectCode === project.code)}>{project.code} {project.name}</option>)}
          </select>
          <Input aria-label={t('labor.splitRatio')} inputMode="decimal" value={allocation.ratio} disabled={busy} onChange={(event) => { updateAllocation(day, allocation.key, 'ratio', event.currentTarget.value) }} />
          <span>%</span>
          <select aria-label={t('labor.work_type')} value={allocation.workType} disabled={busy} onChange={(event) => { updateAllocation(day, allocation.key, 'workType', event.currentTarget.value) }}>{workTypes.map(value => <option key={value} value={value}>{t(`labor.${value}`)}</option>)}</select>
          <select aria-label={t('labor.completion_status')} value={allocation.completionStatus} disabled={busy} onChange={(event) => { updateAllocation(day, allocation.key, 'completionStatus', event.currentTarget.value) }}>{statuses.map(value => <option key={value} value={value}>{t(`labor.completion.${value}`)}</option>)}</select>
          <Button variant="outline" size="sm" disabled={busy} aria-label={t('labor.removeProject')} onClick={() => { onChange(day.key, { allocations: day.allocations.filter(item => item.key !== allocation.key) }) }}>−</Button>
        </div>)}
        <Button variant="outline" size="sm" disabled={busy || projects.length === 0} onClick={() => { onChange(day.key, { allocations: [...day.allocations, { key: `${day.date}-${Date.now()}`, projectCode: '', ratio: '', workType: workTypes[0], completionStatus: statuses[0], description: '' }] }) }}>{t('labor.addProject')}</Button>
      </div>
    </div>)}
  </div>
}
