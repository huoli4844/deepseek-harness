/**
 * 智能体执行页（导航项「agent」）：从经营优先级出发的智能体执行计划、活动流
 * 与推荐审批。从 Workbench.tsx 抽离。
 */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { roleFixtures } from '../../core/fixtures.ts'
import { methodFor } from '../../core/data/methodology-data.ts'
import { prioritiesForRole } from '../../core/data/priorities-data.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import css from '../../app/Workbench.module.css'

/** 渲染智能体执行页。 */
export function AgentScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, role, activePriority, activeAssignment, agentScenario, agentProgress, agentStatus,
    agentDraft, setAgentDraft, setAgentProgress, setAgentStatus, advanceAgent, approveAgent, openPriority,
  } = page
  if (activePriority === undefined || activeAssignment === undefined || agentScenario === undefined) {
    const choices = prioritiesForRole(role).slice(0, 3)
    return (
      <>
        <section className={css.agentQueue} aria-label={t('agent.chooseSignal')}>
          <h2>{t('agent.chooseSignal')}</h2>
          {choices.map(item => (
            <article className={css.agentQueueRow} key={item.id}>
              <div>
                <strong>{t(item.title)}</strong>
                <p>{t(item.reason)}</p>
                <small>{t(item.source)}</small>
              </div>
              <Button variant="outline" onClick={() => { openPriority(item) }}>
                {t('agent.startWithSignal')}
              </Button>
            </article>
          ))}
          {choices.length === 0 && <p className={css.empty}>{t('priorities.noRoleItems')}</p>}
        </section>
        <p className={css.priorityDisclaimer}>{t('agent.simulationNote')}</p>
      </>
    )
  }

  const item = activePriority
  const assignment = activeAssignment
  const scenario = agentScenario
  const runMethod = methodFor(assignment.role, scenario.task)
  const collaborators = item.assignments.filter(candidate => candidate.role !== assignment.role).slice(0, 3)
  const metricLabel = t(`${assignment.role}.metric${assignment.kpiIndex + 1}` as WorkbenchKey)
  const currentValue = `${item.current}${item.unit === '%' ? '%' : ` ${item.unit}`}`
  const targetValue = `${item.target}${item.unit === '%' ? '%' : ` ${item.unit}`}`
  const impactDetail = t('agent.step.impactDetail', { metric: metricLabel, current: currentValue, target: targetValue })
  const collaborationDetail = t('agent.step.collaborationDetail', { count: collaborators.length })
  const steps = [
    { title: t('agent.step.source'), detail: t(item.source) },
    { title: t('agent.step.impact'), detail: impactDetail },
    { title: t('agent.step.collaboration'), detail: collaborationDetail },
    { title: t('agent.step.recommendation'), detail: agentDraft },
  ]
  const events = [
    { title: t('agent.event.source'), detail: t(item.source) },
    { title: t('agent.event.impact'), detail: impactDetail },
    { title: t('agent.event.collaboration'), detail: collaborationDetail },
    { title: t('agent.event.recommendation'), detail: agentDraft },
  ].slice(0, agentProgress)
  const statusKey = ({
    ready: 'agent.status.ready',
    running: 'agent.status.running',
    awaitingApproval: 'agent.status.awaitingApproval',
    approved: 'agent.status.approved',
  } as const)[agentStatus]

  return (
    <>
      <div className={css.agentLayout}>
        <div className={css.agentMain}>
          <section className={css.agentSection} aria-label={t('agent.plan')}>
            <div className={css.sectionHeading}>
              <div>
                <h2>{t('agent.plan')}</h2>
                <p className={css.intro}>{t('agent.runFor', { role: t(`role.${assignment.role}`) })}</p>
              </div>
              <Tag>{t(statusKey)}</Tag>
            </div>
            <div
              className={css.agentProgressTrack}
              role="progressbar"
              aria-label={t('agent.planProgress')}
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={agentProgress}
            >
              <span style={{ width: `${agentProgress * 25}%` }} />
            </div>
            <ol className={css.agentSteps}>
              {steps.map((step, index) => {
                const completed = agentProgress > index || agentStatus === 'approved'
                const current = agentStatus === 'running' && agentProgress === index
                const stepState = completed ? 'agent.stepDone' : current ? 'agent.stepActive' : agentProgress === 0 && index === 0 ? 'agent.stepReady' : 'agent.stepPending'
                return (
                  <li className={css.agentStep} data-state={completed ? 'done' : current ? 'active' : 'pending'} key={step.title}>
                    <span className={css.agentStepNumber}>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <div className={css.agentStepHeading}>
                        <strong>{step.title}</strong>
                        <small>{t(stepState)}</small>
                      </div>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className={css.agentMethod}>
              <small>{t('assistant.method')}</small>
              <strong>{t(runMethod.method.title)}</strong>
              <p>{t(runMethod.method.why)}</p>
            </div>
          </section>

          <section className={css.agentSection} aria-label={t('agent.activity')}>
            <div className={css.sectionHeading}>
              <div>
                <h2>{t('agent.activity')}</h2>
                <p className={css.intro}>{t('agent.activityIntro')}</p>
              </div>
              <Tag>{t('demo')}</Tag>
            </div>
            {events.length === 0 ? (
              <p className={css.empty}>{t('agent.activityEmpty')}</p>
            ) : (
              <ol className={css.agentEvents}>
                {events.map((event, index) => (
                  <li className={css.agentEvent} key={event.title}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.detail}</p>
                    </div>
                    <small>{t('agent.simulatedResult')}</small>
                  </li>
                ))}
              </ol>
            )}
            {agentProgress >= 3 && (
              <div className={css.agentDelegates}>
                <h3>{t('agent.delegates')}</h3>
                {collaborators.length === 0 ? (
                  <p>{t('agent.noDelegates')}</p>
                ) : collaborators.map(candidate => (
                  <div className={css.agentDelegate} key={candidate.role}>
                    <strong>{t(`role.${candidate.role}`)}</strong>
                    <span>{t('agent.delegateReview', {
                      metric: t(`${candidate.role}.metric${candidate.kpiIndex + 1}` as WorkbenchKey),
                      value: roleFixtures[candidate.role].metrics[candidate.kpiIndex],
                    })}</span>
                    <small>{t('agent.simulatedResult')}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className={css.agentAside}>
          <section className={css.agentSection} aria-label={t('agent.evidence')}>
            <h2>{t('agent.evidence')}</h2>
            <dl className={css.agentEvidence}>
              <div><dt>{t('priorities.source')}</dt><dd>{t(item.source)}</dd></div>
              <div><dt>{t('assistant.roleFocus')}</dt><dd>{metricLabel} · {currentValue} / {targetValue}</dd></div>
              <div><dt>{t('assistant.due')}</dt><dd>{t(item.dueKey)}</dd></div>
            </dl>
            <p className={css.agentSimulationNote}>{t('agent.simulationNote')}</p>
          </section>
          <section className={css.agentSection} aria-label={t('agent.memory')}>
            <h2>{t('agent.memory')}</h2>
            <label className={css.field}>
              {t('agent.memoryLabel')}
              <textarea
                aria-label={t('agent.memoryLabel')}
                placeholder={t('agent.memoryPlaceholder')}
                value={state.rolePreferences?.[assignment.role] ?? ''}
                onChange={(event) => { actions.saveRolePreference(assignment.role, event.target.value) }}
              />
            </label>
            <p className={css.agentMemoryHint}>{t('agent.memoryHint')}</p>
          </section>
          <section className={css.agentSection} aria-label={t('agent.recommendation')}>
            <h2>{t('agent.recommendation')}</h2>
            <label className={css.field}>
              {t('agent.recommendationLabel')}
              <textarea value={agentDraft} onChange={(event) => { setAgentDraft(event.target.value) }} />
            </label>
            {agentStatus === 'awaitingApproval' && (
              <>
                <p className={css.agentApprovalNote}>{t('agent.approvalNote')}</p>
                <div className={css.agentActions}>
                  <Button variant="outline" onClick={() => { setAgentProgress(2); setAgentStatus('running') }}>
                    {t('agent.requestMore')}
                  </Button>
                  <Button variant="primary" disabled={agentDraft.trim() === ''} onClick={approveAgent}>
                    {t('agent.approve')}
                  </Button>
                </div>
              </>
            )}
            {agentStatus === 'approved' ? (
              <div className={css.agentOutcome}>
                <strong>{t('agent.outcomeCreated')}</strong>
                <p>{t('agent.outcomeHint', { role: t(`role.${assignment.role}`), due: t(item.dueKey) })}</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    actions.openTask(scenario.task)
                    actions.navigate('work')
                  }}
                >
                  {t('agent.openWork')}
                </Button>
              </div>
            ) : agentStatus === 'ready' || agentStatus === 'running' ? (
              <Button variant="primary" onClick={advanceAgent}>
                {t(agentStatus === 'ready' ? 'agent.start' : 'agent.continue', { step: Math.min(agentProgress + 1, steps.length) })}
              </Button>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  )
}
