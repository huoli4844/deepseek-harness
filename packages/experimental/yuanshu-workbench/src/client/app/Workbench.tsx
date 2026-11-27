/**
 * Role-adapted dashboards and shared workspace rendered in a native DSH panel.
 *
 * 本文件是工作台外壳：持有全部共享状态，经 WorkbenchPageContext 下发给各
 * 菜单页面组件（每个导航项对应一个独立 Screen 文件）；自身只负责导航栏、
 * 路由分发、全局弹窗与智能体会话浮窗。
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { WorkbenchAppearanceContext } from './workbench-appearance.ts'
import appearance from './workbench-appearance.module.css'
import { PlatformHome } from '../modules/platform-home/PlatformHome.tsx'
import { PersonalPages } from '../modules/personal-pages/index.ts'
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
import { TodosCard } from '../modules/todos/TodosCard.tsx'
import { TaskWorkScreen } from '../modules/task-work/TaskWorkScreen.tsx'
import { ExecutionSnapshot, MethodCards, MethodChecks, TaskRows } from './page-parts.tsx'
import {
  Button,
  Input,
  Modal,
  IconSettingsOutlineRegular,
  IconSparkleRegular,
  IconLayersOutlineRegular,
  IconChecklistOutlineRegular,
  IconClockOutlineRegular,
  IconArchiveOutlineRegular,
  IconPaperclipOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconNewChatOutlineRegular,
  IconFolderOpenRegular,
  IconAgentPresetOutlineRegular,
  IconProjectAddOutlineRegular,
  IconLightOutlineRegular,
  IconMailUnreadOutlineRegular,
  IconDatabaseOutlineRegular,
  IconFullscreenOutlineRegular,
  IconCompactOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { RoleId, TaskId, WorkbenchStoreProps } from '../core/model.ts'
import { isOperatorView, NOTIFICATION_IDS } from '../core/model.ts'
import { workbenchVersion } from '../workbench-config.ts'
import type { WorkgroupKind } from '../core/data/workgroup-data.ts'
import type { WorkbenchKey } from '../core/locales/locales.ts'
import { menuLabelFor } from '../core/menu-model.ts'
import { landingForRole, menuForRole } from '../core/position-menus.ts'
import { roleFixtures, roleGroups, roleIds, taskTitles } from '../core/fixtures.ts'
import { methodFor, type MethodStage } from '../core/data/methodology-data.ts'
import { workItemsForRole, positionScenarios, type WorkStatus } from '../core/data/scenario-data.ts'
import { priorityAssignment, priorityItems } from '../core/data/priorities-data.ts'
import { createDemoWorkgroups } from '../core/data/workgroup-data.ts'
import { projectActions, projectById, projectRecords, projectRisks } from '../core/data/project-operations.ts'
import { WorkbenchPageContext, type WorkbenchPageApi } from './page-api.ts'
import { OperatorWorkbench, screenOfView, viewOfScreen } from '../operator/index.ts'
import { ProfileContainer, useIdentity } from '../identity/index.ts'
import { OemBrandMark } from './OemBrand.tsx'
import { RailWorkspaceTree } from './RailWorkspaceTree.tsx'
import {
  SettingsDialog, type WorkbenchSettingsSource, type WorkbenchTextSize, type WorkbenchTheme,
} from './SettingsDialog.tsx'
import { IntegrationStatusDialog } from './IntegrationStatusDialog.tsx'
import { fetchIntegrationStatus, testIntegration, type IntegrationSnapshot, type IntegrationTarget } from './integration-api.ts'
import { useHostTheme } from './use-host-theme.ts'
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
import { DoclibWorkbench } from '@deepseek-ai/dsh-yuanshu-doclib/client'
import type { DoclibPanelProps } from '@deepseek-ai/dsh-yuanshu-doclib/client'
import css from './Workbench.module.css'
import shell from './shell.module.css'

interface WorkbenchInjected {
  readonly openAssistant: (role: string, prompt?: string) => Promise<SessionReference>
  readonly onReturn: () => void
  /** 打开（切换到）指定工作区的会话；由 apply 闭包注入。 */
  readonly openWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  /** 打开工作区下的指定会话；由 apply 闭包注入。 */
  readonly openSession: (sessionId: SessionId) => Promise<void>
  /** 资料库面板由工作台统一挂载；缺少 Remote 服务时为空。 */
  readonly doclib?: DoclibPanelProps | undefined
  /** 设置弹窗的仓库与已安装插件数据；缺少 Remote 服务时为空。 */
  readonly settings?: WorkbenchSettingsSource | undefined
}
type WorkbenchProps = PropsRuntime<'main'> &
  PropsLocale<'yuanshu.workbench'> &
  WorkbenchStoreProps &
  InjectFace<WorkbenchInjected> &
  PropsRenderFactories &
  PropsRenderSlots<'yuanshu.assistant.conversation'>

/**
 * Reuse the existing layers icon in the DSH global panel list.
 * @param props - Host-owned icon size and selected state.
 * @returns the stock DSH glyph.
 */
export function WorkbenchIcon(props: SidebarPanelIconOwnerProps) {
  return <IconLayersOutlineRegular size={props.size} />
}

/**
 * 设置中的文字大小档位。
 * 侧栏菜单与内容区共用同一个缩放系数：菜单按 13px × 系数，内容区基准 13px 再整体 zoom，
 * 因此任何档位下内容都不会超过菜单，同时三档的视觉大小确实不同。
 */
const TEXT_SIZE_VARS: Record<
  WorkbenchTextSize,
  { readonly chat: string }
> = {
  small: { chat: '11px' },
  normal: { chat: '12px' },
  large: { chat: '13px' },
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
  doclib: IconFolderOpenRegular,
}

/**
 * Render plugin-owned demonstration data with DSH controls, localization, and state.
 * @param props - Framework selectors, declared actions, locale, and return callback.
 * @returns the workbench main-panel content.
 */
export function Workbench(props: WorkbenchProps) {
  const {
    t,
    actions,
    onReturn,
    openAssistant,
    openWorkspace,
    openSession,
    renderSlot,
    renderFactorySlot,
    SessionProvider,
    doclib,
    settings,
    useWorkspaces,
    useSessions,
  } = props
  const state = props.useStore(s => s)
  const workspaceSnapshot = useWorkspaces(workspaceState => workspaceState)
  const sessionsById = useSessions(sessionsState => sessionsState.byId)
  useEffect(() => {
    // 待办事项已并入「我的任务」；旧持久化状态落到 assistant 时迁移过去。
    if (state.view === 'assistant') actions.navigate('tasks')
  }, [state.view, actions])
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()) }, 1000)
    return () => { clearInterval(timer) }
  }, [])
  const { role, view } = state
  const liveHome = Object.getOwnPropertyDescriptor(globalThis, '__DSH_YUANSHU_HOME__')?.value === true
  // 当前登录用户与角色来自后台身份接口；本页只消费视图模型，不直接发请求。
  const identity = useIdentity()
  // 视角只由真实身份的角色编码决定；身份未加载完或为演示数据时不推断。
  const accessRole = accessRoleOf(identity.user.roleCodes, identity.user.tier === 'live' && identity.fetchedAt !== undefined)
  // AI 中心暂只对 CEO 岗位（公司管理层视角）开放，其他岗位隐藏入口。
  const canSeeAiCenter = role === 'executive'
  const key = `${role}:${state.task}`
  const fixture = roleFixtures[role]
  const [milestoneOpen, setMilestoneOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [expandedMenus, setExpandedMenus] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [laborLink, setLaborLink] = useState<Parameters<typeof WorkHoursScreen>[0]['initial']>()
  const stage = state.sceneCheckpoints[key]?.stage ?? 0
  const [candidate, setCandidate] = useState(false)
  const [sourceIndex, setSourceIndex] = useState(0)
  const [dialog, setDialog] = useState<'submit' | 'event' | 'source' | 'compare' | 'group' | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [selectedVersion, setSelectedVersion] = useState(0)
  const [feedback, setFeedback] = useState('')
  // 右栏宽屏常驻；窄屏默认收起，由顶栏开关以抽屉形式唤出。
  const [assistantRailOpen, setAssistantRailOpen] = useState(true)
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const [assistantReference, setAssistantReference] = useState<SessionReference>()
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState(false)
  const [assistantTab, setAssistantTab] = useState<'chat' | 'risk' | 'advice'>('chat')
  const [assistantFull, setAssistantFull] = useState(false)
  const [assistantWidth, setAssistantWidth] = useState(320)
  const [resizingRail, setResizingRail] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 数据同步状态：顶栏图标弹窗读取，定时五分钟刷新；测试成功才更新同步时间。
  const [integrationOpen, setIntegrationOpen] = useState(false)
  const [integration, setIntegration] = useState<IntegrationSnapshot | null>(null)
  const [integrationTesting, setIntegrationTesting] = useState<IntegrationTarget | null>(null)
  const [integrationFailed, setIntegrationFailed] = useState(false)
  const [syncAt, setSyncAt] = useState(() => new Date())
  const syncTime = syncAt.toLocaleTimeString(undefined, { hour12: false })
  const [theme, setTheme] = useState<WorkbenchTheme>('system')
  // 跟随系统时以宿主（DeepSeek Harness）当前解析后的主题为准，宿主切主题即时同步。
  const hostTheme = useHostTheme()
  const resolvedTheme = theme === 'system' ? hostTheme : theme
  const [textSize, setTextSize] = useState<WorkbenchTextSize>('normal')
  // 顶栏时钟：本组件内部定时刷新，不订阅任何外部状态。
  const [now, setNow] = useState(() => new Date())
  const clockTime = now.toLocaleTimeString(undefined, { hour12: false })
  const clockDate = now.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', weekday: 'short' })

  // 接入状态：挂载即读取；全部连通时每五分钟刷新，未连通时十五秒重试（测试版定时同步）。
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      let next: number
      try {
        const snapshot = await fetchIntegrationStatus()
        if (!alive) return
        setIntegration(snapshot)
        setIntegrationFailed(false)
        const stamps = [
          snapshot.knowledge.connected ? snapshot.knowledge.checkedAt : null,
          snapshot.api.connected ? snapshot.api.checkedAt : null,
        ]
          .filter((value): value is string => value !== null)
          .map(value => new Date(value).getTime())
          .filter(value => Number.isFinite(value))
        if (stamps.length > 0) setSyncAt(new Date(Math.max(...stamps)))
        next = snapshot.knowledge.connected && snapshot.api.connected ? 300_000 : 15_000
      } catch {
        if (!alive) return
        setIntegrationFailed(true)
        next = 15_000
      }
      timer = setTimeout(() => { void load() }, next)
    }
    void load()
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  /** 手动测试一项接入；只有成功回执才刷新顶栏同步时间。 */
  const runIntegrationTest = (target: IntegrationTarget) => {
    setIntegrationTesting(target)
    void testIntegration(target).then((snapshot) => {
      setIntegration(snapshot)
      setIntegrationFailed(false)
      const succeeded = target === 'knowledge' ? snapshot.knowledge.connected : snapshot.api.connected
      const at = target === 'knowledge' ? snapshot.knowledge.checkedAt : snapshot.api.checkedAt
      if (succeeded && at !== null) setSyncAt(new Date(at))
    }).catch(() => { setIntegrationFailed(true) }).finally(() => { setIntegrationTesting(null) })
  }
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
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const autoSessionRole = useRef<string>()
  const resizeStart = useRef<{ x: number; width: number; max: number }>()
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
  // 顶栏 KPI 只汇总本地已有计数，不引入新的业务数字。
  const inProgressCount = workItems.filter(item => workStatus(item.id, item.status) === 'inProgress').length
  const todayEventCount = state.events.filter(event => event.day === state.day).length
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
        : view === 'personal-pages' ? t('personalPages.nav')
          : t(view === 'team' ? 'nav.groups' : menuLabelFor(view) ?? 'nav.assistant')
  // 菜单按岗位画像组装：公共项恒定，业务应用随岗位原型、置顶与隐藏变化。
  const menuSections = menuForRole(role)
  const startAssistantSession = (prompt?: string, sessionKey: string = role) => {
    setAssistantLoading(true)
    setAssistantError(false)
    void openAssistant(sessionKey, prompt)
      .then(setAssistantReference)
      .catch(() => { setAssistantError(true) })
      .finally(() => { setAssistantLoading(false) })
  }
  const openRoleConversation = (prompt?: string, sessionKey: string = role) => {
    setAssistantRailOpen(true)
    setAssistantExpanded(true)
    startAssistantSession(prompt, sessionKey)
  }
  // 桌面端进入工作台即为当前岗位建立原生会话，右栏直接显示 DSH 默认对话界面。
  useEffect(() => {
    if (!liveHome) return
    if (autoSessionRole.current === role) return
    autoSessionRole.current = role
    startAssistantSession()
  }, [role, liveHome])
  // 开始拖拽右栏：上限取导航栏右侧的全部可用宽度，让两侧都能被完全挤占。
  const beginRailResize = (event: ReactPointerEvent): void => {
    event.preventDefault()
    const root = rootRef.current
    const nav = root?.querySelector<HTMLElement>(`.${css.navigation}`)
    const available = (root?.clientWidth ?? 0) - (nav?.offsetWidth ?? 0)
    resizeStart.current = { x: event.clientX, width: assistantWidth, max: available > 0 ? available : 560 }
    setResizingRail(true)
  }
  // 右栏与内容区之间的拖拽分隔条：调整问答栏宽度，可拖到任一侧完全占满。
  useEffect(() => {
    if (!resizingRail) return
    const handleMove = (event: PointerEvent) => {
      const start = resizeStart.current
      if (start === undefined) return
      const next = Math.min(start.max, Math.max(0, start.width + (start.x - event.clientX)))
      setAssistantWidth(next)
    }
    const handleUp = () => {
      resizeStart.current = undefined
      setResizingRail(false)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [resizingRail])
  const toggleAssistantRail = () => {
    setAssistantExpanded(value => !value)
    setAssistantRailOpen(true)
  }
  // 点击顶栏时间：交给系统日历协议；桌面端 window-open 处理器会转成 openExternal。
  const openSystemCalendar = () => {
    if (typeof window.open !== 'function') return
    window.open('ical://', '_blank', 'noopener')
  }
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
    selectView(landingForRole(next))
    // 切岗位后旧会话属于上一岗位，清空并回到问答栏的问候态。
    setAssistantReference(undefined)
    setAssistantError(false)
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
  const appearanceClasses = [appearance.theme, resolvedTheme === 'light' && appearance.light, appearance[textSize]].filter(Boolean).join(' ')
  const panel = (
    <Modal open headless title={t('panel')} onClose={onReturn} className={`${css.surface}`} backdropBlur={false}>
      <WorkbenchPageContext.Provider value={page}>
        <div
          ref={rootRef}
          className={[css.root, appearanceClasses].join(' ')}
          data-theme={resolvedTheme}
          style={{
            '--dsh-chat-font-size': TEXT_SIZE_VARS[textSize].chat,
          } as CSSProperties}
        >
          {/* 全局顶栏：品牌 + 本地 KPI 计数 + 日期/窄屏开关，横跨整窗。 */}
          <header className={css.topbar}>
            <div className={`${css.brand} ${shell.brandBlock}`}>
              <OemBrandMark size={22} fallback={<IconLayersOutlineRegular size={20} />} />
              <div>
                <strong>{t('panel')}<span className={css.version}>({workbenchVersion})</span></strong>
                {!liveHome && <small>{t('tenant')}</small>}
              </div>
            </div>
            <div className={shell.kpiStrip}>
              <div className={shell.kpiCell}>
                <span className={shell.kpiLabel}>{t('header.kpi.open')}</span>
                <span className={shell.kpiValue}>{openWorkItems.length}</span>
              </div>
              <div className={shell.kpiCell}>
                <span className={shell.kpiLabel}>{t('header.kpi.active')}</span>
                <span className={shell.kpiValue}>{inProgressCount}</span>
              </div>
              <div className={shell.kpiCell}>
                <span className={shell.kpiLabel}>{t('header.kpi.alerts')}</span>
                <span className={shell.kpiValue}>{unread}</span>
              </div>
              <div className={shell.kpiCell}>
                <span className={shell.kpiLabel}>{t('header.kpi.events')}</span>
                <span className={shell.kpiValue}>{todayEventCount}</span>
              </div>
            </div>
            <div className={shell.headerMeta}>
              <button
                type="button"
                className={shell.iconButton}
                aria-label={t('header.notifications')}
                onClick={() => { selectView('tasks') }}
              >
                <IconMailUnreadOutlineRegular size={16} />
                {unread > 0 ? <b className={shell.badge}>{unread}</b> : null}
              </button>
              <button
                type="button"
                className={shell.aiToggle}
                aria-pressed={assistantRailOpen}
                aria-label={t('header.aiToggle')}
                title={t('header.aiToggle')}
                onClick={() => {
                  setAssistantRailOpen(!assistantRailOpen)
                  setAssistantFull(false)
                }}
              >
                <IconSparkleRegular size={14} />
                <span>{t('header.ai')}</span>
              </button>
              <button
                type="button"
                className={shell.iconButton}
                aria-label={t('header.settings')}
                title={t('header.settings')}
                onClick={() => { setSettingsOpen(true) }}
              >
                <IconSettingsOutlineRegular size={16} />
              </button>
              <button
                type="button"
                className={shell.syncPill}
                aria-label={t('header.syncHint')}
                title={t('header.syncHint')}
                onClick={() => { setIntegrationOpen(true) }}
              >
                <IconDatabaseOutlineRegular size={14} />
                <span>{t('header.sync')}</span>
                <b>{syncTime}</b>
              </button>
              <button
                type="button"
                className={shell.clockChip}
                title={t('header.openCalendar')}
                aria-label={t('header.openCalendar')}
                onClick={() => { openSystemCalendar() }}
              >
                <b>{clockTime}</b>
                <small>{clockDate}</small>
              </button>
              <span className={shell.headerDivider} aria-hidden="true" />
              <span className={shell.avatar} aria-hidden="true">
                {identity.user.displayName.charAt(0)}
              </span>
              <span className={shell.userChip}>
                <b>{identity.user.displayName}</b>
                <small>{t(`role.${role}`)}</small>
              </span>
              <Button
                className={css.menuToggle}
                aria-expanded={navOpen}
                aria-label={t('openNav')}
                onClick={() => { setNavOpen(!navOpen) }}
                icon={<IconPanelLeftOutlineRegular size={16} />}
              />
              <Button
                className={shell.railToggle}
                aria-label={t('header.assistantToggle')}
                aria-expanded={assistantExpanded}
                onClick={toggleAssistantRail}
                icon={<IconNewChatOutlineRegular size={16} />}
              />
            </div>
          </header>
          <aside className={`${css.navigation} ${navOpen ? css.openNavigation : ''}`} aria-label={t('navLabel')}>
            {/* 左上方模块入口统一使用工作台导航。 */}
            <div className={shell.modules}>
              {canSeeAiCenter && (
                <button
                  type="button"
                  className={`${shell.module} ${shell.moduleAi} ${view === 'dashboard' ? shell.moduleActive : ''}`}
                  onClick={() => { selectView('dashboard') }}
                >
                  <span className={shell.moduleIcon}><IconAgentPresetOutlineRegular size={16} /></span>
                  <span className={shell.moduleText}>
                    <strong>{t('module.ai')}</strong>
                  </span>
                  <span className={shell.moduleBadge}>{t('module.aiBadge')}</span>
                </button>
              )}
              <button
                type="button"
                className={`${shell.module} ${shell.moduleProjects} ${view === 'project-operations' ? shell.moduleActive : ''}`}
                onClick={() => { selectView('project-operations') }}
              >
                <span className={shell.moduleIcon}><IconProjectAddOutlineRegular size={16} /></span>
                <span className={shell.moduleText}>
                  <strong>{t('module.projects')}</strong>
                </span>
                <span className={shell.moduleBadge}>
                  {t('module.projectsCount', { count: projectRecords.length })}
                </span>
              </button>
              <button
                type="button"
                className={`${shell.module} ${shell.moduleKnowledge} ${view === 'doclib' ? shell.moduleActive : ''}`}
                onClick={() => { selectView('doclib') }}
              >
                <span className={shell.moduleIcon}><IconLightOutlineRegular size={16} /></span>
                <span className={shell.moduleText}>
                  <strong>{t('module.knowledge')}</strong>
                </span>
              </button>
              <button type="button" className={`${shell.module} ${view === 'personal-pages' ? shell.moduleActive : ''}`}
                aria-current={view === 'personal-pages' ? 'page' : undefined} onClick={() => { selectView('personal-pages') }}>
                <span className={shell.moduleIcon}><IconLayersOutlineRegular size={16} /></span>
                <span className={shell.moduleText}><strong>{t('personalPages.nav')}</strong></span>
              </button>
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
              {menuSections.map(section => (
                <div key={section.id}>
                  <p className={css.groupLabel}>{t(section.label)}</p>
                  {section.entries.map((n) => {
                    const Icon = navIcons[n.id] ?? IconLayersOutlineRegular
                    const parentActive = view === n.id || n.children?.some(child => child.id === view) === true
                    return (
                      <div key={n.id}>
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
                </div>
              ))}
            </nav>
            {/* 底部工作量摘要：对应原型左轨底部的状态卡。 */}
            <div className={shell.railSummary}>
              <div className={shell.railSummaryHead}>
                <span>{t('rail.workload')}</span>
                <b>{openWorkItems.length}/{workItems.length}</b>
              </div>
              <div className={shell.railProgress}>
                <span style={{ width: `${workItems.length === 0 ? 0 : Math.round((openWorkItems.length / workItems.length) * 100)}%` }} />
              </div>
              <small>{t('rail.workloadHint', { active: openWorkItems.length, total: workItems.length })}</small>
            </div>
            {/* 底部只保留紧凑的「返回本地工作台」，人员信息移到右上角。 */}
            <div className={css.return}>
              <Button
                size="sm"
                icon={<IconPanelLeftOutlineRegular size={15} />}
                onClick={onReturn}
                title={t('returnLocal')}
                aria-label={t('returnLocal')}
              >
                {t('returnLocal')}
              </Button>
            </div>
          </aside>
          <div className={css.main}>
            <div ref={contentRef} className={css.content}>
              {/* 各页不再渲染顶部大标题，内容直接从顶部开始。 */}
              {view === 'personal-pages' ? <PersonalPages t={t} /> : view === 'doclib' ? (
                doclib === undefined
                  ? <p className={css.doclibMissing}>{t('doclib.unavailable')}</p>
                  : <div className={css.doclibView}><DoclibWorkbench {...doclib} /></div>
              ) : isOperatorView(view) ? (
                <OperatorWorkbench
                  t={t}
                  screen={screenOfView(view)}
                  onNavigate={(screen) => { selectView(viewOfScreen(screen)) }}
                />
              ) : view === 'profile' ? (
                <ProfileContainer model={identity} t={t} />
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
                ) : view === 'dashboard' ? (
                  <>
                    {/* AI 中心：直接展示密集总览，不占用顶部标题空间。 */}
                    <DashboardScreen t={t} />
                  </>
                ) : ['priorities', 'methods', 'project-operations', 'position-operations'].includes(view)
                  ? <PlatformHome key={view} t={t} section={view} onAnalyze={openRoleConversation} />
                  : view === 'tasks'
                    ? <>
                      {/* 本地待办：对话工具写入的待办清单（与个人任务并列展示）。 */}
                      <TodosCard />
                      <PersonalWorkspace key={view} t={t} section={view} />
                      <NotificationsScreen t={t} />
                    </>
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
                  <TodosCard />
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
                  <NotificationsScreen t={t} />
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
          {/* 右侧常驻智能问答栏：宽屏一直显示，窄屏由顶栏开关以抽屉形式唤出。 */}
          <aside
            className={`${shell.assistantRail} ${assistantRailOpen ? '' : shell.railCollapsed} ${assistantExpanded ? shell.railExpanded : ''} ${assistantFull ? shell.railFullscreen : ''}`}
            aria-label={t('conversation.railTitle')}
            style={assistantFull ? undefined : { width: assistantWidth }}
          >
            {assistantFull ? null : (
              <div
                className={shell.railResizer}
                role="separator"
                aria-orientation="vertical"
                aria-label={t('rail.resize')}
                onPointerDown={beginRailResize}
              />
            )}
            <div className={shell.railHeader}>
              <div className={shell.railTabs}>
                <button
                  type="button"
                  className={assistantTab === 'chat' ? shell.railTabActive : shell.railTab}
                  onClick={() => { setAssistantTab('chat') }}
                >{t('conversation.railTitle')}</button>
                <button
                  type="button"
                  className={assistantTab === 'risk' ? shell.railTabActive : shell.railTab}
                  onClick={() => { setAssistantTab('risk') }}
                >{t('rail.risk')}</button>
                <button
                  type="button"
                  className={assistantTab === 'advice' ? shell.railTabActive : shell.railTab}
                  onClick={() => { setAssistantTab('advice') }}
                >{t('rail.advice')}</button>
              </div>
              {/* 对话栏右上角工作区切换：二级树展示工作区与其会话，支持新建工作区。 */}
              <RailWorkspaceTree t={t} workspaces={workspaceSnapshot} sessions={sessionsById}
                openWorkspace={openWorkspace} openSession={openSession} renderFactorySlot={renderFactorySlot} />
              <button
                type="button"
                className={shell.railClose}
                aria-label={assistantFull ? t('rail.restore') : t('rail.expand')}
                aria-pressed={assistantFull}
                onClick={() => { setAssistantFull(!assistantFull) }}
              >
                {assistantFull ? <IconCompactOutlineRegular size={14} /> : <IconFullscreenOutlineRegular size={14} />}
              </button>
              <button
                type="button"
                className={shell.railClose}
                aria-label={t('conversation.collapse')}
                onClick={() => { setAssistantRailOpen(false); setAssistantExpanded(false); setAssistantFull(false) }}
              >×</button>
            </div>
            {assistantTab === 'risk' ? (
              <div className={shell.railBody}>
                <p className={shell.railSectionHint}>{t('rail.riskHint')}</p>
                {projectRisks.map(risk => (
                  <div key={risk.id} className={shell.railListItem}>
                    <strong>{t(risk.title)}</strong>
                    <small>{t(`role.${risk.owner}`)} · {t('rail.due', { due: risk.due })}</small>
                    <span className={shell.riskLevel}>
                      {t(`rail.probability.${risk.probability}`)} · {t(`rail.impact.${risk.impact}`)}
                    </span>
                  </div>
                ))}
              </div>
            ) : assistantTab === 'advice' ? (
              <div className={shell.railBody}>
                <p className={shell.railSectionHint}>{t('rail.adviceHint')}</p>
                {projectActions.map(action => (
                  <div key={action.id} className={shell.railListItem}>
                    <strong>{t(action.title)}</strong>
                    <small>{t(`role.${action.owner}`)} · {action.due}</small>
                  </div>
                ))}
              </div>
            ) : assistantLoading ? (
              <p className={shell.railState}>{t('conversation.loading')}</p>
            ) : assistantError ? (
              <div className={shell.railState}>
                <p>{t('conversation.error')}</p>
                <Button variant="outline" onClick={() => { openRoleConversation() }}>{t('conversation.retry')}</Button>
              </div>
            ) : assistantReference !== undefined ? (
              <div className={shell.railSession}>
                <SessionProvider session={assistantReference}>
                  {renderSlot('yuanshu.assistant.conversation', {})}
                </SessionProvider>
              </div>
            ) : null}
          </aside>
          {/* 右栏被拖到完全收起时，在窗口右缘保留一条可再次拖出的分隔条。 */}
          {assistantRailOpen && !assistantFull && assistantWidth <= 4 && (
            <div
              className={shell.railRestore}
              role="separator"
              aria-orientation="vertical"
              aria-label={t('rail.resize')}
              onPointerDown={beginRailResize}
            />
          )}
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
          <IntegrationStatusDialog
            open={integrationOpen}
            onClose={() => { setIntegrationOpen(false) }}
            t={t}
            snapshot={integration}
            testing={integrationTesting}
            failed={integrationFailed}
            onTest={runIntegrationTest}
          />
          <SettingsDialog
            open={settingsOpen}
            onClose={() => { setSettingsOpen(false) }}
            t={t}
            theme={theme}
            resolvedTheme={resolvedTheme}
            onTheme={setTheme}
            textSize={textSize}
            onTextSize={setTextSize}
            source={settings}
            sessionId={assistantReference?.sessionId}
          />
        </div>
      </WorkbenchPageContext.Provider>
    </Modal>
  )
  return <WorkbenchAppearanceContext.Provider value={appearanceClasses}>{panel}</WorkbenchAppearanceContext.Provider>
}
