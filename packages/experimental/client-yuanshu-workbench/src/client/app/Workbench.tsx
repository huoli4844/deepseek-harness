/**
 * Role-adapted dashboards and shared workspace rendered in a native DSH panel.
 *
 * 本文件是工作台外壳：持有全部共享状态，经 WorkbenchPageContext 下发给各
 * 菜单页面组件（每个导航项对应一个独立 Screen 文件）；自身只负责导航栏、
 * 路由分发、全局弹窗与智能体会话浮窗。
 */
import { useEffect, useRef, useState } from 'react'
import { PlatformHome } from '../modules/platform-home/PlatformHome.tsx'
import { PersonalWorkspace } from '../modules/personal-workspace/PersonalWorkspace.tsx'
import { ProjectCalendar } from '../modules/calendar/ProjectCalendar.tsx'
import { FilesScreen } from '../modules/files/FilesScreen.tsx'
import { WorkHomeScreen } from '../modules/work-home/WorkHomeScreen.tsx'
import { DashboardScreen } from '../modules/dashboard/DashboardScreen.tsx'
import { ProjectOpsScreen } from '../modules/project-ops/ProjectOpsScreen.tsx'
import { PrioritiesScreen } from '../modules/priorities/PrioritiesScreen.tsx'
import { AgentScreen } from '../modules/agent/AgentScreen.tsx'
import { VersionsScreen } from '../modules/versions/VersionsScreen.tsx'
import { GroupsScreen } from '../modules/groups/GroupsScreen.tsx'
import { NotificationsScreen } from '../modules/notifications/NotificationsScreen.tsx'
import { TaskWorkScreen } from '../modules/task-work/TaskWorkScreen.tsx'
import { ExecutionSnapshot, MethodCards, MethodChecks, TaskRows } from './page-parts.tsx'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  Button,
  Input,
  Modal,
  IconLayersOutlineRegular,
  IconChecklistOutlineRegular,
  IconClockOutlineRegular,
  IconArchiveOutlineRegular,
  IconPaperclipOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconNewChatOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { RoleId, TaskId, WorkbenchStoreProps } from '../core/model.ts'
import { isOperatorView, NOTIFICATION_IDS } from '../core/model.ts'
import { workbenchVersion } from '../workbench-config.ts'
import type { WorkgroupKind } from '../core/data/workgroup-data.ts'
import type { WorkbenchKey } from '../core/locales/locales.ts'
import { navigation, roleFixtures, roleGroups, roleIds, taskTitles } from '../core/fixtures.ts'
import { methodFor, type MethodStage } from '../core/data/methodology-data.ts'
import { workItemsForRole, positionScenarios, type WorkStatus } from '../core/data/scenario-data.ts'
import { priorityAssignment, priorityItems } from '../core/data/priorities-data.ts'
import { createDemoWorkgroups } from '../core/data/workgroup-data.ts'
import { projectActions, projectById } from '../core/data/project-operations.ts'
import { WorkbenchPageContext, type WorkbenchPageApi } from './page-api.ts'
import { OperatorWorkbench, screenOfView, viewOfScreen } from '../operator/index.ts'
import { ProfileScreen, UserBadge, useIdentity } from '../identity/index.ts'
import { PositionOperations } from '../modules/position-ops/index.ts'
import {
  accessRoleOf,
  BudgetCostScreen,
  ContractManagementScreen,
  CustomerResourcesScreen,
  EquipmentLedgerScreen,
  MaterialManagementScreen,
  OrganizationScreen,
  SupplierManagementScreen,
  WeeklyDailyReportsScreen,
  WorkHoursScreen,
  MeetingRoomsScreen,
} from '../modules/business-modules/index.ts'
import { positionSignals } from '../core/data/position-operations.ts'
import css from './Workbench.module.css'

interface WorkbenchInjected {
  readonly openAssistant: (role: string, prompt?: string) => Promise<SessionReference>
  readonly onReturn: () => void
}
type WorkbenchProps = PropsRuntime<'main'> &
  PropsLocale<'yuanshu.workbench'> &
  WorkbenchStoreProps &
  InjectFace<WorkbenchInjected> &
  PropsRenderSlots<'yuanshu.assistant.conversation'>

interface AssistantFloatPosition {
  readonly left: number
  readonly top: number
}

const ASSISTANT_FLOAT_POSITION_KEY = 'dsh.yuanshu.workbench.assistant-float-position'
const ASSISTANT_FLOAT_SIZE = 48
const ASSISTANT_FLOAT_INSET = 12

/**
 * Reuse the existing layers icon in the DSH global panel list.
 * @param props - Host-owned icon size and selected state.
 * @returns the stock DSH glyph.
 */
export function WorkbenchIcon(props: SidebarPanelIconOwnerProps) {
  return <IconLayersOutlineRegular size={props.size} />
}

const navIcons: Record<string, typeof IconLayersOutlineRegular> = {
  'operator-overview': IconLayersOutlineRegular,
  'operator-decisions': IconArchiveOutlineRegular,
  'operator-projects': IconChecklistOutlineRegular,
  'operator-functional': IconLayersOutlineRegular,
  'operator-evidence': IconPaperclipOutlineRegular,
  profile: IconLayersOutlineRegular,
  assistant: IconLayersOutlineRegular,
  dashboard: IconLayersOutlineRegular,
  priorities: IconArchiveOutlineRegular,
  tasks: IconChecklistOutlineRegular,
  calendar: IconClockOutlineRegular,
  groups: IconNewChatOutlineRegular,
  files: IconPaperclipOutlineRegular,
  methods: IconLayersOutlineRegular,
  'project-operations': IconChecklistOutlineRegular,
  'position-operations': IconChecklistOutlineRegular,
  'customer-resources': IconLayersOutlineRegular,
  'material-management': IconLayersOutlineRegular,
  'supplier-management': IconLayersOutlineRegular,
  'equipment-ledger': IconLayersOutlineRegular,
  'contract-management': IconChecklistOutlineRegular,
  'budget-cost': IconLayersOutlineRegular,
  'work-hours': IconClockOutlineRegular,
  'weekly-daily-reports': IconArchiveOutlineRegular,
  'meeting-rooms': IconClockOutlineRegular,
  organization: IconLayersOutlineRegular,
}

/**
 * Render plugin-owned demonstration data with DSH controls, localization, and state.
 * @param props - Framework selectors, declared actions, locale, and return callback.
 * @returns the workbench main-panel content.
 */
export function Workbench(props: WorkbenchProps) {
  const { t, actions, onReturn, openAssistant, renderSlot, SessionProvider } = props
  const state = props.useStore(s => s)
  const { role, view } = state
  const liveHome = Object.getOwnPropertyDescriptor(globalThis, '__DSH_YUANSHU_HOME__')?.value === true
  // 当前登录用户与角色来自后台身份接口；本页只消费视图模型，不直接发请求。
  const identity = useIdentity()
  // 视角只由真实身份的角色编码决定；身份未加载完或为演示数据时不推断。
  const accessRole = accessRoleOf(identity.user.roleCodes, identity.user.tier === 'live' && identity.fetchedAt !== undefined)
  const key = `${role}:${state.task}`
  const fixture = roleFixtures[role]
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<ReadonlySet<string>>(() => new Set(['position-operations']))
  const [query, setQuery] = useState('')
  const [laborLink, setLaborLink] = useState<Parameters<typeof WorkHoursScreen>[0]['initial']>()
  const stage = state.sceneCheckpoints[key]?.stage ?? 0
  const [candidate, setCandidate] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [dialog, setDialog] = useState<'submit' | 'event' | 'source' | 'compare' | 'group' | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantReference, setAssistantReference] = useState<SessionReference>()
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState(false)
  const [assistantFloatPosition, setAssistantFloatPosition] = useState<AssistantFloatPosition>()
  const workbenchRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerX: number; pointerY: number; left: number; top: number; moved: boolean }>()
  const suppressFloatClickRef = useRef(false)
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'role'>('role')
  const [activePriorityId, setActivePriorityId] = useState<string>()
  const [activePriorityRole, setActivePriorityRole] = useState<RoleId>(role)
  const [agentProgress, setAgentProgress] = useState(0)
  const [agentStatus, setAgentStatus] = useState<'ready' | 'running' | 'awaitingApproval' | 'approved'>('ready')
  const [agentDraft, setAgentDraft] = useState('')
  const [groupMessageDraft, setGroupMessageDraft] = useState('')
  const [groupAssignmentDraft, setGroupAssignmentDraft] = useState('')
  const [groupAssignmentRole, setGroupAssignmentRole] = useState<RoleId>(role)
  const [groupAssignmentTask, setGroupAssignmentTask] = useState<TaskId>(state.task)
  const [groupInviteRole, setGroupInviteRole] = useState<RoleId>(role)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupKind, setNewGroupKind] = useState<WorkgroupKind>('project')
  const [newGroupMembers, setNewGroupMembers] = useState<RoleId[]>([role])
  const [newGroupInviteRole, setNewGroupInviteRole] = useState<RoleId>(roleIds.find(id => id !== role) ?? role)
  const [selectedProjectId, setSelectedProjectId] = useState('controller')
  const [projectChangeId, setProjectChangeId] = useState<string>()
  const [projectFocusId, setProjectFocusId] = useState<string>()
  const [groupFocusId, setGroupFocusId] = useState<number>()
  const [decisionChoice, setDecisionChoice] = useState<Record<string, string>>({})
  const [acceptanceEvidence, setAcceptanceEvidence] = useState<Record<string, string>>({})
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (view !== 'project-operations' || projectFocusId === undefined) return
    const record = document.getElementById(projectFocusId)
    if (record === null || !contentRef.current?.contains(record)) return
    record.focus({ preventScroll: true })
    if (typeof record.scrollIntoView === 'function') record.scrollIntoView({ block: 'start' })
  }, [view, projectFocusId])
  useEffect(() => {
    if (view !== 'groups' || groupFocusId === undefined) return
    const record = contentRef.current?.querySelector<HTMLElement>(`#delivery-${groupFocusId}`)
    record?.focus({ preventScroll: true })
    if (typeof record?.scrollIntoView === 'function') record.scrollIntoView({ block: 'nearest' })
  }, [view, groupFocusId])
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
  const groups = state.workgroups ?? createDemoWorkgroups()
  const activeGroup = groups.find(group => group.id === state.activeGroupId) ?? groups[0]
  const activeGroupFollowUps = state.followUps.filter(item => item.groupId === activeGroup?.id)
  const positionCase = role === 'project' ? undefined : state.positionCases?.[role]
  const positionDelivery = state.followUps.find(item => item.positionCase !== undefined && item.positionCase === role)
  const incomingPositionDeliveries = state.followUps.filter(item =>
    item.groupId !== undefined && item.role === role && !item.done)
  const legacyFollowUps = state.followUps.filter(item => item.groupId === undefined)
  const groupAssignmentWorkItem = workItems.find(item => item.task === groupAssignmentTask) ?? workItems[0]
  const groupInviteChoices = activeGroup?.members === undefined ? roleIds : roleIds.filter(id => !activeGroup.members.includes(id))
  const selectedGroupInviteRole = groupInviteChoices.includes(groupInviteRole) ? groupInviteRole : groupInviteChoices[0]
  const newGroupInviteChoices = roleIds.filter(id => !newGroupMembers.includes(id))
  const selectedNewGroupInviteRole = newGroupInviteChoices.includes(newGroupInviteRole) ? newGroupInviteRole : newGroupInviteChoices[0]
  const activePriority = priorityItems.find(item => item.id === activePriorityId)
  const activeAssignment = activePriority === undefined ? undefined : priorityAssignment(activePriority, activePriorityRole)
  const agentScenario = activeAssignment === undefined ? undefined : positionScenarios[activeAssignment.role][activeAssignment.kpiIndex]
  const currentWorkItem = workItems.find(item => item.task === state.task)
  const currentWorkStatus = currentWorkItem === undefined ? undefined : workStatus(currentWorkItem.id, currentWorkItem.status)
  const taskDeliveries = view === 'work' ? state.followUps.filter(item =>
    item.workItemId === key && item.groupId !== undefined && item.projectActionId === undefined && item.positionCase === undefined) : []
  const unread = NOTIFICATION_IDS.filter(id => !state.read.includes(id)).length
  const statusLabel = (status: WorkStatus) => t(({
    attention: 'status.attention', inProgress: 'status.inProgress', waiting: 'status.waiting',
    review: 'status.review', done: 'status.done',
  } as const)[status])
  const projectStatusLabel = (status: 'healthy' | 'watch' | 'critical') => t(`project.status.${status}`)
  const projectRecordStatus = (id: string) => state.projectOps?.[id] ?? 'open'
  const projectRecordStatusLabel = (id: string) => t(`project.recordStatus.${projectRecordStatus(id)}`)
  const title = view === 'work'
    ? currentTitle
    : view === 'agent'
      ? t('agent.title')
      : view === 'versions'
        ? t('versions.pageTitle')
        : t(view === 'team' ? 'nav.groups' : navigation.find(n => n.id === view)?.label ?? 'nav.assistant')
  const openRoleConversation = (prompt?: string, sessionKey: string = role) => {
    setAssistantOpen(true)
    setAssistantLoading(true)
    setAssistantError(false)
    void openAssistant(sessionKey, prompt)
      .then(setAssistantReference)
      .catch(() => { setAssistantError(true) })
      .finally(() => { setAssistantLoading(false) })
  }
  const clampAssistantFloatPosition = (position: AssistantFloatPosition): AssistantFloatPosition => {
    const bounds = workbenchRef.current?.getBoundingClientRect()
    if (bounds === undefined) return position
    return {
      left: Math.max(ASSISTANT_FLOAT_INSET, Math.min(position.left, bounds.width - ASSISTANT_FLOAT_SIZE - ASSISTANT_FLOAT_INSET)),
      top: Math.max(ASSISTANT_FLOAT_INSET, Math.min(position.top, bounds.height - ASSISTANT_FLOAT_SIZE - ASSISTANT_FLOAT_INSET)),
    }
  }
  const beginAssistantFloatDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const bounds = workbenchRef.current?.getBoundingClientRect()
    const button = event.currentTarget.getBoundingClientRect()
    if (bounds === undefined) return
    const left = assistantFloatPosition?.left ?? button.left - bounds.left
    const top = assistantFloatPosition?.top ?? button.top - bounds.top
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, left, top, moved: false }
  }
  const moveAssistantFloat = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag === undefined) return
    const deltaX = event.clientX - drag.pointerX
    const deltaY = event.clientY - drag.pointerY
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true
    if (drag.moved) {
      setAssistantFloatPosition(clampAssistantFloatPosition({ left: drag.left + deltaX, top: drag.top + deltaY }))
    }
  }
  const endAssistantFloatDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.moved) suppressFloatClickRef.current = true
    dragRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  useEffect(() => {
    let parsed: unknown
    try {
      parsed = JSON.parse(localStorage.getItem(ASSISTANT_FLOAT_POSITION_KEY) ?? 'null')
    } catch {
      return
    }
    if (typeof parsed === 'object' && parsed !== null && 'left' in parsed && 'top' in parsed
      && typeof parsed.left === 'number' && Number.isFinite(parsed.left)
      && typeof parsed.top === 'number' && Number.isFinite(parsed.top)) {
      setAssistantFloatPosition(clampAssistantFloatPosition({ left: parsed.left, top: parsed.top }))
    }
  }, [])
  useEffect(() => {
    if (assistantFloatPosition === undefined) return
    try {
      localStorage.setItem(ASSISTANT_FLOAT_POSITION_KEY, JSON.stringify(assistantFloatPosition))
    } catch (_storageWriteFailed) {
      // The control remains movable when browser storage is unavailable.
    }
  }, [assistantFloatPosition])
  useEffect(() => {
    const onResize = () => {
      if (assistantFloatPosition !== undefined) setAssistantFloatPosition(clampAssistantFloatPosition(assistantFloatPosition))
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize) }
  }, [assistantFloatPosition])
  const selectView = (next: typeof view) => {
    setLaborLink(undefined)
    actions.navigate(next)
    setProjectFocusId(undefined)
    setGroupFocusId(undefined)
    setNavOpen(false)
    setFeedback('')
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const selectPosition = (next: RoleId) => {
    actions.changeRole(next)
    selectView('assistant')
    setQuery('')
    setCandidate(false)
    setSelectedVersion(0)
  }
  const openWorkgroup = (id: string, deliveryId?: number) => {
    actions.selectWorkgroup(id)
    selectView('groups')
    setGroupFocusId(deliveryId)
  }
  const openProjectRecord = (projectId: string, recordId: string, expandChange = false) => {
    setSelectedProjectId(projectId)
    setProjectChangeId(expandChange ? recordId : undefined)
    selectView('project-operations')
    setProjectFocusId(recordId)
  }
  const openTask = (id: TaskId, targetStage?: MethodStage) => {
    const taskKey = `${role}:${id}`
    actions.openTask(id)
    if (targetStage !== undefined) actions.setSceneStage(taskKey, targetStage)
    setCandidate(false)
    setFeedback('')
    setNavOpen(false)
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }
  const setWorkStage = (next: MethodStage) => {
    actions.setSceneStage(key, next)
  }
  const openScenario = (kpiIndex: 0 | 1 | 2 | 3, id: TaskId) => {
    const item = workItems.find(entry => entry.task === id)
    if (item !== undefined && workStatus(item.id, item.status) === 'attention') actions.setWorkStatus(item.id, 'inProgress')
    openTask(id)
    actions.setSceneKpi(`${role}:${id}`, kpiIndex)
    setCandidate(state.drafts[`${role}:${id}`] === undefined)
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
    actions.selectWorkgroup(`local-${nextId}`)
    setDialog(null)
  }
  const assignProjectAction = (item: typeof projectActions[number]) => {
    const groupId = item.projectId === 'controller' ? 'project-validation' : `project-${item.projectId}`
    const workItemId = `project:${roleFixtures.project.tasks[1]}`
    const taskText = t(item.title)
    actions.ensureProjectGroup(groupId, t(projectById(item.projectId).name), item.owner)
    if (!state.followUps.some(followUp => followUp.projectActionId === item.id)) {
      actions.addFollowUp(workItemId, item.owner, taskText, groupId, item.id)
      actions.addWorkgroupMessage(groupId, 'human', taskText, 'assignment', false, item.owner)
    }
    actions.selectWorkgroup(groupId)
    selectView('groups')
  }
  const sendGroupMessage = () => {
    if (activeGroup === undefined || groupMessageDraft.trim() === '') return
    const message = groupMessageDraft.trim()
    actions.addWorkgroupMessage(activeGroup.id, 'human', message, 'message', false)
    for (const member of activeGroup.members.slice(0, 3)) {
      actions.addWorkgroupMessage(
        activeGroup.id,
        member,
        t('groups.agentReply', { focus: t(`${member}.focus`) }),
        'message',
        true,
      )
    }
    setGroupMessageDraft('')
  }
  const assignGroupWork = () => {
    if (activeGroup === undefined || groupAssignmentDraft.trim() === '') return
    const owner = activeGroup.members.includes(groupAssignmentRole) ? groupAssignmentRole : activeGroup.members[0]
    if (owner === undefined || groupAssignmentWorkItem === undefined) return
    actions.addWorkgroupMessage(activeGroup.id, 'human', groupAssignmentDraft.trim(), 'assignment', false, owner)
    actions.addFollowUp(groupAssignmentWorkItem.id, owner, groupAssignmentDraft.trim(), activeGroup.id)
    actions.setWorkStatus(groupAssignmentWorkItem.id, 'waiting')
    setGroupAssignmentDraft('')
  }

  // 下发给各菜单页面组件的共享上下文；字段清单见 WorkbenchPageApi。
  const page: WorkbenchPageApi = {
    t, state, actions, role, view, fixture, taskKey: key,
    draft, execution, text, versions, initial, suggestedStructure, methodReady, currentTitle, method, practice, stage,
    workItems, workStatus, openWorkItems, groups, activeGroup, activeGroupFollowUps, legacyFollowUps,
    positionCase, positionDelivery, incomingPositionDeliveries, unread, taskDeliveries,
    currentWorkItem, currentWorkStatus, sourceMetric: state.sceneCheckpoints[key]?.kpiIndex ?? currentWorkItem?.sourceMetricIndex,
    activePriority, activeAssignment, agentScenario, groupAssignmentWorkItem, groupInviteChoices, selectedGroupInviteRole,
    statusLabel, projectStatusLabel, projectRecordStatus, projectRecordStatusLabel,
    selectView, selectPosition, openWorkgroup, openProjectRecord, openTask, setWorkStage, openScenario, openPriority,
    advanceAgent, approveAgent, openGroupDialog, createGroup, assignProjectAction, sendGroupMessage, assignGroupWork,
    openRoleConversation,
    query, setQuery, milestoneOpen, setMilestoneOpen, candidate, setCandidate, sourceIndex, setSourceIndex,
    dialog, setDialog, selectedVersion, setSelectedVersion, feedback, setFeedback,
    priorityFilter, setPriorityFilter, agentProgress, setAgentProgress, agentStatus, setAgentStatus, agentDraft, setAgentDraft,
    groupMessageDraft, setGroupMessageDraft, groupAssignmentDraft, setGroupAssignmentDraft,
    groupAssignmentRole, setGroupAssignmentRole, groupAssignmentTask, setGroupAssignmentTask,
    groupInviteRole, setGroupInviteRole, selectedProjectId, setSelectedProjectId,
    projectChangeId, setProjectChangeId, projectFocusId, setProjectFocusId,
    decisionChoice, setDecisionChoice, acceptanceEvidence, setAcceptanceEvidence,
  }
  return (
    <Modal open headless title={t('panel')} onClose={onReturn} className={`${css.surface}`} backdropBlur={false}>
      <WorkbenchPageContext.Provider value={page}>
        <div ref={workbenchRef} className={css.root}>
          <aside className={`${css.navigation} ${navOpen ? css.openNavigation : ''}`} aria-label={t('navLabel')}>
            <div className={css.brand}>
              <IconLayersOutlineRegular size={22} />
              <div>
                <strong>{t('panel')}<span className={css.version}>({workbenchVersion})</span></strong>
                {!liveHome && <small>{t('tenant')}</small>}
              </div>
            </div>
            {!liveHome && <label className={css.roleSelect}>
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
            </label>}
            {!liveHome && <small className={css.positionCount}>{t('roleCount')}</small>}
            <nav>
              {navigation.map((n) => {
                const Icon = navIcons[n.id] ?? IconLayersOutlineRegular
                const parentActive = view === n.id || n.children?.some(child => child.id === view) === true
                return (
                  <div key={n.id}>
                    {n.id === 'operator-overview' && <p className={css.groupLabel}>{t('operator.group.operations')}</p>}
                    {n.id === 'assistant' && <p className={css.groupLabel}>{t('workGroup')}</p>}
                    {n.id === 'tasks' && <p className={css.groupLabel}>{t('public')}</p>}
                    {n.id === 'files' && <p className={css.groupLabel}>{t('resources')}</p>}
                    <button
                      className={parentActive || (view === 'team' && n.id === 'groups') ? css.activeNav : ''}
                      onClick={() => {
                        selectView(n.id)
                        if (n.children !== undefined) {
                          setExpandedMenus((previous) => {
                            const next = new Set(previous)
                            if (next.has(n.id)) next.delete(n.id)
                            else next.add(n.id)
                            return next
                          })
                        }
                      }}
                      aria-current={parentActive || (view === 'team' && n.id === 'groups') ? 'page' : undefined}
                      aria-expanded={n.children === undefined ? undefined : expandedMenus.has(n.id)}
                    >
                      <Icon size={17} />
                      <span>{t(n.label)}</span>
                      {!liveHome && n.id === 'assistant' && unread > 0 && <b>{unread}</b>}
                    </button>
                    {n.children !== undefined && expandedMenus.has(n.id) && (
                      <div className={css.submenu} aria-label={t(n.label)}>
                        {n.children.map((child) => {
                          const ChildIcon = navIcons[child.id] ?? IconLayersOutlineRegular
                          return <button
                            key={child.id}
                            className={view === child.id ? css.submenuActive : ''}
                            onClick={() => { selectView(child.id) }}
                            aria-current={view === child.id ? 'page' : undefined}
                          >
                            <ChildIcon size={15} />
                            <span>{t(child.label)}</span>
                          </button>
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>
            {/* 底部一行：左「返回」（纯图标）+ 当前用户（头像/姓名/部门·岗位）紧随其后。 */}
            <div className={css.return}>
              <Button
                icon={<IconPanelLeftOutlineRegular size={15} />}
                onClick={onReturn}
                title={t('return')}
                aria-label={t('return')}
              />
              <UserBadge user={identity.user} t={t} />
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
              </div>
            </header>
            <div ref={contentRef} className={css.content}>
              {/* 各页不再渲染顶部大标题，内容直接从顶部开始。 */}
              {isOperatorView(view) ? (
                <OperatorWorkbench
                  t={t}
                  screen={screenOfView(view)}
                  onNavigate={(screen) => { selectView(viewOfScreen(screen)) }}
                />
              ) : view === 'profile' ? (
                <ProfileScreen model={identity} t={t} />
              ) : view === 'customer-resources' ? (
                <CustomerResourcesScreen t={t} />
              ) : view === 'material-management' ? (
                <MaterialManagementScreen t={t} />
              ) : view === 'supplier-management' ? (
                <SupplierManagementScreen t={t} />
              ) : view === 'equipment-ledger' ? (
                <EquipmentLedgerScreen t={t} />
              ) : view === 'contract-management' ? (
                <ContractManagementScreen t={t} />
              ) : view === 'budget-cost' ? (
                <BudgetCostScreen t={t} />
              ) : view === 'work-hours' ? (
                <WorkHoursScreen t={t} initial={laborLink} userId={identity.user.userId} />
              ) : view === 'weekly-daily-reports' ? (
                <WeeklyDailyReportsScreen t={t} role={accessRole} />
              ) : view === 'meeting-rooms' ? (
                <MeetingRoomsScreen t={t} />
              ) : view === 'organization' ? (
                <OrganizationScreen t={t} />
              ) : liveHome ? (
                view === 'assistant' ? (
                  <>
                    <PlatformHome key={view} t={t} section={view} onAnalyze={openRoleConversation} />
                    <NotificationsScreen t={t} />
                  </>
                ) : ['dashboard', 'priorities', 'methods', 'project-operations', 'position-operations'].includes(view)
                  ? <PlatformHome key={view} t={t} section={view} onAnalyze={openRoleConversation} />
                  : view === 'tasks'
                    ? <PersonalWorkspace key={view} t={t} section={view} />
                    : view === 'calendar'
                      ? <ProjectCalendar t={t} />
                      : view === 'files'
                        ? <FilesScreen t={t} />
                        : <section className={css.card}><h1>{title}</h1><p>{t('live.unavailable')}</p></section>
              ) : view === 'assistant' ? (
                <>
                  <WorkHomeScreen t={t} />
                  <NotificationsScreen t={t} />
                </>
              ) : view === 'dashboard' ? (
                <DashboardScreen t={t} />
              ) : view === 'project-operations' ? (
                <ProjectOpsScreen t={t} />
              ) : view === 'position-operations' ? (
                role === 'project' ? (
                  <section className={css.card}>
                    <p>{t('position.module.pending')}</p>
                  </section>
                ) : (
                  <PositionOperations
                    key={role}
                    t={t}
                    role={role}
                    record={positionCase}
                    delivery={positionDelivery}
                    myTasks={<TaskRows compact />}
                    onMethod={() => { openTask(roleFixtures[role].tasks[positionSignals[role].taskIndex]) }}
                    onGroup={openWorkgroup}
                    onDispatch={(option, assignment) => { actions.dispatchPositionCase(role, option, assignment) }}
                    onReview={(note, outcome, checks) => {
                      const reviewText = outcome === 'rework'
                        ? t('position.returned', { note })
                        : `${t('position.status.accepted')} · ${note}`
                      actions.reviewPositionCase(role, note, outcome, checks, reviewText)
                    }}
                  />
                )
              ) : view === 'priorities' ? (
                <PrioritiesScreen t={t} />
              ) : view === 'agent' ? (
                <AgentScreen t={t} />
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
                  <section className={css.card}><TaskRows /></section>
                </>
              ) : view === 'versions' ? (
                <VersionsScreen t={t} />
              ) : view === 'calendar' ? (
                <ProjectCalendar t={t} />
              ) : view === 'team' || view === 'groups' ? (
                <GroupsScreen t={t} />
              ) : view === 'work' ? (
                <TaskWorkScreen t={t} />
              ) : view === 'files' ? (
                <FilesScreen t={t} />
              ) : (
                <>
                  <p className={css.intro}>{t('methods.intro')}</p>
                  <MethodCards />
                  <p className={css.intro}>{t('guide.prototype')}</p>
                </>
              )}
              {feedback && (
                <p role="status" className={css.feedback}>
                  {feedback}
                </p>
              )}
              {!liveHome && <p className={css.disclaimer}>{t('demoNote')}</p>}
            </div>
          </div>
          <Modal
            open={assistantOpen}
            title={t('conversation.title')}
            onClose={() => { setAssistantOpen(false) }}
            className={css.assistantModal ?? ''}
            closeLabel={t('close')}
          >
            {assistantLoading ? <p className={css.assistantState}>{t('conversation.loading')}</p> : null}
            {assistantError ? (
              <div className={css.assistantState}>
                <p>{t('conversation.error')}</p>
                <Button variant="outline" onClick={() => { openRoleConversation() }}>{t('conversation.retry')}</Button>
              </div>
            ) : null}
            {!assistantLoading && !assistantError && assistantReference !== undefined ? (
              <SessionProvider session={assistantReference}>
                {renderSlot('yuanshu.assistant.conversation', {})}
              </SessionProvider>
            ) : null}
          </Modal>
          <Modal
            open={dialog !== null}
            className={`${css.detailDialog}`}
            contentClassName={`${css.detailContent}`}
            footer={dialog === 'submit' ? (
              <Button variant="primary" onClick={() => {
                actions.submitDraft(key, initial)
                if (currentWorkItem !== undefined) actions.setWorkStatus(currentWorkItem.id, 'review')
                setDialog(null)
                setWorkStage(3)
                setFeedback(t('work.submitted'))
              }}>{t('confirm')}</Button>
            ) : undefined}
            onClose={() => {
              setDialog(null)
            }}
            closeLabel={t('close')}
            title={dialog === 'source' ? t(`${role}.source${sourceIndex}` as WorkbenchKey) : t(
              dialog === 'group'
                ? 'groups.createTitle'
                : dialog === 'event'
                  ? 'calendar.add'
                  : dialog === 'compare'
                    ? 'versions.compare'
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
                      <option value={kind} key={kind}>{t(`groups.kind.${kind}`)}</option>
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
                <MethodChecks />
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
                  <ExecutionSnapshot version={versions[selectedVersion - 1]} />
                </section>
                <section>
                  <h3>{t('versions.after')}</h3>
                  <p>{versions[selectedVersion]?.text}</p>
                  <ExecutionSnapshot version={versions[selectedVersion]} />
                </section>
              </div>
            ) : (
              <p>{t('files.intro')}</p>
            )}
          </Modal>
          <button
            type="button"
            className={css.assistantFloat}
            style={assistantFloatPosition === undefined ? undefined : { left: assistantFloatPosition.left, top: assistantFloatPosition.top, right: 'auto', bottom: 'auto' }}
            aria-label={t('conversation.open')}
            title={t('conversation.open')}
            onPointerDown={beginAssistantFloatDrag}
            onPointerMove={moveAssistantFloat}
            onPointerUp={endAssistantFloatDrag}
            onPointerCancel={endAssistantFloatDrag}
            onClick={() => {
              if (suppressFloatClickRef.current) {
                suppressFloatClickRef.current = false
                return
              }
              openRoleConversation()
            }}
          >
            <IconNewChatOutlineRegular size={20} />
          </button>
        </div>
      </WorkbenchPageContext.Provider>
    </Modal>
  )
}
