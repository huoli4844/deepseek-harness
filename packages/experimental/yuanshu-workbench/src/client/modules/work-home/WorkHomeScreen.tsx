/**
 * 今日工作首页（导航项「assistant」）：工作简报、行动队列、跟踪与任务目录。
 * 从 Workbench.tsx 抽离；共享状态经 useWorkbenchPage() 注入。
 */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { taskTitles } from '../../core/fixtures.ts'
import { methodFor } from '../../core/data/methodology-data.ts'
import { projectAcceptances, projectActions, projectChanges, projectDecisions } from '../../core/data/project-operations.ts'
import { MilestoneRiskPanel } from '../milestone-risk/index.ts'
import { milestoneDemo } from '../../core/data/milestone-risk.ts'
import { positionScenarios } from '../../core/data/scenario-data.ts'
import { useWorkbenchPage, type WorkbenchT } from '../../app/page-api.ts'
import type { WorkbenchKey } from '../../core/locales/locales.ts'
import { PositionAlert } from '../../app/page-parts.tsx'
import css from '../../app/Workbench.module.css'

/** 今日工作队列条目。 */
interface WorkQueueEntry {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly action: string
  readonly meta?: string
  readonly open: () => void
}

/** 渲染今日工作首页。 */
export function WorkHomeScreen({ t }: { readonly t: WorkbenchT }) {
  const page = useWorkbenchPage()
  const {
    state, actions, role, fixture, workItems, workStatus, openWorkItems, groups, incomingPositionDeliveries,
    positionCase, selectView, openTask, openScenario, openProjectRecord, openWorkgroup, openRoleConversation,
    statusLabel, projectRecordStatus, setMilestoneOpen, milestoneOpen,
  } = page
  const active = openWorkItems.filter(item => workStatus(item.id, item.status) !== 'waiting')
  const waiting = workItems.filter((item) => {
    const status = workStatus(item.id, item.status)
    return status === 'waiting' || status === 'done'
  })
  const changes = projectChanges.filter((item) => {
    const decision = projectDecisions.find(entry => entry.changeId === item.id)
    return decision === undefined || projectRecordStatus(decision.id) !== 'approved'
  })
  const projectReviews = projectActions.filter(item => projectRecordStatus(item.id) !== 'done'
    && state.followUps.some(delivery => delivery.projectActionId === item.id && delivery.done))
  const acceptanceReviews = projectAcceptances.filter(item => projectRecordStatus(item.id) !== 'approved'
    && item.requiredActionIds.every(id => projectRecordStatus(id) === 'done'))
  const projectWaiting = projectActions.filter(item =>
    state.followUps.some(delivery => delivery.projectActionId === item.id && !delivery.done))
  const queueRow = (key: string, title: string, description: string, action: string, onClick: () => void, meta?: string) => (
    <article className={css.homeRow} key={key}>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {meta && <small>{meta}</small>}
      </div>
      <Button size="sm" variant="outline" onClick={onClick} aria-label={`${action} · ${title}`}>{action}</Button>
    </article>
  )
  const status = positionCase?.status ?? 'attention'
  const positionNeedsAction = role !== 'project' && (status === 'attention' || status === 'review')
  const decisions: readonly WorkQueueEntry[] = role === 'project' ? [
    ...projectReviews.map(item => ({
      id: item.id, title: t(item.title), detail: t(item.evidence), action: t('home.review'),
      open: () => { openProjectRecord(item.projectId, item.id) },
    })),
    ...acceptanceReviews.map(item => ({
      id: item.id, title: t(item.title), detail: t(item.evidence), action: t('home.review'),
      open: () => { openProjectRecord(item.projectId, item.id) },
    })),
    ...changes.map(item => ({
      id: item.id, title: t(item.title), detail: t(item.scheduleImpact), action: t('project.operations.runImpact'),
      meta: t(item.source), open: () => { openProjectRecord(item.projectId, item.id, true) },
    })),
  ] : positionNeedsAction ? [{
    id: `position-${role}`, title: t(`position.${role}.title`),
    detail: t(status === 'review' ? 'position.queueReview' : `position.${role}.impact`),
    meta: t(`position.${role}.source`), action: t(status === 'review' ? 'home.review' : 'position.open'),
    open: () => { selectView('position-operations') },
  }] : []
  const milestonePhase = state.milestonePhase ?? 'alert'
  const milestoneEntry: WorkQueueEntry = {
    id: milestoneDemo.id, title: t('milestone.title'), detail: t('milestone.trigger'),
    meta: t('milestone.owner'), action: t('milestone.open'), open: () => { setMilestoneOpen(true) },
  }
  const queue: readonly WorkQueueEntry[] = [
    ...(role === 'project' && milestonePhase !== 'closed' ? [milestoneEntry] : []),
    ...decisions,
    ...incomingPositionDeliveries.flatMap((item) => {
      const { positionCase: origin, groupId } = item
      if (groupId === undefined) return []
      const group = groups.find(entry => entry.id === groupId)
      const groupTitle = group?.nameKey === undefined ? group?.name ?? t('nav.groups') : t(group.nameKey)
      return [{
        id: `delivery-${item.id}`, title: origin === undefined ? groupTitle : t(`position.${origin}.title`),
        detail: item.text, meta: origin === undefined ? groupTitle : t(`role.${origin}`),
        action: t('home.openDelivery'), open: () => { openWorkgroup(groupId, item.id) },
      }]
    }),
    ...[...active].sort((left, right) => (
      Number(right.priority === 'high') - Number(left.priority === 'high')
      || Number(workStatus(right.id, right.status) === 'review') - Number(workStatus(left.id, left.status) === 'review')
    )).map((item) => {
      const checkpoint = state.sceneCheckpoints[item.id]
      const assignment = methodFor(role, item.task)
      const workState = workStatus(item.id, item.status)
      return {
        id: item.id, title: t(taskTitles[item.task]),
        detail: checkpoint?.note.trim() || (workState === 'review' ? t(assignment.output)
          : workState === 'attention' ? t(`home.${role}.trigger${item.metricIndex}`)
            : t(assignment.method.steps[checkpoint?.stage ?? 0].title)),        meta: `${statusLabel(workState)} · ${t(item.dueKey)}`,
        action: t(workState === 'review' ? 'home.review' : workState === 'attention' ? 'home.do' : 'home.next'),
        open: () => {
          if (workState === 'attention') openScenario(item.sourceMetricIndex, item.task)
          else openTask(item.task, workState === 'review' ? 3 : undefined)
        },
      }
    }),
  ]
  const [first, ...remaining] = queue
  const trackCount = waiting.length + (role === 'project' ? projectWaiting.length + Number(milestonePhase === 'closed') : Number(!positionNeedsAction))
  return (
    <div className={css.workHome} key={role}>
      {first !== undefined && (
        <section className={css.homeBrief} aria-label={t('home.briefTitle')}>
          <div className={css.homeBriefHeading}>
            <div>
              <p className={css.eyebrow}>{t('home.briefTitle')}</p>
              <h2>{first.title}</h2>
              <p>{first.detail}</p>
              {first.meta && <small>{first.meta}</small>}
            </div>
            <Button variant="primary" onClick={first.open} aria-label={`${first.action} · ${first.title}`}>{first.action}</Button>
          </div>
        </section>
      )}
      {role === 'project' && milestoneOpen && (
        <MilestoneRiskPanel t={t} phase={milestonePhase} advance={actions.advanceMilestone}
          askAssistant={(prompt) => { openRoleConversation(prompt) }}
          onClose={() => { setMilestoneOpen(false) }} />
      )}
      <section className={css.homeLane} aria-label={t('home.action')}>
        <div className={css.homeSectionHeading}>
          <h2>{t('home.action')}</h2>
          <Tag>{t('count', { count: remaining.length })}</Tag>
        </div>
        {remaining.map(item => queueRow(item.id, item.title, item.detail, item.action, item.open, item.meta))}
        {remaining.length === 0 && <p className={css.homeEmpty}>{t(first === undefined ? 'home.noActions' : 'home.noOtherActions')}</p>}
      </section>
      <details className={css.homeDisclosure}>
        <summary>{t('home.tracking')} <Tag>{t('count', { count: trackCount })}</Tag></summary>
        <section aria-label={t('home.tracking')}>
          {trackCount === 0 && <p className={css.homeEmpty}>{t('home.noTracking')}</p>}
          {!positionNeedsAction && <PositionAlert />}
          {role === 'project' && milestonePhase === 'closed' && queueRow(milestoneEntry.id,
            milestoneEntry.title, t('milestone.closed'), t('home.viewResult'), milestoneEntry.open)}
          {role === 'project' && projectWaiting.map(item => queueRow(item.id, t(item.title), t(item.evidence), t('home.wait'),
            () => { openProjectRecord(item.projectId, item.id) }))}
          {waiting.map((item) => {
            const workState = workStatus(item.id, item.status)
            const isDone = workState === 'done'
            return queueRow(item.id, t(taskTitles[item.task]), state.verifications[item.id] || t(methodFor(role, item.task).output),
              t(isDone ? 'home.viewResult' : 'home.wait'), () => {
                openTask(item.task, isDone ? 3 : undefined)
              }, statusLabel(workState))
          })}
        </section>
      </details>
      <details className={css.homeDisclosure}>
        <summary>{t('home.directory')} <Tag>{t('count', { count: workItems.length })}</Tag></summary>
        <section aria-label={t('home.directory')}>
          <p className={css.homeDirectoryHint}>{t('home.directoryHint')}</p>
          {workItems.map((item) => {
            const assignment = methodFor(role, item.task)
            const label = t(taskTitles[item.task])
            const workState = workStatus(item.id, item.status)
            const action = {
              attention: 'home.do', inProgress: 'home.next', waiting: 'home.wait',
              review: 'home.review', done: 'home.viewResult',
            } as const
            const openRoutine = () => {
              if (workState === 'attention') openScenario(item.metricIndex, item.task)
              else openTask(item.task, workState === 'done' || workState === 'review' ? 3 : undefined)
            }
            return (
              <article className={css.homeWork} key={item.id}>
                <div className={css.homeWorkTitle}>
                  <div className={css.homeWorkIdentity}>
                    <h3>{label}</h3>
                    <Tag>{statusLabel(workState)}</Tag>
                  </div>
                  <Button size="sm" onClick={openRoutine} aria-label={`${t(action[workState])} · ${label}`}>
                    {t(action[workState])}
                  </Button>
                </div>
                <dl>
                  <dt>{t('home.trigger')}</dt><dd>{t(`home.${role}.trigger${item.metricIndex}`)}</dd>
                  <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
                </dl>
                <details className={css.homeSop}>
                  <summary>{t('home.flow')} · {t(assignment.method.title)}</summary>
                  <ol aria-label={t('assistant.sopFlow', { task: label })}>
                    {assignment.method.steps.map(step => <li key={step.title}>{t(step.title)}</li>)}
                  </ol>
                  <p>{t('guide.inputs')} · {t(assignment.inputs)}</p>
                  <p>{t('guide.acceptance')} · {t(assignment.acceptance)}</p>
                </details>
              </article>
            )
          })}
        </section>
      </details>
      <details className={css.homeDisclosure}>
        <summary>{t('assistant.kpiScenes')}</summary>
        <section aria-label={t('assistant.kpiScenes')}>
          {positionScenarios[role].map(({ kpiIndex, task }) => (
            queueRow(`kpi-${kpiIndex}`, `${t(`${role}.metric${kpiIndex + 1}` as WorkbenchKey)} · ${fixture.metrics[kpiIndex]}`,
              t(taskTitles[task]), t('assistant.leadScenario'), () => { openScenario(kpiIndex, task) })
          ))}
        </section>
      </details>
    </div>
  )
}
