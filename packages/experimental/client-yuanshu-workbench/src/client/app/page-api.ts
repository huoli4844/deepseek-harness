/**
 * 工作台页面上下文：所有菜单页面（各 Screen 组件）共享的状态、派生值与动作。
 *
 * Workbench 外壳持有全部状态，经此 Context 下发给各页面组件；页面组件只消费
 * 本接口，不直接持有跨页状态——这样每个模块可以独立成文件、独立开发。
 */
import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DraftVersion, MethodExecution, RoleId, TaskId, ViewId, WorkbenchState, WorkbenchStoreProps } from '../core/model.ts'
import type { WorkbenchKey } from '../core/locales/locales.ts'
import type { WorkgroupKind } from '../core/data/workgroup-data.ts'
import type { MethodStage } from '../core/data/methodology-data.ts'
import type { WorkStatus } from '../core/data/scenario-data.ts'
import type { ProjectRecordStatus } from '../core/data/project-operations.ts'
import { methodFor } from '../core/data/methodology-data.ts'
import { workItemsForRole } from '../core/data/scenario-data.ts'
import { priorityItems } from '../core/data/priorities-data.ts'
import { projectActions } from '../core/data/project-operations.ts'
import { roleFixtures } from '../core/fixtures.ts'

/** 命名空间翻译函数。 */
export type WorkbenchT = PropsLocale<'yuanshu.workbench'>['t']
/** 角色演示任务行（scenario-data）。 */
export type WorkItem = ReturnType<typeof workItemsForRole>[number]
/** 某角色某任务的方法实践定义（methodology-data）。 */
export type MethodPractice = ReturnType<typeof methodFor>
/** 经营优先级条目（priorities-data）。 */
export type PriorityItem = typeof priorityItems[number]
/** 项目运营动作条目（project-operations）。 */
export type ProjectAction = typeof projectActions[number]
/** 协作群组（workgroup-data）。 */
export type Workgroup = NonNullable<WorkbenchState['workgroups']>[number]
/** 角色演示夹具（fixtures）。 */
export type RoleFixture = typeof roleFixtures[RoleId]

/** 页面组件可用的全部共享能力；由 Workbench 外壳构造并下发。 */
export interface WorkbenchPageApi {
  /** 命名空间翻译函数。 */
  readonly t: WorkbenchT
  /** 工作台 store 快照。 */
  readonly state: WorkbenchState
  /** 工作台声明动作。 */
  readonly actions: WorkbenchStoreProps['actions']
  readonly role: RoleId
  readonly view: ViewId
  readonly fixture: RoleFixture
  /** 当前任务键 `${role}:${task}`。 */
  readonly taskKey: string

  // ---- 当前任务的草稿与方法状态 ----
  readonly draft: import('../core/model.ts').WorkDraft | undefined
  readonly execution: MethodExecution
  readonly text: string
  readonly versions: DraftVersion[]
  readonly initial: string
  readonly suggestedStructure: string
  readonly methodReady: boolean
  readonly currentTitle: string
  readonly method: MethodPractice['method']
  readonly practice: MethodPractice
  readonly stage: 0 | 1 | 2 | 3

  // ---- 任务 / 群组 / 岗位派生 ----
  readonly workItems: readonly WorkItem[]
  /** 读取某任务行的工作状态（store 覆盖优先，否则用演示默认值）。 */
  workStatus: (id: string, fallback: WorkStatus) => WorkStatus
  readonly openWorkItems: readonly WorkItem[]
  readonly groups: readonly Workgroup[]
  readonly activeGroup: Workgroup | undefined
  readonly activeGroupFollowUps: WorkbenchState['followUps']
  readonly legacyFollowUps: WorkbenchState['followUps']
  readonly positionCase: import('../core/data/position-operations.ts').PositionCaseRecord | undefined
  readonly positionDelivery: WorkbenchState['followUps'][number] | undefined
  readonly incomingPositionDeliveries: WorkbenchState['followUps']
  readonly unread: number
  readonly taskDeliveries: WorkbenchState['followUps']
  readonly currentWorkItem: WorkItem | undefined
  readonly currentWorkStatus: WorkStatus | undefined
  readonly sourceMetric: 0 | 1 | 2 | 3 | undefined
  readonly activePriority: PriorityItem | undefined
  readonly activeAssignment: ReturnType<typeof import('../core/data/priorities-data.ts').priorityAssignment> | undefined
  readonly agentScenario: import('../core/data/scenario-data.ts').PositionScenario | undefined
  readonly groupAssignmentWorkItem: WorkItem | undefined
  readonly groupInviteChoices: readonly RoleId[]
  readonly selectedGroupInviteRole: RoleId | undefined

  // ---- 状态标签 ----
  statusLabel: (status: WorkStatus) => string
  projectStatusLabel: (status: 'healthy' | 'watch' | 'critical') => string
  projectRecordStatus: (id: string) => ProjectRecordStatus
  projectRecordStatusLabel: (id: string) => string

  // ---- 导航与打开动作 ----
  selectView: (next: ViewId) => void
  selectPosition: (next: RoleId) => void
  openWorkgroup: (id: string, deliveryId?: number) => void
  openProjectRecord: (projectId: string, recordId: string, expandChange?: boolean) => void
  openTask: (id: TaskId, targetStage?: MethodStage) => void
  setWorkStage: (next: MethodStage) => void
  openScenario: (kpiIndex: 0 | 1 | 2 | 3, id: TaskId) => void
  openPriority: (item: PriorityItem) => void
  advanceAgent: () => void
  approveAgent: () => void
  openGroupDialog: () => void
  createGroup: () => void
  assignProjectAction: (item: ProjectAction) => void
  sendGroupMessage: () => void
  assignGroupWork: () => void
  openRoleConversation: (prompt?: string, sessionKey?: string) => void

  // ---- 页面本地状态（值 + setter 对） ----
  readonly query: string
  readonly setQuery: Dispatch<SetStateAction<string>>
  readonly milestoneOpen: boolean
  readonly setMilestoneOpen: Dispatch<SetStateAction<boolean>>
  readonly candidate: boolean
  readonly setCandidate: Dispatch<SetStateAction<boolean>>
  readonly sourceIndex: number
  readonly setSourceIndex: Dispatch<SetStateAction<number>>
  readonly dialog: 'submit' | 'event' | 'source' | 'compare' | 'group' | null
  readonly setDialog: Dispatch<SetStateAction<'submit' | 'event' | 'source' | 'compare' | 'group' | null>>
  readonly selectedVersion: number
  readonly setSelectedVersion: Dispatch<SetStateAction<number>>
  readonly feedback: string
  readonly setFeedback: Dispatch<SetStateAction<string>>
  readonly priorityFilter: 'all' | 'role'
  readonly setPriorityFilter: Dispatch<SetStateAction<'all' | 'role'>>
  readonly agentProgress: number
  readonly setAgentProgress: Dispatch<SetStateAction<number>>
  readonly agentStatus: 'ready' | 'running' | 'awaitingApproval' | 'approved'
  readonly setAgentStatus: Dispatch<SetStateAction<'ready' | 'running' | 'awaitingApproval' | 'approved'>>
  readonly agentDraft: string
  readonly setAgentDraft: Dispatch<SetStateAction<string>>
  readonly groupMessageDraft: string
  readonly setGroupMessageDraft: Dispatch<SetStateAction<string>>
  readonly groupAssignmentDraft: string
  readonly setGroupAssignmentDraft: Dispatch<SetStateAction<string>>
  readonly groupAssignmentRole: RoleId
  readonly setGroupAssignmentRole: Dispatch<SetStateAction<RoleId>>
  readonly groupAssignmentTask: TaskId
  readonly setGroupAssignmentTask: Dispatch<SetStateAction<TaskId>>
  readonly groupInviteRole: RoleId
  readonly setGroupInviteRole: Dispatch<SetStateAction<RoleId>>
  readonly selectedProjectId: string
  readonly setSelectedProjectId: Dispatch<SetStateAction<string>>
  readonly projectChangeId: string | undefined
  readonly setProjectChangeId: Dispatch<SetStateAction<string | undefined>>
  readonly projectFocusId: string | undefined
  readonly setProjectFocusId: Dispatch<SetStateAction<string | undefined>>
  readonly decisionChoice: Record<string, string>
  readonly setDecisionChoice: Dispatch<SetStateAction<Record<string, string>>>
  readonly acceptanceEvidence: Record<string, string>
  readonly setAcceptanceEvidence: Dispatch<SetStateAction<Record<string, string>>>
}

/** 页面上下文；由 Workbench 外壳提供。 */
export const WorkbenchPageContext = createContext<WorkbenchPageApi>(undefined as never)

/** 消费工作台页面上下文；只能在 Workbench 外壳内部使用。 */
export function useWorkbenchPage(): WorkbenchPageApi {
  return useContext(WorkbenchPageContext)
}

/** 建群弹窗可用的群组类型。 */
export type DialogWorkgroupKind = WorkgroupKind

/** 版本草稿快照展示。 */
export type { DraftVersion }
/** 文案键类型再导出，页面组件无需重复引 locales。 */
export type { WorkbenchKey }
