/** Role-adapted dashboards and shared workspace rendered in a native DSH panel. */
import { useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Tag,
  IconLayersOutlineRegular,
  IconChecklistOutlineRegular,
  IconClockOutlineRegular,
  IconUsersOutlineRegular,
  IconCompareSplitOutlineRegular,
  IconArchiveOutlineRegular,
  IconPaperclipOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconPlusOutlineRegular,
  IconChevronRightOutlineRegular,
  IconSearchOutlineRegular,
  IconNewChatOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DraftVersion, RoleId, TaskId, WorkbenchStoreProps } from './model.ts'
import type { WorkgroupKind } from './workgroup-data.ts'
import type { WorkbenchKey } from './locales.ts'
import { managementDomains, navigation, roleFixtures, roleGroups, roleIds, taskTitles } from './fixtures.ts'
import css from './Workbench.module.css'
import { DashboardCharts } from './DashboardCharts.tsx'
import { dashboardCharts } from './dashboard-data.ts'
import { methodFor, roleMethods, type MethodStage } from './methodology-data.ts'
import { dailyWorkForRole, positionScenarios, workItemsForRole, workItemForScenario, type WorkStatus } from './scenario-data.ts'
import { prioritiesForRole, priorityAssignment, priorityItems } from './priorities-data.ts'
import { createDemoWorkgroups } from './workgroup-data.ts'

interface WorkbenchInjected {
  readonly onReturn: () => void
}
type WorkbenchProps = PropsRuntime<'main'> &
  PropsLocale<'yuanshu.workbench'> &
  WorkbenchStoreProps &
  InjectFace<WorkbenchInjected>

/**
 * Reuse the existing layers icon in the DSH global panel list.
 * @param props - Host-owned icon size and selected state.
 * @returns the stock DSH glyph.
 */
export function WorkbenchIcon(props: SidebarPanelIconOwnerProps) {
  return <IconLayersOutlineRegular size={props.size} />
}

const navIcons = {
  assistant: IconLayersOutlineRegular,
  dashboard: IconLayersOutlineRegular,
  priorities: IconArchiveOutlineRegular,
  agent: IconChecklistOutlineRegular,
  tasks: IconChecklistOutlineRegular,
  versions: IconCompareSplitOutlineRegular,
  calendar: IconClockOutlineRegular,
  team: IconUsersOutlineRegular,
  groups: IconNewChatOutlineRegular,
  notifications: IconArchiveOutlineRegular,
  files: IconPaperclipOutlineRegular,
  methods: IconLayersOutlineRegular,
}

/**
 * Render plugin-owned demonstration data with DSH controls, localization, and state.
 * @param props - Framework selectors, declared actions, locale, and return callback.
 * @returns the workbench main-panel content.
 */
export function Workbench(props: WorkbenchProps) {
  const { t, actions, onReturn } = props
  const state = props.useStore(s => s)
  const { role, view } = state
  const fixture = roleFixtures[role]
  const [navOpen, setNavOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<MethodStage>(0)
  const [candidate, setCandidate] = useState(false)
  const [activeScenario, setActiveScenario] = useState<number | null>(null)
  const [dialog, setDialog] = useState<'submit' | 'event' | 'source' | 'compare' | 'group' | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [followUpRole, setFollowUpRole] = useState<RoleId>('quality')
  const [followUpText, setFollowUpText] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'role'>('all')
  const [activePriorityId, setActivePriorityId] = useState<string>()
  const [activePriorityRole, setActivePriorityRole] = useState<RoleId>(role)
  const [agentProgress, setAgentProgress] = useState(0)
  const [agentStatus, setAgentStatus] = useState<'ready' | 'running' | 'awaitingApproval' | 'approved'>('ready')
  const [agentDraft, setAgentDraft] = useState('')
  const [activeGroupId, setActiveGroupId] = useState('project-validation')
  const [groupMessageDraft, setGroupMessageDraft] = useState('')
  const [groupAssignmentDraft, setGroupAssignmentDraft] = useState('')
  const [groupAssignmentRole, setGroupAssignmentRole] = useState<RoleId>(role)
  const [groupInviteRole, setGroupInviteRole] = useState<RoleId>(role)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupKind, setNewGroupKind] = useState<WorkgroupKind>('project')
  const [newGroupMembers, setNewGroupMembers] = useState<RoleId[]>([role])
  const [newGroupInviteRole, setNewGroupInviteRole] = useState<RoleId>(roleIds.find(id => id !== role) ?? role)
  const contentRef = useRef<HTMLDivElement>(null)
  const key = `${role}:${state.task}`
  const draft = state.drafts[key]
  const practice = methodFor(role, state.task)
  const method = practice.method
  const initial = t('guide.draftTemplate', {
    task: t(taskTitles[state.task]), method: t(method.title), output: t(practice.output), acceptance: t(practice.acceptance),
  })
  const suggestedStructure = t('guide.candidateTemplate', {
    task: t(taskTitles[state.task]), inputs: t(practice.inputs), output: t(practice.output), acceptance: t(practice.acceptance),
  })
  const execution = draft?.execution ?? { evidence: '', analysis: '', checked: [] }
  const text = draft?.text ?? initial
  const versions = draft?.versions ?? [{ number: 1, text: initial, execution }]
  const methodReady = execution.checked.length === 4 && execution.evidence.trim() !== '' && execution.analysis.trim() !== '' && text.trim() !== ''
  const currentTitle = t(taskTitles[state.task])
  const workItems = workItemsForRole(role)
  const workStatus = (id: string, fallback: WorkStatus) => state.workStatuses[id] ?? fallback
  const openWorkItems = workItems.filter(item => workStatus(item.id, item.status) !== 'done')
  const incomingWorkItems = openWorkItems.slice(1)
  const priorityCount = workItems.filter(item => item.priority === 'high' && workStatus(item.id, item.status) !== 'done').length
  const confirmationCount = workItems.filter(item => workStatus(item.id, item.status) === 'waiting').length
  const reviewCount = workItems.filter(item => workStatus(item.id, item.status) === 'review').length
  const leadPriority = prioritiesForRole(role)[0]
  const groups = state.workgroups ?? createDemoWorkgroups()
  const activeGroup = groups.find(group => group.id === activeGroupId) ?? groups[0]
  const groupInviteChoices = activeGroup?.members === undefined ? roleIds : roleIds.filter(id => !activeGroup.members.includes(id))
  const selectedGroupInviteRole = groupInviteChoices.includes(groupInviteRole) ? groupInviteRole : groupInviteChoices[0]
  const newGroupInviteChoices = roleIds.filter(id => !newGroupMembers.includes(id))
  const selectedNewGroupInviteRole = newGroupInviteChoices.includes(newGroupInviteRole) ? newGroupInviteRole : newGroupInviteChoices[0]
  const activePriority = priorityItems.find(item => item.id === activePriorityId)
  const activeAssignment = activePriority === undefined ? undefined : priorityAssignment(activePriority, activePriorityRole)
  const agentScenario = activeAssignment === undefined ? undefined : positionScenarios[activeAssignment.role][activeAssignment.kpiIndex]
  const currentWorkItem = workItems.find(item => item.task === state.task)
  const currentWorkStatus = currentWorkItem === undefined ? undefined : workStatus(currentWorkItem.id, currentWorkItem.status)
  const unread = [0, 1, 2].filter(id => !state.read.includes(id)).length
  const statusLabel = (status: WorkStatus) => t(({
    attention: 'status.attention', inProgress: 'status.inProgress', waiting: 'status.waiting',
    review: 'status.review', done: 'status.done',
  } as const)[status])
  const title = view === 'work' ? currentTitle : t(navigation.find(n => n.id === view)?.label ?? 'nav.assistant')
  const selectView = (next: typeof view) => {
    actions.navigate(next)
    setNavOpen(false)
    setFeedback('')
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const selectPosition = (next: RoleId) => {
    actions.changeRole(next)
    selectView('assistant')
    setQuery('')
    setCandidate(false)
    setActiveScenario(null)
    setSelectedVersion(0)
  }
  const openTask = (id: TaskId) => {
    actions.openTask(id)
    setStage(0)
    setCandidate(false)
    setActiveScenario(null)
    setFeedback('')
    setNavOpen(false)
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const openScenario = (kpiIndex: number, id: TaskId) => {
    openTask(id)
    setActiveScenario(kpiIndex)
    setCandidate(true)
  }
  const openPriority = (item: typeof priorityItems[number]) => {
    const assignment = priorityAssignment(item, role) ?? item.assignments[0]
    if (assignment === undefined) return
    const scenario = positionScenarios[assignment.role][assignment.kpiIndex]
    if (scenario === undefined) return
    actions.changeRole(assignment.role)
    setActivePriorityId(item.id)
    setActivePriorityRole(assignment.role)
    setAgentProgress(0)
    setAgentStatus('ready')
    setAgentDraft(t(item.action))
    selectView('agent')
  }
  const advanceAgent = () => {
    if (agentStatus === 'ready') {
      setAgentProgress(1)
      setAgentStatus('running')
      return
    }
    if (agentStatus !== 'running' || agentProgress >= 4) return
    const nextProgress = agentProgress + 1
    setAgentProgress(nextProgress)
    if (nextProgress === 4) setAgentStatus('awaitingApproval')
  }
  const approveAgent = () => {
    if (agentScenario === undefined || agentDraft.trim() === '') return
    actions.setWorkStatus(agentScenario.workItemId, 'inProgress')
    setAgentStatus('approved')
  }
  const openGroupDialog = () => {
    setNewGroupName('')
    setNewGroupKind('project')
    setNewGroupMembers([role])
    setNewGroupInviteRole(roleIds.find(id => id !== role) ?? role)
    setDialog('group')
  }
  const createGroup = () => {
    const name = newGroupName.trim()
    if (name === '' || newGroupMembers.length === 0) return
    const nextId = (state.workgroups ?? []).filter(group => group.id.startsWith('local-')).length + 1
    actions.createWorkgroup(name, newGroupKind, newGroupMembers)
    setActiveGroupId(`local-${nextId}`)
    setDialog(null)
  }
  const sendGroupMessage = () => {
    if (activeGroup === undefined || groupMessageDraft.trim() === '') return
    const message = groupMessageDraft.trim()
    actions.addWorkgroupMessage(activeGroup.id, 'human', message, 'message', false)
    for (const member of activeGroup.members.slice(0, 3)) {
      actions.addWorkgroupMessage(
        activeGroup.id,
        member,
        t('groups.agentReply', { focus: t(`${member}.focus` as WorkbenchKey) }),
        'message',
        true,
      )
    }
    setGroupMessageDraft('')
  }
  const assignGroupWork = () => {
    if (activeGroup === undefined || groupAssignmentDraft.trim() === '') return
    const owner = activeGroup.members.includes(groupAssignmentRole) ? groupAssignmentRole : activeGroup.members[0]
    if (owner === undefined) return
    actions.addWorkgroupMessage(activeGroup.id, 'human', groupAssignmentDraft.trim(), 'assignment', false, owner)
    setGroupAssignmentDraft('')
  }
  const prioritiesPage = () => {
    const visibleItems = priorityFilter === 'all' ? priorityItems : prioritiesForRole(role)
    return (
      <>
        <div className={css.pageHeading}>
          <div>
            <p className={css.eyebrow}>{t('tenant')} / {t(`role.${role}`)}</p>
            <h1>{t('priorities.title')}</h1>
            <p>{t('priorities.subtitle')}</p>
          </div>
          <Tag>{t('count', { count: visibleItems.length })}</Tag>
        </div>
        <div className={css.priorityFilters} role="group" aria-label={t('priorities.title')}>
          <Button variant={priorityFilter === 'all' ? 'outline' : 'ghost'} aria-pressed={priorityFilter === 'all'} onClick={() => { setPriorityFilter('all') }}>
            {t('priorities.all')}
          </Button>
          <Button variant={priorityFilter === 'role' ? 'outline' : 'ghost'} aria-pressed={priorityFilter === 'role'} onClick={() => { setPriorityFilter('role') }}>
            {t('priorities.forRole')}
          </Button>
        </div>
        <section className={css.priorityList} aria-label={t('priorities.title')}>
          {visibleItems.map((item) => {
            const assignment = priorityAssignment(item, role) ?? item.assignments[0]
            if (assignment === undefined) return null
            const scenario = positionScenarios[assignment.role][assignment.kpiIndex]
            if (scenario === undefined) return null
            const workItem = workItemForScenario(assignment.role, assignment.kpiIndex)
            const method = methodFor(assignment.role, scenario.task)
            const status = workStatus(workItem.id, workItem.status)
            return (
              <article className={css.priorityRow} key={item.id}>
                <div className={css.priorityRank} aria-label={t('priorities.rank', { rank: item.rank })}>
                  <strong>{String(item.rank).padStart(2, '0')}</strong>
                </div>
                <div className={css.priorityBody}>
                  <div className={css.priorityTitleRow}>
                    <h2>{t(item.title)}</h2>
                    <Tag>{statusLabel(status)}</Tag>
                  </div>
                  <p className={css.priorityReason}>{t(item.reason)}</p>
                  <div className={css.priorityFacts}>
                    <div>
                      <small>{t(`${assignment.role}.metric${assignment.kpiIndex + 1}` as WorkbenchKey)}</small>
                      <strong>{item.current}{item.unit === '%' ? '%' : ` ${item.unit}`}</strong>
                    </div>
                    <div>
                      <small>{t('priorities.target')}</small>
                      <strong>{item.target}{item.unit === '%' ? '%' : ` ${item.unit}`}</strong>
                    </div>
                    <div>
                      <small>{t('assistant.owner')}</small>
                      <strong>{t(`role.${assignment.role}`)}</strong>
                    </div>
                    <div>
                      <small>{t('assistant.due')}</small>
                      <strong>{t(item.dueKey)}</strong>
                    </div>
                  </div>
                  <div className={css.priorityTrace}>
                    <p><strong>{t('priorities.source')}:</strong> {t(item.source)}</p>
                    <p><strong>{t('assistant.nextAction')}:</strong> {t(item.action)}</p>
                    <small>{t('assistant.method')}: {t(method.method.title)} · {t(taskTitles[scenario.task])}</small>
                  </div>
                </div>
                <div className={css.priorityAction}>
                  <small>{t('priorities.participants', { count: item.assignments.length })}</small>
                  <Button variant="outline" onClick={() => { openPriority(item) }}>
                    {t('priorities.open')}
                  </Button>
                </div>
              </article>
            )
          })}
          {visibleItems.length === 0 && <p className={css.empty}>{t('priorities.noRoleItems')}</p>}
        </section>
        <p className={css.priorityDisclaimer}>{t('assistant.scopeHint')}</p>
      </>
    )
  }
  const agentPage = () => {
    if (activePriority === undefined || activeAssignment === undefined || agentScenario === undefined) {
      const choices = prioritiesForRole(role).slice(0, 3)
      return (
        <>
          <div className={css.pageHeading}>
            <div>
              <p className={css.eyebrow}>{t('tenant')} / {t(`role.${role}`)}</p>
              <h1>{t('agent.title')}</h1>
              <p>{t('agent.queueIntro')}</p>
            </div>
            <Tag>{t('demo')}</Tag>
          </div>
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
        <div className={css.pageHeading}>
          <div>
            <p className={css.eyebrow}>{t('agent.title')} / {t(`role.${assignment.role}`)}</p>
            <h1>{t(item.title)}</h1>
            <p>{t(item.reason)}</p>
          </div>
        </div>
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
  const taskRows = (compact = false) => (
    <div className={css.taskRows}>
      {workItems
        .filter(item => t(taskTitles[item.task]).toLocaleLowerCase().includes(query.toLocaleLowerCase()))
        .map(item => (
          <button
            key={item.id}
            className={css.taskRow}
            onClick={() => {
              if (workStatus(item.id, item.status) === 'attention') actions.setWorkStatus(item.id, 'inProgress')
              openTask(item.task)
            }}
          >
            <span className={css.taskIcon}>
              <IconChecklistOutlineRegular size={18} />
            </span>
            <span className={css.grow}>
              <strong>{t(taskTitles[item.task])}</strong>
              <small>{t(`${role}.metric${item.sourceMetricIndex + 1}` as WorkbenchKey)} · {t('assistant.sourceReason')}</small>
              <small>{t('assistant.nextAction')}: {t('assistant.nextReview')}</small>
            </span>
            {!compact && (
              <span className={css.due}>{t(item.dueKey)}</span>
            )}
            <Tag>{statusLabel(workStatus(item.id, item.status))}</Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
        ))}
      {workItems.every(item => !t(taskTitles[item.task]).toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (
        <p className={css.empty}>{t('noMatches')}</p>
      )}
    </div>
  )
  const methodCards = (compact = false) => (
    <div className={css.methodCards}>
      {roleMethods[role].map(assignment => (
        <article className={css.card} key={assignment.task}>
          <Tag>{t(assignment.method.title)}</Tag>
          <h3>{t(taskTitles[assignment.task])}</h3>
          {!compact && <>
            <p className={css.intro}>{t(assignment.method.why)}</p>
            <dl className={css.methodFacts}>
              <dt>{t('guide.inputs')}</dt><dd>{t(assignment.inputs)}</dd>
              <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
              <dt>{t('guide.acceptance')}</dt><dd>{t(assignment.acceptance)}</dd>
            </dl>
          </>}
          <Button variant="outline" onClick={() => { openTask(assignment.task) }}>
            {t('guide.start')}
          </Button>
        </article>
      ))}
    </div>
  )
  const methodChecks = () => (
    <div className={css.methodChecks}>
      <dl className={css.methodFacts}>
        <dt>{t('guide.evidence')}</dt><dd>{execution.evidence || t('guide.unrecorded')}</dd>
        <dt>{t('guide.analysis')}</dt><dd>{execution.analysis || t('guide.unrecorded')}</dd>
        <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
        <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
      </dl>
      <div className={css.methodRecords}>
        <Button onClick={() => { setDialog(null); setStage(0) }}>{t('guide.evidence')} · {t(execution.evidence.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
        <Button onClick={() => { setDialog(null); setStage(1) }}>{t('guide.analysis')} · {t(execution.analysis.trim() ? 'guide.recorded' : 'guide.unrecorded')}</Button>
      </div>
      {([0, 1, 2, 3] as const).map(step => (
        <Checkbox key={step} checked={execution.checked.includes(step)}
          label={t(`guide.check${step}`)}
          onChange={(checked) => { actions.checkMethod(key, step, checked, initial) }} />
      ))}
      <p className={css.intro}>{t(methodReady ? 'guide.ready' : 'guide.missing')}</p>
    </div>
  )
  const executionSnapshot = (version: DraftVersion | undefined) => version === undefined ? null : (
    <div className={css.methodSnapshot}>
      <h3>{t('guide.snapshot')}</h3>
      <p>{t('guide.progress', { done: version.execution.checked.length })}</p>
      <p>{t('guide.evidence')}: {version.execution.evidence || t('guide.unrecorded')}</p>
      <p>{t('guide.analysis')}: {version.execution.analysis || t('guide.unrecorded')}</p>
    </div>
  )
  const chart = () => {
    const coords = fixture.trend.map((value, i) => `${32 + i * 60},${160 - value * 1.3}`).join(' ')
    return (
      <button
        className={css.trendButton}
        onClick={() => {
          selectView('tasks')
        }}
        aria-label={t('chart.detail')}
      >
        <svg className={css.trend} viewBox="0 0 370 190" role="img" aria-label={t(`${role}.chart`)}>
          <title>{t(`${role}.chart`)}</title>
          {[40, 60, 80, 100].map(n => (
            <g key={n}>
              <line x1="30" x2="347" y1={160 - n * 1.3} y2={160 - n * 1.3} />
              <text x="0" y={164 - n * 1.3}>
                {n}
              </text>
            </g>
          ))}
          <polyline points={coords} />
          {fixture.trend.map((value, i) => (
            <g key={i}>
              <circle cx={32 + i * 60} cy={160 - value * 1.3} r="3.5">
                <title>
                  {t('trend.week', { value: i + 1 })}: {value}%
                </title>
              </circle>
              <text x={26 + i * 60} y="182">
                {t('trend.week', { value: i + 1 })}
              </text>
            </g>
          ))}
        </svg>
      </button>
    )
  }
  const assistant = () => (
    <>
      <div className={css.pageHeading}>
        <div>
          <p className={css.eyebrow}>{t('tenant')} / {t(`role.${role}`)}</p>
          <h1>{t('assistant.title')}</h1>
          <p>{t('assistant.subtitle')}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutlineRegular size={16} />}
          onClick={() => { selectView('methods') }}
        >
          {t('new')}
        </Button>
      </div>
      <section className={`${css.assistantBrief} ${css.assistantPriority}`} aria-label={t('assistant.dailyBrief')}>
        <div>
          <p className={css.eyebrow}>{t('assistant.dailyBrief')}</p>
          <strong>{t('assistant.briefBody', {
            priority: priorityCount,
            confirmations: confirmationCount,
            reviews: reviewCount,
          })}</strong>
        </div>
        <div className={css.assistantCadence}>
          <span><b>09:00</b>{t('assistant.cadenceMorning')}</span>
          <span><b>13:00</b>{t('assistant.cadenceMidday')}</span>
          <span><b>17:00</b>{t('assistant.cadenceClose')}</span>
        </div>
      </section>
      <div className={css.assistantLayout}>
        <section className={css.assistantPriority} aria-labelledby="assistant-priority-title">
          <div className={css.sectionHeading}>
            <h2 id="assistant-priority-title">{t('assistant.priority')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <p className={css.eyebrow}>{t('assistant.roleFocus')}</p>
          <p className={css.intro}>{t(`${role}.focus`)}</p>
          {leadPriority !== undefined && (() => {
            const assignment = priorityAssignment(leadPriority, role)
            if (assignment === undefined) return null
            const scenario = positionScenarios[role][assignment.kpiIndex]
            if (scenario === undefined) return null
            const item = workItemForScenario(role, assignment.kpiIndex)
            return (
              <div key={leadPriority.id}>
                <h2 className={css.assistantTaskTitle}>{t(leadPriority.title)}</h2>
                <p className={css.assistantReason}>{t('assistant.whyNow')}: {t(leadPriority.reason)}</p>
                <p className={css.assistantReason}>{t('assistant.nextAction')}: {t(leadPriority.action)}</p>
                <div className={css.assistantItemMeta}>
                  <Tag>{statusLabel(workStatus(item.id, item.status))}</Tag>
                  <span>{t('assistant.due')}: {t(leadPriority.dueKey)}</span>
                  <span>{t('assistant.owner')}: {t(`role.${role}`)}</span>
                </div>
                <small>{t(`${role}.metric${assignment.kpiIndex + 1}` as WorkbenchKey)} · {leadPriority.current}{leadPriority.unit === '%' ? '%' : ` ${leadPriority.unit}`} / {leadPriority.target}{leadPriority.unit === '%' ? '%' : ` ${leadPriority.unit}`}</small>
                <div className={css.assistantSource}>
                  <small>{t('priorities.source')}</small>
                  <strong>{t(leadPriority.source)}</strong>
                </div>
                <Button
                  variant="primary"
                  icon={<IconChevronRightOutlineRegular size={16} />}
                  onClick={() => { openPriority(leadPriority) }}
                >
                  {t('assistant.continue')}
                </Button>
              </div>
            )
          })()}
          {leadPriority === undefined && <p className={css.empty}>{t('assistant.queueEmpty')}</p>}
          <div className={css.assistantSource}>
            <small>{t('assistant.dataPath')}</small>
            <strong>{t('assistant.dataTrace')} · {t('assistant.dataFreshness')}</strong>
          </div>
          <div className={css.assistantActions}>
            <Button variant="outline" onClick={() => { selectView('dashboard') }}>
              {t('assistant.positionData')}
            </Button>
          </div>
        </section>
        <section className={css.assistantInbox} aria-labelledby="assistant-inbox-title">
          <div className={css.sectionHeading}>
            <h2 id="assistant-inbox-title">{t('assistant.incoming')}</h2>
            <Tag>{t('count', { count: incomingWorkItems.length + 1 })}</Tag>
          </div>
          <p className={css.intro}>{t('assistant.incomingHint')}</p>
          {incomingWorkItems.map(item => (
            <button className={css.assistantSignal} key={item.id} onClick={() => { openTask(item.task) }}>
              <span className={css.assistantSignalMarker} aria-hidden="true" />
              <span className={css.grow}>
                <strong>{t(taskTitles[item.task])}</strong>
                <small>{t(`${role}.metric${item.sourceMetricIndex + 1}` as WorkbenchKey)} · {t('assistant.nextReview')}</small>
              </span>
              <Tag>{statusLabel(workStatus(item.id, item.status))}</Tag>
              <IconChevronRightOutlineRegular size={14} />
            </button>
          ))}
          <button className={css.assistantSignal} onClick={() => { selectView('calendar') }}>
            <span className={css.assistantSignalMarker} aria-hidden="true" />
            <span className={css.grow}>
              <strong>{t('calendar.0')}</strong>
              <small>{t('assistant.calendarSource')}</small>
            </span>
            <Tag>{t('task.today')}</Tag>
            <IconChevronRightOutlineRegular size={14} />
          </button>
          <Button variant="outline" onClick={() => { selectView('tasks') }}>
            {t('allTasks')}
          </Button>
        </section>
      </div>
      <section className={css.scenarioSection} aria-label={t('assistant.kpiScenes')}>
        <div className={css.sectionHeading}>
          <div>
            <h2>{t('assistant.kpiScenes')}</h2>
            <p className={css.intro}>{t('assistant.kpiScenesHint')}</p>
          </div>
          <Tag>{t('count', { count: 4 })}</Tag>
        </div>
        <div className={css.scenarioGrid}>
          {positionScenarios[role].map(({ kpiIndex, task, workItemId }) => {
            const assignment = methodFor(role, task)
            const item = workItemForScenario(role, kpiIndex)
            return (
              <article className={css.scenarioItem} key={kpiIndex}>
                <div className={css.scenarioKpi}>
                  <span>{t(`${role}.metric${kpiIndex + 1}` as WorkbenchKey)}</span>
                  <strong>{fixture.metrics[kpiIndex]}</strong>
                </div>
                <p className={css.eyebrow}>{t('assistant.typicalWork')}</p>
                <h3>{t(taskTitles[task])}</h3>
                <p className={css.intro}>{t(assignment.method.why)}</p>
                <dl className={css.scenarioFacts}>
                  <dt>{t('guide.inputs')}</dt><dd>{t(assignment.inputs)}</dd>
                  <dt>{t('guide.output')}</dt><dd>{t(assignment.output)}</dd>
                </dl>
                <div className={css.scenarioMethod}>
                  <small>{t('assistant.method')}</small>
                  <strong>{t(assignment.method.title)}</strong>
                </div>
                <div className={css.scenarioActions}>
                  <Tag>{statusLabel(workStatus(workItemId, item.status))}</Tag>
                  <small>{t('assistant.nextAction')}: {t('assistant.nextReview')}</small>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    actions.setWorkStatus(workItemId, 'inProgress')
                    openScenario(kpiIndex, task)
                  }}
                >
                  {t('assistant.leadScenario')}
                </Button>
              </article>
            )
          })}
        </div>
      </section>
      <section className={css.dailySection} aria-label={t('assistant.dailyWork')}>
        <div className={css.sectionHeading}>
          <div>
            <h2>{t('assistant.dailyWork')}</h2>
            <p className={css.intro}>{t('assistant.dailyWorkHint')}</p>
          </div>
          <Tag>{t('count', { count: dailyWorkForRole(role).length })}</Tag>
        </div>
        <div className={css.dailyRows}>
          {roleMethods[role].map((assignment, index) => (
            <div className={css.dailyRow} key={assignment.task}>
              <span className={css.dailyNumber}>{index + 1}</span>
              <div className={css.grow}>
                <strong>{t(taskTitles[assignment.task])}</strong>
                <small>{t('assistant.dailyMethod', { method: t(assignment.method.title) })}</small>
              </div>
              <Button onClick={() => {
                const item = workItems.find(candidate => candidate.task === assignment.task)
                if (item !== undefined) actions.setWorkStatus(item.id, 'inProgress')
                openScenario(item?.metricIndex ?? 0, assignment.task)
              }}>{t('assistant.openDaily')}</Button>
            </div>
          ))}
        </div>
      </section>
      <div className={css.assistantFooter}>
        <div>
          <p className={css.eyebrow}>{t('assistant.scope')}</p>
          <p>{t('assistant.scopeHint')}</p>
        </div>
        <div className={css.assistantFooterActions}>
          <Button onClick={() => { selectView('notifications') }}>{t('nav.notifications')}</Button>
          <Button onClick={() => { selectView('calendar') }}>{t('goCalendar')}</Button>
          <Button onClick={() => { selectView('team') }}>{t('nav.team')}</Button>
        </div>
      </div>
    </>
  )
  const dashboard = () => (
    <>
      <div className={css.pageHeading}>
        <div>
          <p className={css.eyebrow}>
            {t('tenant')} / {t(`role.${role}`)}
          </p>
          <h1>{t(`${role}.title`)}</h1>
          <p>{t(`${role}.subtitle`)}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutlineRegular size={16} />}
          onClick={() => {
            selectView('methods')
          }}
        >
          {t('new')}
        </Button>
      </div>
      <div className={css.metrics}>
        {fixture.metrics.map((value, i) => (
          <button
            className={css.metric}
            key={i}
            onClick={() => {
              const scene = positionScenarios[role][i]
              if (scene !== undefined) {
                actions.setWorkStatus(scene.workItemId, 'inProgress')
                openScenario(scene.kpiIndex, scene.task)
              }
            }}
          >
            <span>{t(`${role}.metric${i + 1}` as WorkbenchKey)}</span>
            <strong>{value}</strong>
            <small>{t('demoSample')}</small>
          </button>
        ))}
      </div>
      <div className={css.chartSectionHeading}>
        <h2>{t('nav.dashboard')}</h2>
        <Tag>{t(role === 'executive' || role === 'president' ? 'chart.eight' : 'chart.six')}</Tag>
      </div>
      <div className={css.chartGrid}>
        <section className={css.card} data-dashboard-chart="trend" aria-label={t(`${role}.chart`)}>
          <div className={css.sectionHeading}>
            <h2>{t(`${role}.chart`)}</h2>
            <small>{t('chart.unit')}</small>
          </div>
          {chart()}
          <p className={css.chartCaption}>{t('chartHint')}</p>
        </section>
        <section className={css.card} data-dashboard-chart="progress" aria-label={t(`${role}.bars`)}>
          <div className={css.sectionHeading}>
            <h2>{t(`${role}.bars`)}</h2>
            <small>{t('thisWeek')}</small>
          </div>
          <div className={css.bars}>
            {fixture.bars.map((value, i) => (
              <button
                key={i}
                className={css.barRow}
                onClick={() => {
                  selectView('tasks')
                }}
              >
                <span>{t(`${role}.bar${i + 1}` as WorkbenchKey)}</span>
                <b>{value}%</b>
                <span className={css.barTrack}>
                  <span style={{ width: `${value}%` }} />
                </span>
              </button>
            ))}
          </div>
        </section>
        <DashboardCharts t={t} charts={dashboardCharts[role]} tasks={fixture.tasks} onTask={openTask} />
      </div>
      {(role === 'executive' || role === 'president') && (
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('management.title')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <p className={css.intro}>{t(role === 'executive' ? 'management.note' : 'demoNote')}</p>
          <div className={css.companyOverview}>
            {managementDomains.map(domain => (
              <article key={domain.id} className={css.companyRow}>
                <div>
                  <h3>{t(domain.label)}</h3>
                  <small>{t(`role.${domain.role}`)}</small>
                </div>
                <div className={css.companyProgress}>
                  <span>{t('percent', { value: domain.progress })}</span>
                  <div className={css.barTrack}>
                    <span style={{ width: `${domain.progress}%` }} />
                  </div>
                </div>
                <p>{t(domain.risk)}</p>
                <Button
                  size="sm"
                  onClick={() => {
                    selectPosition(domain.role)
                    openTask(roleFixtures[domain.role].tasks[0])
                  }}
                >
                  {t('management.open')}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className={css.sectionHeading}>
        <h2>{t('guide.roleTitle')}</h2>
        <Button onClick={() => { selectView('methods') }}>{t('guide.library')}</Button>
      </div>
      {methodCards(true)}
      <div className={css.focusStrip}>
        <IconLayersOutlineRegular size={20} />
        <div>
          <small>{t('focus')}</small>
          <p>{t(`${role}.focus`)}</p>
        </div>
        <Button
          onClick={() => {
            openTask(fixture.tasks[0])
          }}
        >
          {t('open')}
        </Button>
      </div>
      <div className={css.dashboardBottom}>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('upcoming')}</h2>
            <Button
              size="sm"
              onClick={() => {
                selectView('tasks')
              }}
            >
              {t('allTasks')}
            </Button>
          </div>
          {taskRows(true)}
        </section>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('schedule')}</h2>
            <Button
              size="sm"
              onClick={() => {
                selectView('calendar')
              }}
            >
              {t('goCalendar')}
            </Button>
          </div>
          <div className={css.agenda}>
            <span>09:30</span>
            <div>
              <strong>{t('calendar.0')}</strong>
              <small>{t('nav.team')}</small>
            </div>
            <span>14:00</span>
            <div>
              <strong>{t('calendar.2')}</strong>
              <small>{t('role.director')}</small>
            </div>
          </div>
          <Button
            onClick={() => {
              selectView('team')
            }}
          >
            {t('goTeam')}
          </Button>
        </section>
      </div>
    </>
  )
  const versionPage = () => (
    <>
      <p className={css.intro}>{t('versions.intro')}</p>
      <div className={css.versionSelect}>
        {fixture.tasks.map(id => (
          <Button
            key={id}
            variant={state.task === id ? 'outline' : 'ghost'}
            onClick={() => {
              actions.openTask(id)
              actions.navigate('versions')
            }}
          >
            {t(taskTitles[id])}
          </Button>
        ))}
      </div>
      <section className={css.card}>
        <h2>{currentTitle}</h2>
        <p className={css.intro}>{t(`role.${role}`)}</p>
        {versions.toReversed().map(v => (
          <div className={css.versionRow} key={v.number}>
            <span className={css.versionBadge}>{t('versionNumber', { number: v.number })}</span>
            <div className={css.grow}>
              <strong>{t(v.number === 1 ? 'versions.initial' : 'versions.saved')}</strong>
              <p>{v.text}</p>
              <details className={css.methodSnapshot}>
                <summary>{t('guide.snapshot')} · {t(method.title)} · {t('guide.progress', { done: v.execution.checked.length })}</summary>
                <h3>{t('guide.evidence')}</h3><p>{v.execution.evidence || t('guide.unrecorded')}</p>
                <h3>{t('guide.analysis')}</h3><p>{v.execution.analysis || t('guide.unrecorded')}</p>
              </details>
            </div>
            <Button
              onClick={() => {
                setSelectedVersion(v.number - 1)
                setDialog('compare')
              }}
            >
              {t('versions.compare')}
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            openTask(state.task)
          }}
        >
          {t('work.draft')}
        </Button>
      </section>
    </>
  )
  const calendarPage = () => (
    <>
      <p className={css.intro}>{t('calendar.intro')}</p>
      <div className={css.calendarLayout}>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('calendar.month')}</h2>
            <Tag>{t('demoSample')}</Tag>
          </div>
          <div className={css.calendar}>
            {[0, 1, 2, 3, 4, 5, 6].map(i => (
              <span className={css.weekday} key={`week-${i}`}>
                {t(`week.${i}` as WorkbenchKey)}
              </span>
            ))}
            {Array.from({ length: 42 }, (_, i) => {
              const day = i - 5
              return day < 1 || day > 30 ? (
                <span key={`blank-${i}`} />
              ) : (
                <button
                  key={day}
                  aria-label={t('calendar.day', { day })}
                  aria-pressed={state.day === day}
                  className={state.day === day ? css.selectedDay : ''}
                  onClick={() => {
                    actions.selectDay(day)
                  }}
                >
                  <span>{day}</span>
                  {([16, 17, 20].includes(day) || state.events.some(e => e.day === day)) && <i />}
                </button>
              )
            })}
          </div>
        </section>
        <section className={css.card}>
          <div className={css.sectionHeading}>
            <h2>{t('calendar.day', { day: state.day })}</h2>
          </div>
          <div className={css.dayEvents}>
            {[16, 17, 20].includes(state.day) && (
              <button
                onClick={() => {
                  openTask(fixture.tasks[0])
                }}
              >
                <small>09:30 — 10:00</small>
                <strong>{t(state.day === 16 ? 'calendar.0' : state.day === 17 ? 'calendar.1' : 'calendar.2')}</strong>
              </button>
            )}
            {state.events
              .filter(e => e.day === state.day)
              .map(e => (
                <div key={e.id}>
                  <small>{t('demoEvent')}</small>
                  <strong>{e.title}</strong>
                </div>
              ))}
            {![16, 17, 20].includes(state.day) && !state.events.some(e => e.day === state.day) && (
              <p className={css.empty}>{t('calendar.none')}</p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEventTitle('')
              setDialog('event')
            }}
          >
            {t('calendar.add')}
          </Button>
        </section>
      </div>
    </>
  )
  const teamPage = () => (
    <>
      <p className={css.intro}>{t('team.intro')}</p>
      <section className={css.card}>
        <div className={css.sectionHeading}>
          <h2>{t(taskTitles[fixture.tasks[0]])}</h2>
          <Button
            onClick={() => {
              openTask(fixture.tasks[0])
            }}
          >
            {t('open')}
          </Button>
        </div>
        <div className={css.teamGrid}>
          {roleIds.map(id => (
            <article key={id} className={css.teamMember}>
              <span className={css.person}>
                <IconUsersOutlineRegular size={22} />
              </span>
              <h3>{t(`role.${id}`)}</h3>
              <p>{t(`team.${id}`)}</p>
              <Tag>{t(id === role ? 'selected' : 'status.waiting')}</Tag>
              <Button
                onClick={() => {
                  selectPosition(id)
                  openTask(roleFixtures[id].tasks[0])
                }}
              >
                {t('team.switch')}
              </Button>
            </article>
          ))}
        </div>
        <section className={css.followUpSection}>
          <h2>{t('assistant.teamQueue')}</h2>
          <div className={css.followUpForm}>
            <label>
              {t('assistant.owner')}
              <select value={followUpRole} onChange={(event) => { setFollowUpRole(event.target.value as RoleId) }}>
                {roleIds.filter(id => id !== role).map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
              </select>
            </label>
            <label>
              {t('assistant.followUp')}
              <Input
                value={followUpText}
                placeholder={t('assistant.followUpPlaceholder')}
                onChange={(event) => { setFollowUpText(event.target.value) }}
              />
            </label>
            <Button variant="primary" disabled={!followUpText.trim()} onClick={() => {
              const item = workItems.find(candidate => candidate.task === state.task) ?? workItems[0]
              if (item !== undefined) {
                actions.addFollowUp(item.id, followUpRole, followUpText.trim())
                actions.setWorkStatus(item.id, 'waiting')
                setFollowUpText('')
                setFeedback(t('assistant.followUpAdded'))
              }
            }}>{t('assistant.sendFollowUp')}</Button>
          </div>
          <div className={css.followUpRows}>
            {state.followUps.map(item => (
              <div className={css.followUpRow} key={item.id}>
                <div className={css.grow}>
                  <strong>{item.text}</strong>
                  <small>{t(taskTitles[workItems.find(candidate => candidate.id === item.workItemId)?.task ?? fixture.tasks[0]])} · {t(`role.${item.role}`)}</small>
                </div>
                <Tag>{t(item.done ? 'assistant.followUpDone' : 'status.waiting')}</Tag>
                {!item.done && <Button onClick={() => {
                  actions.completeFollowUp(item.id)
                  actions.setWorkStatus(item.workItemId, 'inProgress')
                }}>{t('assistant.followUpDone')}</Button>}
              </div>
            ))}
            {state.followUps.length === 0 && <p className={css.empty}>{t('assistant.queueEmpty')}</p>}
          </div>
        </section>
        <p className={css.intro}>{t('team.note')}</p>
      </section>
    </>
  )
  const groupsPage = () => (
    <>
      <div className={css.groupToolbar}>
        <p className={css.intro}>{t('groups.intro')}</p>
        <Button variant="primary" icon={<IconNewChatOutlineRegular size={16} />} onClick={openGroupDialog}>
          {t('groups.create')}
        </Button>
      </div>
      <div className={css.groupLayout}>
        <aside className={css.groupList} aria-label={t('groups.list')}>
          <div className={css.sectionHeading}>
            <h2>{t('groups.list')}</h2>
            <Tag>{t('count', { count: groups.length })}</Tag>
          </div>
          {groups.map(group => (
            <button
              className={`${css.groupListItem} ${activeGroup?.id === group.id ? css.groupListItemActive : ''}`}
              key={group.id}
              aria-current={activeGroup?.id === group.id ? 'page' : undefined}
              onClick={() => { setActiveGroupId(group.id) }}
            >
              <strong>{group.nameKey === undefined ? group.name : t(group.nameKey)}</strong>
              <span>{t(`groups.kind.${group.kind}` as WorkbenchKey)} · {t('groups.memberCount', { count: group.members.length })}</span>
              <small>{t('groups.messageCount', { count: group.messages.length })}</small>
            </button>
          ))}
        </aside>
        {activeGroup !== undefined ? (
          <section className={css.groupConversation} aria-label={t('groups.conversation')}>
            <header className={css.groupHeader}>
              <div>
                <p className={css.eyebrow}>{t('groups.kind.' + activeGroup.kind as WorkbenchKey)}</p>
                <h2>{activeGroup.nameKey === undefined ? activeGroup.name : t(activeGroup.nameKey)}</h2>
              </div>
              <Tag>{t('groups.memberCount', { count: activeGroup.members.length })}</Tag>
            </header>
            <div className={css.groupMembers}>
              <div className={css.groupMemberTags}>
                {activeGroup.members.map(member => (
                  <span className={css.groupMember} key={member}>
                    <strong>{t(`role.${member}`)}</strong>
                    <Button size="sm" variant="ghost" aria-label={t('groups.removeMember', { role: t(`role.${member}`) })} onClick={() => { actions.removeWorkgroupMember(activeGroup.id, member) }}>
                      ×
                    </Button>
                  </span>
                ))}
                {activeGroup.members.length === 0 && <small>{t('groups.noMembers')}</small>}
              </div>
              <div className={css.groupInvite}>
                <label>
                  {t('groups.invitePosition')}
                  <select
                    aria-label={t('groups.invitePosition')}
                    value={selectedGroupInviteRole ?? ''}
                    onChange={(event) => { setGroupInviteRole(event.target.value as RoleId) }}
                    disabled={groupInviteChoices.length === 0}
                  >
                    {groupInviteChoices.map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
                  </select>
                </label>
                <Button variant="outline" disabled={selectedGroupInviteRole === undefined} onClick={() => {
                  if (selectedGroupInviteRole !== undefined) actions.addWorkgroupMember(activeGroup.id, selectedGroupInviteRole)
                }}>
                  {t('groups.invite')}
                </Button>
              </div>
            </div>
            <div className={css.groupMessages} role="log" aria-label={t('groups.history')} aria-live="polite">
              {activeGroup.messages.map(message => (
                <article className={message.author === 'human' ? css.groupMessageHuman : css.groupMessage} key={`${activeGroup.id}:${message.id}`}>
                  <div className={css.groupMessageMeta}>
                    <strong>{t(message.author === 'human' ? 'groups.me' : `role.${message.author}` as WorkbenchKey)}</strong>
                    <small>{t('groups.sequence', { index: message.id })}</small>
                    {message.simulated && <Tag>{t('groups.simulatedAgent')}</Tag>}
                  </div>
                  {message.kind === 'assignment' && message.owner !== undefined && (
                    <p className={css.groupAssignmentMeta}>{t('groups.assignmentOwner', { role: t(`role.${message.owner}`) })}</p>
                  )}
                  <p>{message.bodyKey === undefined ? message.body : t(message.bodyKey)}</p>
                </article>
              ))}
              {activeGroup.messages.length === 0 && <p className={css.empty}>{t('groups.emptyHistory')}</p>}
            </div>
            <div className={css.groupAssignmentForm}>
              <h3>{t('groups.assignTitle')}</h3>
              <div>
                <Input
                  aria-label={t('groups.assignPlaceholder')}
                  placeholder={t('groups.assignPlaceholder')}
                  value={groupAssignmentDraft}
                  onChange={(event) => { setGroupAssignmentDraft(event.target.value) }}
                />
                <label>
                  {t('assistant.owner')}
                  <select
                    aria-label={t('groups.assignmentOwnerSelect')}
                    value={activeGroup.members.includes(groupAssignmentRole) ? groupAssignmentRole : activeGroup.members[0] ?? ''}
                    onChange={(event) => { setGroupAssignmentRole(event.target.value as RoleId) }}
                    disabled={activeGroup.members.length === 0}
                  >
                    {activeGroup.members.map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
                  </select>
                </label>
                <Button variant="outline" disabled={!groupAssignmentDraft.trim() || activeGroup.members.length === 0} onClick={assignGroupWork}>
                  {t('groups.assign')}
                </Button>
              </div>
            </div>
            <form className={css.groupComposer} onSubmit={(event) => { event.preventDefault(); sendGroupMessage() }}>
              <label>
                {t('groups.messageLabel')}
                <textarea
                  aria-label={t('groups.messageLabel')}
                  placeholder={t('groups.messagePlaceholder')}
                  value={groupMessageDraft}
                  onChange={(event) => { setGroupMessageDraft(event.target.value) }}
                />
              </label>
              <Button type="submit" variant="primary" disabled={!groupMessageDraft.trim()}>
                {t('groups.send')}
              </Button>
            </form>
          </section>
        ) : <p className={css.empty}>{t('groups.noGroups')}</p>}
      </div>
      <p className={css.groupDisclaimer}>{t('groups.disclaimer')}</p>
    </>
  )
  const notificationsPage = () => (
    <>
      <div className={css.sectionHeading}>
        <p className={css.intro}>{t('notifications.intro')}</p>
        <Button
          onClick={() => {
            actions.markAllRead()
          }}
        >
          {t('notifications.readAll')}
        </Button>
      </div>
      <section className={css.card}>
        {[0, 1, 2].map(id => (
          <article key={id} className={css.notification}>
            <span className={state.read.includes(id) ? css.readDot : css.unreadDot} />
            <div className={css.grow}>
              <h3>{t(`notification.${id}` as WorkbenchKey)}</h3>
              <p>
                {t(taskTitles[fixture.tasks[0]])} · {t('demoSample')}
              </p>
            </div>
            <Tag>{t(state.read.includes(id) ? 'notifications.read' : 'notifications.unread')}</Tag>
            <Button
              onClick={() => {
                actions.markRead(id)
                openTask(fixture.tasks[0])
              }}
            >
              {t('open')}
            </Button>
            {!state.read.includes(id) && (
              <Button
                onClick={() => {
                  actions.markRead(id)
                }}
              >
                {t('notifications.mark')}
              </Button>
            )}
          </article>
        ))}
      </section>
    </>
  )
  const workPage = () => (
    <>
      <div className={css.workHeading}>
        <div>
          <p className={css.eyebrow}>
            {t(`role.${role}`)} / {t('draftOnly')}
          </p>
          <h1>{currentTitle}</h1>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setDialog('submit')
          }}
        >
          {t(draft?.submitted ? 'work.submitted' : 'work.submit')}
        </Button>
      </div>
      <div className={`${css.card} ${css.methodBanner}`}>
        <div className={css.sectionHeading}>
          <div><small>{t('guide.applied')}</small><h2>{t(method.title)}</h2></div>
          <Tag>{t('guide.progress', { done: execution.checked.length })}</Tag>
        </div>
        <p>{t(method.why)}</p>
      </div>
      {activeScenario !== null && (
        <section className={`${css.card} ${css.scenarioLead}`} aria-label={t('assistant.leadPanel')}>
          <div className={css.sectionHeading}>
            <div>
              <p className={css.eyebrow}>{t('assistant.leadPanel')}</p>
              <h2>{t(`${role}.metric${activeScenario + 1}` as WorkbenchKey)} · {fixture.metrics[activeScenario]}</h2>
            </div>
            <Tag>{t('assistant.aiLead')}</Tag>
          </div>
          <p>{t('assistant.leadPlan', { method: t(method.title), work: currentTitle })}</p>
          <p>{t('assistant.assistantAction')}: {t('assistant.actionPrepare')}</p>
          <p className={css.intro}>{t('assistant.humanReview')}</p>
        </section>
      )}
      <nav className={css.stages} aria-label={t('work.title')}>
        {([0, 1, 2, 3] as const).map(i => (
          <Button
            key={i}
            aria-current={stage === i ? 'step' : undefined}
            variant={stage === i ? 'outline' : 'ghost'}
            onClick={() => {
              setStage(i)
            }}
          >
            {i + 1} · {t((['stage.materials', 'stage.analysis', 'stage.result', 'stage.review'] as const)[i])}
          </Button>
        ))}
      </nav>
      <div className={css.workLayout}>
        <section className={css.card}>
          <div className={css.methodStep}>
            <small>{t('guide.title')}</small>
            <h2>{t(method.steps[stage].title)}</h2>
            <p>{t(method.steps[stage].prompt)}</p>
            <dl className={css.methodFacts}>
              <dt>{t(stage === 0 ? 'guide.inputs' : stage === 1 || stage === 3 ? 'guide.acceptance' : 'guide.output')}</dt>
              <dd>{t(stage === 0 ? practice.inputs : stage === 1 || stage === 3 ? practice.acceptance : practice.output)}</dd>
            </dl>
          </div>
          {stage === 0 ? (
            <>
              <h2>{t('work.evidence')}</h2>
              {[0, 1, 2].map(id => (
                <button
                  className={css.source}
                  key={id}
                  onClick={() => {
                    setDialog('source')
                  }}
                >
                  <IconPaperclipOutlineRegular size={18} />
                  {t(`${role}.source${id}` as WorkbenchKey)}
                  <IconChevronRightOutlineRegular size={14} />
                </button>
              ))}
              <label className={css.field}>
                {t('guide.evidence')}
                <textarea value={execution.evidence} onChange={(e) => {
                  actions.recordMethod(key, 'evidence', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 1 ? (
            <>
              <h2>{t('analysis.title')}</h2>
              <p className={css.intro}>{t('analysis.body')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('guide.analysis')}
                <textarea value={execution.analysis} onChange={(e) => {
                  actions.recordMethod(key, 'analysis', e.target.value, initial)
                }} />
              </label>
            </>
          ) : stage === 3 ? (
            <>
              <h2>{t('stage.review')}</h2>
              <p className={css.intro}>{t(draft?.submitted ? 'work.submitted' : 'work.reviewNote')}</p>
              <section className={css.verification} aria-label={t('assistant.verification')}>
                <div className={css.sectionHeading}>
                  <div><h2>{t('assistant.verification')}</h2><p className={css.intro}>{t('assistant.verificationHint')}</p></div>
                  {currentWorkStatus !== undefined && <Tag>{statusLabel(currentWorkStatus)}</Tag>}
                </div>
                <label className={css.field}>
                  {t('assistant.resultStatus')}
                  <textarea
                    placeholder={t('assistant.verificationPlaceholder')}
                    value={state.verifications[currentWorkItem?.id ?? ''] ?? ''}
                    onChange={(event) => {
                      if (currentWorkItem !== undefined) actions.saveVerification(currentWorkItem.id, event.target.value)
                    }}
                  />
                </label>
                {currentWorkStatus === 'review' && <p className={css.intro}>{t('assistant.awaitingReview')}</p>}
                {currentWorkStatus === 'done' && <p className={css.intro}>{t('assistant.completedAt')}</p>}
                {currentWorkItem !== undefined && currentWorkStatus !== 'done' && (
                  <Button
                    variant="primary"
                    disabled={!(state.verifications[currentWorkItem.id] ?? '').trim()}
                    onClick={() => {
                      actions.setWorkStatus(currentWorkItem.id, 'done')
                      setFeedback(t('assistant.completedAt'))
                    }}
                  >
                    {t('assistant.complete')}
                  </Button>
                )}
              </section>
              {methodChecks()}
              <label className={css.field}>
                {t('work.comment')}
                <textarea
                  value={draft?.comment ?? ''}
                  onChange={(e) => {
                    actions.comment(key, e.target.value, initial)
                  }}
                />
              </label>
              <Button
                onClick={() => {
                  setFeedback(t('work.commentSave'))
                }}
              >
                {t('work.commentSave')}
              </Button>
            </>
          ) : (
            <>
              <div className={css.sectionHeading}>
                <h2>{currentTitle}</h2>
                <Button
                  size="sm"
                  onClick={() => {
                    selectView('versions')
                  }}
                >
                  {t('versionNumber', { number: versions.length })}
                </Button>
              </div>
              <p className={css.intro}>{t('work.context')}</p>
              <p className={css.notice}>{t(`${role}.warning`)}</p>
              <label className={css.field}>
                {t('work.draft')}
                <textarea
                  value={text}
                  onChange={(e) => {
                    actions.editDraft(key, e.target.value, initial)
                  }}
                />
              </label>
              <div className={css.sectionHeading}>
                <small>{t('draftOnly')}</small>
                <Button
                  variant="outline"
                  onClick={() => {
                    actions.saveDraft(key, initial)
                    setFeedback(t('work.saved'))
                  }}
                >
                  {t('work.save')}
                </Button>
              </div>
            </>
          )}
          {stage !== 3 && <div className={css.methodChecks}>
            <Checkbox checked={execution.checked.includes(stage)} label={t('guide.stageDone')}
              onChange={(checked) => { actions.checkMethod(key, stage, checked, initial) }} />
            <Button variant="outline" onClick={() => { setStage(stage === 0 ? 1 : stage === 1 ? 2 : 3) }}>
              {t((['stage.analysis', 'stage.result', 'stage.review'] as const)[stage])}
              <IconChevronRightOutlineRegular size={14} />
            </Button>
          </div>}
          <p className={css.intro}>{t('guide.recordHint')}</p>
        </section>
        <aside className={css.card}>
          <h2>{t('guide.title')}</h2>
          <ol className={css.methodSteps}>
            {([0, 1, 2, 3] as const).map(index => (
              <li key={index}>
                <Button variant={stage === index ? 'outline' : 'ghost'} aria-current={stage === index ? 'step' : undefined}
                  onClick={() => { setStage(index) }}>{t(method.steps[index].title)}</Button>
              </li>
            ))}
          </ol>
          <dl className={css.methodFacts}>
            <dt>{t('guide.output')}</dt><dd>{t(practice.output)}</dd>
            <dt>{t('guide.acceptance')}</dt><dd>{t(practice.acceptance)}</dd>
          </dl>
          <p className={css.intro}>{t('guide.prototype')}</p>
          <details className={css.methodSnapshot} open={activeScenario !== null}>
            <summary>{t('work.ai')}</summary>
            <div className={css.sectionHeading}>
              <h2>{t('work.ai')}</h2>
              <IconLayersOutlineRegular size={18} />
            </div>
            <p className={css.intro}>{t('work.aiHint')}</p>
            <p>{t('work.aiEmpty')}</p>
            <Button
              variant="outline"
              onClick={() => {
                setCandidate(true)
              }}
            >
              {t('work.aiAsk')}
            </Button>
            {candidate && (
              <div className={css.candidate}>
                <h3>{t('work.aiCandidate')}</h3>
                <p>{suggestedStructure}</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    actions.editDraft(key, suggestedStructure, initial)
                    setCandidate(false)
                    setStage(2)
                  }}
                >
                  {t('work.adopt')}
                </Button>
                <Button
                  onClick={() => {
                    setCandidate(false)
                  }}
                >
                  {t('work.dismiss')}
                </Button>
              </div>
            )}
          </details>
        </aside>
      </div>
    </>
  )
  return (
    <Modal open headless title={t('panel')} onClose={onReturn} className={`${css.surface}`} backdropBlur={false}>
      <div className={css.root}>
        <aside className={`${css.navigation} ${navOpen ? css.openNavigation : ''}`} aria-label={t('navLabel')}>
          <div className={css.brand}>
            <IconLayersOutlineRegular size={22} />
            <div>
              <strong>{t('panel')}</strong>
              <small>{t('tenant')}</small>
            </div>
          </div>
          <label className={css.roleSelect}>
            {t('role')}
            <select
              aria-label={t('role')}
              value={role}
              onChange={(e) => {
                const id = roleIds.find(id => id === e.target.value)
                if (id) {
                  selectPosition(id)
                }
              }}
            >
              {roleGroups.map(group => (
                <optgroup key={group.label} label={t(group.label)}>
                  {group.roles.map(id => (
                    <option key={id} value={id}>
                      {t(`role.${id}`)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <small className={css.positionCount}>{t('roleCount')}</small>
          <nav>
            {navigation.map((n) => {
              const Icon = navIcons[n.id]
              return (
                <div key={n.id}>
                  {n.id === 'priorities' && <p className={css.groupLabel}>{t('public')}</p>}
                  {n.id === 'files' && <p className={css.groupLabel}>{t('resources')}</p>}
                  <button
                    className={view === n.id ? css.activeNav : ''}
                    onClick={() => {
                      selectView(n.id)
                    }}
                    aria-current={view === n.id ? 'page' : undefined}
                  >
                    <Icon size={17} />
                    <span>{t(n.label)}</span>
                    {n.id === 'notifications' && unread > 0 && <b>{unread}</b>}
                  </button>
                </div>
              )
            })}
          </nav>
          <div className={css.return}>
            <Button icon={<IconPanelLeftOutlineRegular size={17} />} onClick={onReturn} title={t('returnHint')}>
              {t('return')}
            </Button>
            <small>{t('returnHint')}</small>
          </div>
        </aside>
        <div className={css.main}>
          <header className={css.topbar}>
            <div>
              <Button
                className={css.menuToggle}
                aria-expanded={navOpen}
                aria-label={t('openNav')}
                onClick={() => {
                  setNavOpen(!navOpen)
                }}
                icon={<IconPanelLeftOutlineRegular size={18} />}
              />
              <span>
                {t('tenant')} / {title}
              </span>
            </div>
            <div>
              <Tag>{t('demo')}</Tag>
              <Button
                aria-label={t('search')}
                onClick={() => {
                  selectView('tasks')
                }}
                icon={<IconSearchOutlineRegular size={17} />}
              />
            </div>
          </header>
          <div ref={contentRef} className={css.content}>
            {view !== 'dashboard' && view !== 'assistant' && view !== 'work' && view !== 'priorities' && view !== 'agent' && (
              <div className={css.pageHeading}>
                <div>
                  <p className={css.eyebrow}>
                    {t(`role.${role}`)} / {t('public')}
                  </p>
                  <h1>{title}</h1>
                </div>
                {view === 'tasks' && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      selectView('methods')
                    }}
                  >
                    {t('new')}
                  </Button>
                )}
              </div>
            )}
            {view === 'assistant' ? (
              assistant()
            ) : view === 'dashboard' ? (
              dashboard()
            ) : view === 'priorities' ? (
              prioritiesPage()
            ) : view === 'agent' ? (
              agentPage()
            ) : view === 'tasks' ? (
              <>
                <p className={css.intro}>{t('task.owner')}</p>
                <Input
                  aria-label={t('task.search')}
                  placeholder={t('task.search')}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                  }}
                />
                <section className={css.card}>{taskRows()}</section>
              </>
            ) : view === 'versions' ? (
              versionPage()
            ) : view === 'calendar' ? (
              calendarPage()
            ) : view === 'team' ? (
              teamPage()
            ) : view === 'groups' ? (
              groupsPage()
            ) : view === 'notifications' ? (
              notificationsPage()
            ) : view === 'work' ? (
              workPage()
            ) : view === 'files' ? (
              <>
                <p className={css.intro}>{t('files.intro')}</p>
                <section className={css.card}>
                  {[0, 1, 2].map(id => (
                    <button
                      key={id}
                      className={css.source}
                      onClick={() => {
                        setDialog('source')
                      }}
                    >
                      <IconPaperclipOutlineRegular size={18} />
                      <span className={css.grow}>{t(`${role}.source${id}` as WorkbenchKey)}</span>
                      <span>{t('files.preview')}</span>
                    </button>
                  ))}
                </section>
              </>
            ) : (
              <>
                <p className={css.intro}>{t('methods.intro')}</p>
                {methodCards()}
                <p className={css.intro}>{t('guide.prototype')}</p>
              </>
            )}
            {feedback && (
              <p role="status" className={css.feedback}>
                {feedback}
              </p>
            )}
            <p className={css.disclaimer}>{t('demoNote')}</p>
          </div>
        </div>
        <Modal
          open={dialog !== null}
          className={`${css.detailDialog}`}
          contentClassName={`${css.detailContent}`}
          footer={dialog === 'submit' ? (
            <Button variant="primary" onClick={() => {
              actions.submitDraft(key, initial)
              if (currentWorkItem !== undefined) actions.setWorkStatus(currentWorkItem.id, 'review')
              setDialog(null)
              setStage(3)
              setFeedback(t('work.submitted'))
            }}>{t('confirm')}</Button>
          ) : undefined}
          onClose={() => {
            setDialog(null)
          }}
          closeLabel={t('close')}
          title={t(
            dialog === 'group'
              ? 'groups.createTitle'
              : dialog === 'event'
                ? 'calendar.add'
                : dialog === 'compare'
                  ? 'versions.compare'
                  : dialog === 'source'
                    ? 'files.preview'
                    : 'work.submit',
          )}
        >
          {dialog === 'group' ? (
            <form className={css.createGroupForm} onSubmit={(event) => { event.preventDefault(); createGroup() }}>
              <label>
                {t('groups.name')}
                <Input
                  required
                  data-modal-autofocus
                  value={newGroupName}
                  onChange={(event) => { setNewGroupName(event.target.value) }}
                />
              </label>
              <label>
                {t('groups.kindLabel')}
                <select value={newGroupKind} onChange={(event) => { setNewGroupKind(event.target.value as WorkgroupKind) }}>
                  {(['project', 'supervision', 'topic'] as const).map(kind => (
                    <option value={kind} key={kind}>{t(`groups.kind.${kind}` as WorkbenchKey)}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>{t('groups.members')}</legend>
                <div className={css.groupMemberTags}>
                  {newGroupMembers.map(member => (
                    <span className={css.groupMember} key={member}>
                      <strong>{t(`role.${member}`)}</strong>
                      <Button type="button" size="sm" variant="ghost" aria-label={t('groups.removeMember', { role: t(`role.${member}`) })} onClick={() => {
                        setNewGroupMembers(members => members.filter(id => id !== member))
                      }}>×</Button>
                    </span>
                  ))}
                  {newGroupMembers.length === 0 && <small>{t('groups.noMembers')}</small>}
                </div>
                <div className={css.groupInvite}>
                  <label>
                    {t('groups.invitePosition')}
                    <select
                      aria-label={t('groups.invitePosition')}
                      value={selectedNewGroupInviteRole ?? ''}
                      onChange={(event) => { setNewGroupInviteRole(event.target.value as RoleId) }}
                      disabled={newGroupInviteChoices.length === 0}
                    >
                      {newGroupInviteChoices.map(id => <option value={id} key={id}>{t(`role.${id}`)}</option>)}
                    </select>
                  </label>
                  <Button type="button" variant="outline" disabled={selectedNewGroupInviteRole === undefined} onClick={() => {
                    if (selectedNewGroupInviteRole !== undefined) setNewGroupMembers(members => [...members, selectedNewGroupInviteRole])
                  }}>{t('groups.addMember')}</Button>
                </div>
              </fieldset>
              <Button type="submit" variant="primary" disabled={!newGroupName.trim() || newGroupMembers.length === 0}>{t('groups.create')}</Button>
            </form>
          ) : dialog === 'submit' ? (
            <>
              <p>{t('work.reviewNote')}</p>
              <h3>{t('guide.reviewTitle')}</h3>
              {methodChecks()}
              <p className={css.intro}>
                {currentTitle} · {t(`role.${role}`)}
              </p>
            </>
          ) : dialog === 'event' ? (
            <form
              className={css.eventForm}
              onSubmit={(e) => {
                e.preventDefault()
                if (eventTitle.trim()) {
                  actions.addEvent(eventTitle.trim())
                  setDialog(null)
                }
              }}
            >
              <label>
                {t('calendar.title')}
                <Input
                  required
                  data-modal-autofocus
                  value={eventTitle}
                  onChange={(e) => {
                    setEventTitle(e.target.value)
                  }}
                />
              </label>
              <Button variant="primary" type="submit" disabled={!eventTitle.trim()}>
                {t('calendar.add')}
              </Button>
            </form>
          ) : dialog === 'compare' ? (
            <div className={css.compare}>
              <section>
                <h3>{t('versions.before')}</h3>
                <p>{versions[selectedVersion - 1]?.text ?? t('versions.noPrevious')}</p>
                {executionSnapshot(versions[selectedVersion - 1])}
              </section>
              <section>
                <h3>{t('versions.after')}</h3>
                <p>{versions[selectedVersion]?.text}</p>
                {executionSnapshot(versions[selectedVersion])}
              </section>
            </div>
          ) : (
            <p>{t(`${role}.focus`)}</p>
          )}
        </Modal>
      </div>
    </Modal>
  )
}
