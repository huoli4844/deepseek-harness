/** 显示周报正文、审计和已批准工时，不访问服务。 */
import { useEffect, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import type { RegistrationProject, RegistrationTask, WeeklyDraft, WeeklyReport, WeeklySnapshot } from './project-registration-model.ts'
import { listProjectTasks, listRegistrationProjects } from './project-registration-api.ts'
import {
  newCompletedRow, newPlanRow, parseCompletedRows, parsePlanRows, parseRiskRows,
  type CompletedRow, type PlanRow, type RiskRow,
} from './weekly-report-rows.ts'
import css from './project-registration.module.css'

const completionStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] as const

/** 渲染事项的项目下拉，选项来自同源项目目录并保留当前选中项。 */
function ProjectSelect({ projectCode, projectName, projects, disabled, t, onSelect }: {
  readonly projectCode: string
  readonly projectName: string
  readonly projects: readonly RegistrationProject[]
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly onSelect: (project: RegistrationProject | undefined) => void
}) {
  const known = projects.some(item => item.code === projectCode)
  return <select value={projectCode} disabled={disabled} onChange={(event) => {
    onSelect(projects.find(item => item.code === event.currentTarget.value))
  }}>
    <option value="">{t('registration.selectProject')}</option>
    {projectCode && !known && <option value={projectCode}>{projectName || projectCode}</option>}
    {projects.map(item => <option key={item.code} value={item.code}>{item.code} {item.name}</option>)}
  </select>
}

/** 按所选项目拉取阶段（任务）下拉，未选项目时禁用。 */
function StageSelect({ projectCode, taskId, taskName, disabled, t, onSelect }: {
  readonly projectCode: string
  readonly taskId: number | undefined
  readonly taskName: string
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly onSelect: (id: number | undefined, name: string) => void
}) {
  const [items, setItems] = useState<readonly RegistrationTask[]>([])
  useEffect(() => {
    setItems([])
    if (!projectCode) return
    const controller = new AbortController()
    void listProjectTasks(projectCode, '', 1, controller.signal).then((value) => {
      if (!controller.signal.aborted) setItems(value.items)
    }).catch(() => {})
    return () => { controller.abort() }
  }, [projectCode])
  return <select value={taskId ?? ''} disabled={disabled || !projectCode} onChange={(event) => {
    const selected = items.find(item => String(item.id) === event.currentTarget.value)
    onSelect(selected?.id, selected?.name ?? '')
  }}>
    <option value="">{projectCode ? t('weekly.selectTask') : t('registration.selectProject')}</option>
    {taskId !== undefined && !items.some(item => item.id === taskId) &&
      <option value={taskId}>{taskName || t('weekly.taskId', { id: taskId })}</option>}
    {items.map(item => <option key={item.id} value={item.id}>{item.code} {item.name}</option>)}
  </select>
}

/** 渲染本周完成工作卡片：每行三个下拉加一段描述，可逐组新增和删除。 */
function CompletedCard({ rows, projects, disabled, t, onChange, onAdd, onRemove }: {
  readonly rows: readonly CompletedRow[]
  readonly projects: readonly RegistrationProject[]
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly onChange: (index: number, row: CompletedRow) => void
  readonly onAdd: () => void
  readonly onRemove: (index: number) => void
}) {
  return <section className={css.weeklyFormCard} aria-label={t('weekly.completedItems')}>
    <header className={css.weeklyCardHeader}>
      <div><h2>{t('weekly.completedItems')}</h2><p>{t('weekly.completedHint')}</p></div>
      <button type="button" className={css.weeklyAdd} disabled={disabled} onClick={onAdd}><span aria-hidden="true">+ </span>{t('weekly.addItem')}</button>
    </header>
    {rows.map((row, index) => <div className={css.weeklyRepeatRow} key={index}>
      <div className={css.weeklyRepeatTop}>
        <span className={css.weeklyItemIndex}>{t('weekly.item', { number: index + 1 })}</span>
        <button type="button" className={css.weeklyItemDelete} disabled={disabled} onClick={() => { onRemove(index) }}>
          × {t('weekly.delete')}
        </button>
      </div>
      <div className={css.weeklyRepeatGrid}>
        <label className={css.field}>{t('registration.project')}
          <ProjectSelect projectCode={row.project_code} projectName={row.project_name} projects={projects}
            disabled={disabled} t={t} onSelect={(project) => {
              onChange(index, { ...row, project_code: project?.code ?? '', project_name: project?.name ?? '', task_id: undefined, task_name: '' })
            }} />
        </label>
        <label className={css.field}>{t('weekly.stage')}
          <StageSelect projectCode={row.project_code} taskId={row.task_id} taskName={row.task_name}
            disabled={disabled} t={t}
            onSelect={(id, name) => { onChange(index, { ...row, task_id: id, task_name: name }) }} />
        </label>
        <label className={css.field}>{t('labor.completion_status')}
          <select value={row.completion_status} disabled={disabled} onChange={(event) => {
            onChange(index, { ...row, completion_status: event.currentTarget.value })
          }}>
            <option value="">{t('weekly.chooseStatus')}</option>
            {completionStatuses.map(status => <option key={status} value={status}>{t(`labor.completion.${status}`)}</option>)}
          </select>
        </label>
      </div>
      <label className={css.field}>{t('weekly.itemDescription')}
        <textarea rows={2} value={row.description} disabled={disabled}
          onChange={(event) => { onChange(index, { ...row, description: event.target.value }) }} />
      </label>
    </div>)}
  </section>
}

/** 渲染下周工作计划卡片，字段布局与本周完成事项一致，第三列为优先级。 */
function PlanCard({ rows, projects, disabled, t, onChange, onAdd, onRemove }: {
  readonly rows: readonly PlanRow[]
  readonly projects: readonly RegistrationProject[]
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly onChange: (index: number, row: PlanRow) => void
  readonly onAdd: () => void
  readonly onRemove: (index: number) => void
}) {
  return <section className={css.weeklyFormCard} aria-label={t('weekly.planned_work')}>
    <header className={css.weeklyCardHeader}>
      <div><h2>{t('weekly.planned_work')}</h2><p>{t('weekly.planHint')}</p></div>
      <button type="button" className={css.weeklyAdd} disabled={disabled} onClick={onAdd}><span aria-hidden="true">+ </span>{t('weekly.addPlan')}</button>
    </header>
    {rows.map((row, index) => <div className={css.weeklyRepeatRow} key={index}>
      <div className={css.weeklyRepeatTop}>
        <span className={css.weeklyItemIndex}>{t('weekly.planItem', { number: index + 1 })}</span>
        <button type="button" className={css.weeklyItemDelete} disabled={disabled} onClick={() => { onRemove(index) }}>
          × {t('weekly.delete')}
        </button>
      </div>
      <div className={css.weeklyRepeatGrid}>
        <label className={css.field}>{t('registration.project')}
          <ProjectSelect projectCode={row.project_code} projectName={row.project_name} projects={projects}
            disabled={disabled} t={t} onSelect={(project) => {
              onChange(index, { ...row, project_code: project?.code ?? '', project_name: project?.name ?? '', task_id: undefined, task_name: '' })
            }} />
        </label>
        <label className={css.field}>{t('weekly.stage')}
          <StageSelect projectCode={row.project_code} taskId={row.task_id} taskName={row.task_name}
            disabled={disabled} t={t}
            onSelect={(id, name) => { onChange(index, { ...row, task_id: id, task_name: name }) }} />
        </label>
        <label className={css.field}>{t('weekly.priority')}
          <select value={row.priority} disabled={disabled} onChange={(event) => {
            const priority = event.currentTarget.value
            if (priority === 'high' || priority === 'mid' || priority === 'low') onChange(index, { ...row, priority })
          }}><option value="high">{t('weekly.priority.high')}</option><option value="mid">{t('weekly.priority.mid')}</option><option value="low">{t('weekly.priority.low')}</option></select>
        </label>
      </div>
      <label className={css.field}>{t('weekly.planContent')}
        <textarea rows={2} value={row.description} disabled={disabled}
          onChange={(event) => { onChange(index, { ...row, description: event.target.value }) }} />
      </label>
    </div>)}
  </section>
}

/** 渲染风险与阻塞卡片，左侧红色竖条强调风险项。 */
function RiskCard({ rows, disabled, t, onChange, onAdd, onRemove }: {
  readonly rows: readonly RiskRow[]
  readonly disabled: boolean
  readonly t: WorkbenchT
  readonly onChange: (index: number, row: RiskRow) => void
  readonly onAdd: () => void
  readonly onRemove: (index: number) => void
}) {
  return <section className={`${css.weeklyFormCard} ${css.weeklyRiskCard}`} aria-label={t('weekly.riskBlock')}>
    <header className={css.weeklyCardHeader}>
      <div><h2>{t('weekly.riskBlock')}</h2><p>{t('weekly.riskHint')}</p></div>
      <button type="button" className={css.weeklyAdd} disabled={disabled} onClick={onAdd}><span aria-hidden="true">+ </span>{t('weekly.addRisk')}</button>
    </header>
    {rows.map((row, index) => <div className={css.weeklyRepeatRow} key={index}>
      <div className={css.weeklyRepeatTop}>
        <span className={css.weeklyItemIndex}>{t('weekly.riskItem', { number: index + 1 })}</span>
        <button type="button" className={css.weeklyItemDelete} disabled={disabled} onClick={() => { onRemove(index) }}>
          × {t('weekly.delete')}
        </button>
      </div>
      <label className={css.field}>{t('weekly.riskDescription')}<textarea rows={2} value={row.description} disabled={disabled} onChange={(event) => { onChange(index, { ...row, description: event.target.value }) }} /></label>
      <div className={css.weeklyRepeatGrid}>
        <label className={css.field}>{t('weekly.impact')}<input value={row.impact} disabled={disabled} onChange={(event) => { onChange(index, { ...row, impact: event.target.value }) }} /></label>
        <label className={css.field}>{t('weekly.support')}<input value={row.support} disabled={disabled} onChange={(event) => { onChange(index, { ...row, support: event.target.value }) }} /></label>
      </div>
    </div>)}
  </section>
}

/** 显示周报正文与审计信息；保存和提交动作由外层右栏统一渲染。 */
export function WeeklyReportForm({ report, draft, busy, t, onField, onFields }: {
  readonly report: WeeklyReport | undefined
  readonly draft: WeeklyDraft
  readonly busy: boolean
  readonly t: WorkbenchT
  readonly onField: (field: keyof WeeklyDraft, value: string) => void
  readonly onFields: (fields: Partial<WeeklyDraft>) => void
}) {
  const submitted = report?.status === 'submitted'
  const disabled = busy || submitted
  const [projects, setProjects] = useState<readonly RegistrationProject[]>([])
  const [completed, setCompleted] = useState<readonly CompletedRow[]>(() => parseCompletedRows(draft.completed_work))
  const [plans, setPlans] = useState<readonly PlanRow[]>(() => parsePlanRows(draft.planned_work))
  const [risks, setRisks] = useState<readonly RiskRow[]>(() => parseRiskRows(draft.issues_and_risks))
  useEffect(() => {
    const controller = new AbortController()
    void listRegistrationProjects('', 1, controller.signal).then((value) => {
      if (!controller.signal.aborted) setProjects(value.items)
    }).catch(() => {})
    return () => { controller.abort() }
  }, [])
  useEffect(() => { setCompleted(parseCompletedRows(draft.completed_work)) }, [draft.completed_work])
  useEffect(() => { setPlans(parsePlanRows(draft.planned_work)) }, [draft.planned_work])
  useEffect(() => { setRisks(parseRiskRows(draft.issues_and_risks)) }, [draft.issues_and_risks])
  const updateCompleted = (next: readonly CompletedRow[]) => {
    setCompleted(next)
    // 摘要由事项描述自动汇总，保证后台提交校验的非空要求仍然满足。
    onFields({
      completed_work: JSON.stringify(next),
      progress_summary: next.map(row => row.description.trim()).filter(Boolean).join('\n'),
    })
  }
  const updatePlans = (next: readonly PlanRow[]) => { setPlans(next); onField('planned_work', JSON.stringify(next)) }
  const updateRisks = (next: readonly RiskRow[]) => { setRisks(next); onField('issues_and_risks', JSON.stringify(next)) }
  return <div className={css.form}>
    <CompletedCard rows={completed} projects={projects} disabled={disabled} t={t}
      onAdd={() => { updateCompleted([...completed, newCompletedRow()]) }}
      onRemove={(index) => { updateCompleted(completed.filter((_, rowIndex) => rowIndex !== index)) }}
      onChange={(index, row) => { updateCompleted(completed.map((current, rowIndex) => rowIndex === index ? row : current)) }} />
    <PlanCard rows={plans} projects={projects} disabled={disabled} t={t}
      onAdd={() => { updatePlans([...plans, newPlanRow()]) }}
      onRemove={(index) => { updatePlans(plans.filter((_, rowIndex) => rowIndex !== index)) }}
      onChange={(index, row) => { updatePlans(plans.map((current, rowIndex) => rowIndex === index ? row : current)) }} />
    <RiskCard rows={risks} disabled={disabled} t={t}
      onAdd={() => { updateRisks([...risks, { description: '', impact: '', support: '' }]) }}
      onRemove={(index) => { updateRisks(risks.filter((_, rowIndex) => rowIndex !== index)) }}
      onChange={(index, row) => { updateRisks(risks.map((current, rowIndex) => rowIndex === index ? row : current)) }} />
    <section className={css.weeklyFormCard} aria-label={t('weekly.otherNotes')}>
      <header><h2>{t('weekly.otherNotes')}</h2><p>{t('weekly.noteHint')}</p></header>
      <label className={css.field}>{t('weekly.need_support')}
        <textarea rows={3} value={draft.need_support} placeholder={t('weekly.noteHint')} readOnly={submitted}
          disabled={busy}
          onChange={(event) => { onField('need_support', event.target.value) }} />
      </label>
    </section>
    <section className={css.weeklyAudit}>
      <dl className={css.meta}>
        <div><dt>{t('registration.status')}</dt><dd>{t(report === undefined ? 'weekly.new' : submitted ? 'registration.submitted' : 'registration.draft')}</dd></div>
        {report && <>
          <div><dt>{t('weekly.createdBy')}</dt><dd>{report.created_by}</dd></div>
          <div><dt>{t('registration.createdAt')}</dt><dd>{formatBeijingDateTime(report.created_at) ?? '—'}</dd></div>
          <div><dt>{t('registration.updatedAt')}</dt><dd>{formatBeijingDateTime(report.updated_at) ?? '—'}</dd></div>
        </>}
        {submitted && <>
          <div><dt>{t('weekly.submittedBy')}</dt><dd>{report.submitted_by ?? '—'}</dd></div>
          <div><dt>{t('registration.submittedAt')}</dt><dd>{formatBeijingDateTime(report.submitted_at) ?? '—'}</dd></div>
        </>}
      </dl>
    </section>
  </div>
}

/** 显示本人自然周内已批准工时总数与员工汇总。 */
export function WeeklyWorkSummary({ snapshot, showEmployees, t }: {
  readonly snapshot: WeeklySnapshot
  readonly showEmployees: boolean
  readonly t: WorkbenchT
}) {
  const [sort, setSort] = useState<ArchiveSort>()
  const employees = sort === undefined ? snapshot.employees : [...snapshot.employees].sort((left, right) => {
    const difference = sort.key === 'hours' ? Number(left.hours) - Number(right.hours) : left.user_id - right.user_id
    return sort.direction === 'asc' ? difference : -difference
  })
  return <section className={css.summary} aria-label={t('weekly.labor')}>
    <div className={css.inline}>
      <p>{t('weekly.labor')} <strong>{snapshot.totalHours}</strong></p>
    </div>
    {showEmployees
      ? employees.length === 0 ? <p>{t('weekly.emptyLabor')}</p>
        : <ArchiveTable columns={[{ key: 'user_id', label: t('registration.employee') }, { key: 'hours', label: t('labor.hours') }]}
          rows={employees.map(employee => ({ key: employee.user_id, cells: { user_id: employee.user_id, hours: employee.hours } }))}
          sort={sort} onSort={(key) => {
            setSort(previous => ({ key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc' }))
          }} />
      : <p className={css.hint}>{t('weekly.employeeSummaryRestricted')}</p>}
  </section>
}
