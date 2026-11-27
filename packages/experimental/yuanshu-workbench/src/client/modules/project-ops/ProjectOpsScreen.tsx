/**
 * 项目穿透（导航项「project-operations」）：项目组合、里程碑、依赖、变更影响、
 * 风险、决策、行动与验收的运营闭环。从 Workbench.tsx 抽离。
 */
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  projectAcceptances, projectActions, projectById, projectChanges, projectDecisions,
  projectDependencies, projectMilestones, projectRecords, projectRisks, projectSchedule,
} from '../../core/data/project-operations.ts'
import { ChangeDemoPanel } from './ChangeDemoPanel.tsx'
import { fixtureChangeId, fixtureDecisionId } from '../../core/data/change-demo.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import css from '../../app/Workbench.module.css'

/** 渲染项目穿透页。 */
export function ProjectOpsScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, selectedProjectId, setSelectedProjectId, projectChangeId, setProjectChangeId,
    setProjectFocusId, decisionChoice, setDecisionChoice, acceptanceEvidence,
    setAcceptanceEvidence, projectRecordStatus, projectRecordStatusLabel, projectStatusLabel,
    assignProjectAction, openScenario, setFeedback, openRoleConversation,
  } = page
  const selectedProject = projectById(selectedProjectId)
  const schedule = projectSchedule(selectedProject.id)
  const selectedMilestones = projectMilestones.filter(item => item.projectId === selectedProject.id)
  const selectedDependencies = projectDependencies.filter(item => item.projectId === selectedProject.id)
  const selectedChanges = projectChanges.filter(item => item.projectId === selectedProject.id)
  const selectedRisks = projectRisks.filter(item => item.projectId === selectedProject.id)
  const selectedDecisions = projectDecisions.filter(item => item.projectId === selectedProject.id)
  const selectedActions = projectActions.filter(item => item.projectId === selectedProject.id)
  const selectedAcceptances = projectAcceptances.filter(item => item.projectId === selectedProject.id)
  const doneActions = selectedActions.filter(item => projectRecordStatus(item.id) === 'done').length
  const acceptanceReady = (item: typeof projectAcceptances[number]) => item.requiredActionIds.every(id => projectRecordStatus(id) === 'done')
  const activeProjectChange = projectChanges.find(item => item.id === projectChangeId)
  return (
    <>
      <section className={css.projectOpsBanner} aria-label={t('project.operations.loop')}>
        <div>
          <p className={css.eyebrow}>{t('project.operations.loop')}</p>
          <strong>{t('project.operations.banner')}</strong>
        </div>
        <span>{t('project.operations.aiBoundary')}</span>
      </section>
      <div className={css.projectOpsMetrics}>
        <div className={css.projectOpsMetric}><small>{t('project.operations.portfolio')}</small><strong>{projectRecords.length}</strong><span>{t('project.operations.portfolioHint')}</span></div>
        <div className={css.projectOpsMetric}><small>{t('project.operations.changes')}</small><strong>{projectChanges.length}</strong><span>{t('project.operations.changesHint')}</span></div>
        <div className={css.projectOpsMetric}><small>{t('project.operations.blockers')}</small><strong>{projectDependencies.filter(item => item.status === 'blocked').length}</strong><span>{t('project.operations.blockersHint')}</span></div>
        <div className={css.projectOpsMetric}><small>{t('project.operations.decisions')}</small><strong>{projectDecisions.filter(item => projectRecordStatus(item.id) !== 'approved').length}</strong><span>{t('project.operations.decisionsHint')}</span></div>
      </div>
      <div className={css.projectOpsLayout}>
        <section className={css.card} aria-label={t('project.operations.portfolio')}>
          <div className={css.sectionHeading}><h2>{t('project.operations.portfolio')}</h2><Tag>{t('count', { count: projectRecords.length })}</Tag></div>
          <div className={css.projectList}>
            {projectRecords.map(project => (
              <button
                key={project.id}
                className={`${css.projectRow} ${selectedProject.id === project.id ? css.projectRowActive : ''}`}
                aria-pressed={selectedProject.id === project.id}
                onClick={() => { setSelectedProjectId(project.id) }}
              >
                <span className={css.grow}>
                  <strong>{t(project.name)}</strong>
                  <small>{t(project.customer)} · {t(project.stage)}</small>
                </span>
                <span className={css.projectProgress}><b>{project.progress}%</b><span className={css.barTrack}><span style={{ width: `${project.progress}%` }} /></span></span>
                <Tag>{projectStatusLabel(project.status)}</Tag>
              </button>
            ))}
          </div>
        </section>
        <section className={css.card} aria-label={t('project.operations.selectedProject')}>
          <div className={css.sectionHeading}><div><p className={css.eyebrow}>{t('project.operations.selectedProject')}</p><h2>{t(selectedProject.name)}</h2></div><Tag>{t(selectedProject.status === 'critical' ? 'project.severity.critical' : selectedProject.status === 'watch' ? 'project.severity.watch' : 'project.severity.healthy')}</Tag></div>
          <div className={css.projectSummaryGrid}>
            <div>
              <small>{t('project.operations.baseline')}</small>
              <strong>{selectedProject.baseline}</strong>
              <span>{t('project.operations.forecast')}: {selectedProject.forecast}</span></div>
            <div>
              <small>{t('project.operations.budget')}</small>
              <strong>{selectedProject.budget}</strong>
              <span>{t('project.operations.spent')}: {selectedProject.spent}</span></div>
          </div>
          <div className={css.projectOpsSection}><div className={css.sectionHeading}><h3>{t('project.operations.milestones')}</h3><Tag>{t('count', { count: selectedMilestones.length })}</Tag></div>{selectedMilestones.map(item => <div className={css.projectDetailRow} key={item.id}><span className={css.grow}><strong>{t(item.name)}</strong><small>{t(`role.${item.owner}`)} · {t(item.deliverable)}</small></span><span>{item.progress}%</span><span className={item.critical ? css.projectCritical : ''}>{item.baseline} → {item.forecast}</span></div>)}</div>
          <div className={css.projectOpsSection}><div className={css.sectionHeading}><h3>{t('project.operations.dependencies')}</h3><Tag>{t('count', { count: selectedDependencies.length })}</Tag></div>{selectedDependencies.map(item => <div className={css.projectDetailRow} key={item.id}><span className={css.grow}><strong>{t(item.predecessor)} → {t(item.successor)}</strong><small>{t(`role.${item.owner}`)} · {t(item.evidence)}</small></span><Tag>{t(`project.dependencyStatus.${item.status}`)}</Tag><span>{item.impactDays ? `+${item.impactDays} ${t('project.operations.days')}` : t('project.operations.noImpact')}</span></div>)}</div>
          <details className={css.projectOpsSection}>
            <summary>{t('project.operations.scheduleComparison', { baseline: schedule.baseline, forecast: schedule.forecast })}</summary>
            {schedule.rows.map(task => (
              <div className={css.projectDetailRow} key={task.id}>
                <strong>{t(task.id)}</strong>
                <span>{t('project.operations.durationDays', { days: task.days })}</span>
                <Tag>{task.float === 0 ? t('project.operations.criticalTask') : t('project.operations.float', { days: task.float })}</Tag>
              </div>
            ))}
          </details>
        </section>
      </div>
      <div className={css.projectOpsGrid}>
        <section className={css.card} aria-label={t('project.operations.changes')}>
          <div className={css.sectionHeading}><h2>{t('project.operations.changes')}</h2><Tag>{t('project.operations.aiSuggested')}</Tag></div>
          {selectedChanges.length === 0 && <p className={css.empty}>{t('project.operations.empty')}</p>}
          {selectedChanges.map(item => (
            <article className={css.projectOpsItem} key={item.id} id={item.id} tabIndex={-1} aria-label={t(item.title)}>
              <h3>{t(item.title)}</h3>
              <small>{t(item.source)}</small>
              <p>{t(item.scheduleImpact)}</p>
              <Button size="sm" aria-expanded={activeProjectChange === item} onClick={() => {
                setProjectChangeId(activeProjectChange === item ? undefined : item.id)
              }}>{t('project.operations.runImpact')}</Button>
              {activeProjectChange === item && (
                <div className={css.projectOpsItem}>
                  <p>{t(item.scopeImpact)}</p>
                  <p>{t(item.costImpact)}</p>
                  <p>{t(item.qualityImpact)}</p>
                  <small>{t(item.evidence)}</small>
                  <strong>{t('project.operations.affected')}</strong>
                  <ul className={css.projectCriteria}>
                    {selectedMilestones.filter(milestone => item.affectedMilestones.includes(milestone.id)).map(milestone => (
                      <li key={milestone.id}>{t(milestone.name)} · {t(`role.${milestone.owner}`)}</li>
                    ))}
                  </ul>
                  {item.id === fixtureChangeId && (
                    <ChangeDemoPanel
                      t={t}
                      demo={state.fixtureChangeDemo}
                      onEdit={actions.editFixtureChangeDemo}
                      onRun={actions.runFixtureChangeDemo}
                      onOpenAnalysis={() => {
                        const prompt = [
                          t('changeDemo.prompt'),
                          t(item.scopeImpact),
                          t(item.costImpact),
                          t(item.qualityImpact),
                          t(item.evidence),
                          state.fixtureChangeDemo?.constraint.trim(),
                        ].filter(Boolean).join('\n\n')
                        openRoleConversation(prompt)
                      }}
                      onDecision={() => { setProjectFocusId(fixtureDecisionId) }}
                    />
                  )}
                  <Button size="sm" onClick={() => { openScenario(1, 'project.1') }}>{t('project.operations.openSop')}</Button>
                </div>
              )}
            </article>
          ))}
        </section>
        <section className={css.card} aria-label={t('project.operations.risks')}><div className={css.sectionHeading}><h2>{t('project.operations.risks')}</h2><Tag>{t('count', { count: selectedRisks.length })}</Tag></div>{selectedRisks.map(item => <article className={css.projectOpsItem} key={item.id}><div className={css.sectionHeading}><strong>{t(item.title)}</strong><Tag>{t(`project.impact.${item.impact}`)}</Tag></div><p>{t(item.mitigation)}</p><small>{t('project.operations.ownerDue', { owner: t(`role.${item.owner}`), due: item.due })} · {t(item.evidence)}</small><button className={css.textAction} onClick={() => { actions.setProjectRecordStatus(item.id, projectRecordStatus(item.id) === 'done' ? 'open' : 'done'); setFeedback(t('project.operations.statusSaved')) }}>{projectRecordStatus(item.id) === 'done' ? t('project.recordStatus.done') : t('project.operations.markMitigated')}</button></article>)}</section>
        <section className={css.card} aria-label={t('project.operations.decisions')}>
          <div className={css.sectionHeading}><h2>{t('project.operations.decisions')}</h2><Tag>{t('project.operations.humanApproval')}</Tag></div>
          {selectedDecisions.length === 0 && <p className={css.empty}>{t('project.operations.empty')}</p>}
          {selectedDecisions.map((item) => {
            const approved = projectRecordStatus(item.id) === 'approved'
            const choice = approved ? state.projectDecisionOptions?.[item.id] : decisionChoice[item.id]
            return (
              <article className={css.projectOpsItem} key={item.id} id={item.id} tabIndex={-1}>
                <h3>{t(item.title)}</h3>
                <p>{t(item.question)}</p>
                <small>{t('project.operations.ownerDue', { owner: t(`role.${item.owner}`), due: item.due })}</small>
                <label className={css.projectDecisionSelect}>
                  {t('project.operations.decisionOption')}
                  <select value={choice ?? ''} disabled={approved} onChange={(event) => {
                    setDecisionChoice(previous => ({ ...previous, [item.id]: event.target.value }))
                  }}>
                    <option value="">{t('project.operations.chooseOption')}</option>
                    {item.options.map(option => <option key={option} value={option}>{t(option)}</option>)}
                  </select>
                </label>
                {approved ? <Tag>{t('project.recordStatus.approved')}</Tag> : (
                  <Button size="sm" disabled={!choice} onClick={() => {
                    if (!choice) return
                    actions.recordProjectDecision(item.id, choice)
                    setFeedback(t('project.operations.decisionSaved'))
                  }}>{t('project.operations.recordDecision')}</Button>
                )}
              </article>
            )
          })}
        </section>
        <section className={css.card} aria-label={t('project.operations.actions')}>
          <div className={css.sectionHeading}><h2>{t('project.operations.actions')}</h2><Tag>{doneActions}/{selectedActions.length}</Tag></div>
          {selectedActions.map((item) => {
            const delivery = state.followUps.find(entry => entry.projectActionId === item.id)
            const verified = projectRecordStatus(item.id) === 'done'
            return (
              <article className={css.projectOpsItem} key={item.id} id={item.id} tabIndex={-1} aria-label={t(item.title)}>
                <div className={css.sectionHeading}><h3>{t(item.title)}</h3><Tag>{projectRecordStatusLabel(item.id)}</Tag></div>
                <p>{t('project.operations.ownerDue', { owner: t(`role.${item.owner}`), due: item.due })}</p>
                <small>{t(item.evidence)}</small>
                {delivery?.response && <p>{t('groups.responseRecorded')}: {delivery.response}</p>}
                <div className={css.assistantActions}>
                  <Button size="sm" onClick={() => { assignProjectAction(item) }}>
                    {t(delivery === undefined ? 'project.operations.assignToGroup' : 'project.operations.openGroup')}
                  </Button>
                  <Button size="sm" disabled={verified || !delivery?.response?.trim()} onClick={() => {
                    actions.setProjectRecordStatus(item.id, 'done')
                    setFeedback(t('project.operations.statusSaved'))
                  }}>{t('project.operations.markDone')}</Button>
                </div>
              </article>
            )
          })}
        </section>
        <section className={css.card} aria-label={t('project.operations.acceptance')}>
          <div className={css.sectionHeading}><h2>{t('project.operations.acceptance')}</h2><Tag>{t('project.operations.evidenceGate')}</Tag></div>
          {selectedAcceptances.length === 0 && <p className={css.empty}>{t('project.operations.empty')}</p>}
          {selectedAcceptances.map((item) => {
            const ready = acceptanceReady(item)
            const approved = projectRecordStatus(item.id) === 'approved'
            const evidence = acceptanceEvidence[item.id] ?? ''
            return (
              <article className={css.projectOpsItem} key={item.id} id={item.id} tabIndex={-1} aria-label={t(item.title)}>
                <h3>{t(item.title)}</h3>
                <ul className={css.projectCriteria}>
                  {item.criteria.map(criteria => <li key={criteria}>{t(criteria)}</li>)}
                </ul>
                <small>
                  {t('project.operations.receiver', { role: t(`role.${item.receiver}`) })} · {t(item.evidence)}
                </small>
                {approved ? <p>{t('project.recordStatus.approved')} · {state.projectEvidence?.[item.id]}</p> : (
                  <>
                    <label className={css.projectDecisionSelect}>
                      {t('project.operations.acceptanceEvidence')}
                      <Input value={evidence} disabled={!ready} onChange={(event) => {
                        setAcceptanceEvidence(previous => ({ ...previous, [item.id]: event.target.value }))
                      }} />
                    </label>
                    <Button size="sm" disabled={!ready || !evidence.trim()} onClick={() => {
                      actions.recordProjectAcceptance(item.id, evidence)
                      setFeedback(t('project.operations.acceptanceSaved'))
                    }}>{t(ready ? 'project.operations.acceptanceAction' : 'project.operations.acceptanceBlocked')}</Button>
                  </>
                )}
              </article>
            )
          })}
        </section>
      </div>
    </>
  )
}
