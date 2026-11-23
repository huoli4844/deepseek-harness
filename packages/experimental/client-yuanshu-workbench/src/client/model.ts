/** In-memory demo records and declared actions; nothing is a platform task. */
import { milestoneDemo, type MilestonePhase } from './milestone-risk.ts'
import type { ChangeDemo } from './change-demo.ts'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { roleFixtures } from './fixtures.ts'
import type { WorkStatus } from './scenario-data.ts'
import { createDemoWorkgroups, type Workgroup, type WorkgroupKind } from './workgroup-data.ts'
import { projectAcceptances, projectDecisions, type ProjectRecordStatus } from './project-operations.ts'
import { positionSignals, type OperatingRole, type PositionCaseRecord } from './position-operations.ts'

/** Demonstrated positions; the selector changes focus, never authorization. */
export type RoleId =
  | 'procurement'
  | 'quality'
  | 'director'
  | 'testing'
  | 'pilot'
  | 'motor'
  | 'marketing'
  | 'sales'
  | 'department'
  | 'brake'
  | 'hardware'
  | 'hr'
  | 'firmware'
  | 'operator'
  | 'equipment'
  | 'assurance'
  | 'president'
  | 'project'
  | 'executive'
/** Identities of the fixed local demonstration tasks. */
export type TaskId =
  0 | 1 | 2 | 3 | 4 | 5 | 6 | `${Exclude<RoleId, 'procurement' | 'quality' | 'director'>}.${0 | 1 | 2}`
/** Workbench routes; agent and versions open from source work; `team` is a persisted alias. */
/** 运营者视角五屏的 ViewId，作为独立菜单项平铺进现有导航，不另起一层外壳。 */
export const OPERATOR_VIEW_IDS = [
  'operator-overview', 'operator-decisions', 'operator-projects', 'operator-functional', 'operator-evidence',
] as const

/** 运营者视角五屏的 ViewId 联合类型，由常量数组派生，避免两处不同步。 */
export type OperatorViewId = typeof OPERATOR_VIEW_IDS[number]

export type ViewId =
  'assistant' | 'dashboard' | 'project-operations' | 'position-operations' | 'priorities' | 'agent'
  | 'tasks' | 'versions' | 'calendar' | 'team' | 'groups' | 'notifications' | 'files' | 'methods' | 'work'
  | 'profile'
  | OperatorViewId

/** 判断一个 ViewId 是否属于运营者视角五屏。 */
export function isOperatorView(view: ViewId): view is OperatorViewId {
  return (OPERATOR_VIEW_IDS as readonly string[]).includes(view)
}
/** A saved demo draft snapshot owned by one task and position. */
export interface DraftVersion {
  readonly number: number
  readonly text: string
  readonly execution: MethodExecution
}
/** User-entered evidence and self-checks, never automatic verification or approval. */
export interface MethodExecution {
  evidence: string
  analysis: string
  checked: number[]
}
/** Editable result with immutable saved snapshots. */
export interface WorkDraft {
  text: string
  versions: DraftVersion[]
  submitted: boolean
  comment: string
  execution: MethodExecution
}
/** A local calendar event, retained when navigating between plugin pages. */
export interface DemoEvent {
  readonly id: number
  readonly day: number
  readonly title: string
}
/** Follow-up record created while coordinating one local work item. */
export interface DemoFollowUp {
  readonly id: number
  readonly workItemId: string
  readonly role: RoleId
  readonly text: string
  readonly done: boolean
  readonly groupId?: string
  readonly projectActionId?: string
  readonly positionCase?: OperatingRole
  response?: string
  responseDraft?: string
}
/** Position-scoped scene handoff retained for the next work session. */
export interface SceneCheckpoint {
  stage: 0 | 1 | 2 | 3
  note: string
  kpiIndex?: 0 | 1 | 2 | 3
}
/** Browser-local prototype data; it is not a YuanShu business record. */
export interface WorkbenchState {
  role: RoleId
  view: ViewId
  task: TaskId
  drafts: Record<string, WorkDraft | undefined>
  read: number[]
  day: number
  events: DemoEvent[]
  workStatuses: Record<string, WorkStatus | undefined>
  verifications: Record<string, string | undefined>
  followUps: DemoFollowUp[]
  sceneCheckpoints: Record<string, SceneCheckpoint | undefined>
  rolePreferences?: Partial<Record<RoleId, string>>
  workgroups?: Workgroup[]
  activeGroupId?: string
  projectOps?: Record<string, ProjectRecordStatus | undefined>
  projectDecisionOptions?: Record<string, string | undefined>
  milestonePhase?: MilestonePhase
  fixtureChangeDemo?: ChangeDemo
  projectEvidence?: Record<string, string | undefined>
  positionCases?: Partial<Record<OperatingRole, PositionCaseRecord>>
}

function positionFollowUp(state: WorkbenchState, role: OperatingRole) {
  return state.followUps.find(item => item.positionCase === role)
}

function editableDraft(state: WorkbenchState, key: string, initial: string): WorkDraft {
  const draft = state.drafts[key] ?? {
    text: initial,
    versions: [{ number: 1, text: initial, execution: emptyExecution() }],
    submitted: false,
    comment: '',
    execution: emptyExecution(),
  }
  state.drafts[key] = draft
  return draft
}

function emptyExecution(): MethodExecution {
  return { evidence: '', analysis: '', checked: [] }
}

function snapshotDraft(draft: WorkDraft): DraftVersion {
  return {
    number: draft.versions.length + 1,
    text: draft.text,
    execution: { ...draft.execution, checked: [...draft.execution.checked] },
  }
}

const workbenchActions = {
  navigate: (state: WorkbenchState, view: ViewId) => {
    state.view = view
  },
  changeRole: (state: WorkbenchState, role: RoleId) => {
    state.role = role
    state.task = roleFixtures[role].tasks[0]
  },
  openTask: (state: WorkbenchState, task: TaskId) => {
    state.task = task
    state.view = 'work'
  },
  setSceneStage: (state: WorkbenchState, key: string, stage: SceneCheckpoint['stage']) => {
    const checkpoint = (state.sceneCheckpoints[key] ??= { stage: 0, note: '' })
    checkpoint.stage = stage
  },
  setSceneKpi: (state: WorkbenchState, key: string, kpiIndex: NonNullable<SceneCheckpoint['kpiIndex']>) => {
    const checkpoint = (state.sceneCheckpoints[key] ??= { stage: 0, note: '' })
    checkpoint.kpiIndex = kpiIndex
  },
  saveSceneNote: (state: WorkbenchState, key: string, note: string) => {
    const checkpoint = (state.sceneCheckpoints[key] ??= { stage: 0, note: '' })
    checkpoint.note = note
  },
  editDraft: (state: WorkbenchState, key: string, text: string, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.text = text
    draft.submitted = false
    state.drafts[key] = draft
  },
  saveDraft: (state: WorkbenchState, key: string, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.versions.push(snapshotDraft(draft))
    state.drafts[key] = draft
  },
  submitDraft: (state: WorkbenchState, key: string, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.versions.push(snapshotDraft(draft))
    draft.submitted = true
    state.drafts[key] = draft
  },
  comment: (state: WorkbenchState, key: string, text: string, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.comment = text
    state.drafts[key] = draft
  },
  recordMethod: (state: WorkbenchState, key: string, field: 'evidence' | 'analysis', text: string, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.execution[field] = text
    draft.submitted = false
    state.drafts[key] = draft
  },
  checkMethod: (state: WorkbenchState, key: string, step: number, checked: boolean, initial: string) => {
    const draft = editableDraft(state, key, initial)
    draft.execution.checked = draft.execution.checked.filter(value => value !== step)
    if (checked) draft.execution.checked.push(step)
    draft.submitted = false
    state.drafts[key] = draft
  },
  markRead: (state: WorkbenchState, id: number) => {
    if (!state.read.includes(id)) state.read.push(id)
  },
  markAllRead: (state: WorkbenchState) => {
    state.read = [0, 1, 2]
  },
  selectDay: (state: WorkbenchState, day: number) => {
    state.day = day
  },
  addEvent: (state: WorkbenchState, title: string) => {
    state.events.push({ id: state.events.length + 1, day: state.day, title })
  },
  setWorkStatus: (state: WorkbenchState, id: string, status: WorkStatus) => {
    state.workStatuses[id] = status
  },
  setProjectRecordStatus: (state: WorkbenchState, id: string, status: ProjectRecordStatus) => {
    if (status === 'done' && id.startsWith('action:') && !state.followUps.some(item => item.projectActionId === id && item.done && item.response?.trim())) return
    state.projectOps ??= {}
    state.projectOps[id] = status
  },
  advanceMilestone: (state: WorkbenchState, expected: MilestonePhase) => {
    if (state.role !== 'project' || (state.milestonePhase ?? 'alert') !== expected) return
    const next = milestoneDemo.next[expected]
    if (next !== undefined) state.milestonePhase = next
  },
  editFixtureChangeDemo: (state: WorkbenchState, input: Pick<ChangeDemo, 'constraint' | 'model'>) => {
    state.fixtureChangeDemo = { ...state.fixtureChangeDemo, ...input }
  },
  runFixtureChangeDemo: (state: WorkbenchState) => {
    const demo = state.fixtureChangeDemo ??= { constraint: '', model: 'fast' }
    demo.report = { constraint: demo.constraint, model: demo.model }
  },
  recordProjectDecision: (state: WorkbenchState, id: string, option: string) => {
    if (state.projectOps?.[id] === 'approved' || !projectDecisions.find(item => item.id === id)?.options.some(candidate => candidate === option)) return
    state.projectDecisionOptions ??= {}
    state.projectDecisionOptions[id] = option
    state.projectOps ??= {}
    state.projectOps[id] = 'approved'
  },
  recordProjectAcceptance: (state: WorkbenchState, id: string, evidence: string) => {
    const gate = projectAcceptances.find(item => item.id === id)
    if (gate === undefined || !evidence.trim() || state.projectOps?.[id] === 'approved'
      || !gate.requiredActionIds.every(actionId => state.projectOps?.[actionId] === 'done')) return
    state.projectEvidence ??= {}
    state.projectEvidence[id] = evidence.trim()
    state.projectOps ??= {}
    state.projectOps[id] = 'approved'
  },
  dispatchPositionCase: (state: WorkbenchState, role: OperatingRole, option: 0 | 1, assignment: string) => {
    if (state.role !== role || state.positionCases?.[role] !== undefined) return
    const recipient = positionSignals[role].recipient
    const groupId = `position-${role}`
    const groups = state.workgroups ??= createDemoWorkgroups()
    groups.push({
      id: groupId,
      name: '',
      nameKey: `position.${role}.title`,
      kind: 'topic',
      members: [role, recipient],
      messages: [{ id: 1, author: role, body: assignment, kind: 'assignment', simulated: false, owner: recipient }],
    })
    state.followUps.push({
      id: state.followUps.length + 1,
      workItemId: `${role}:${roleFixtures[role].tasks[positionSignals[role].taskIndex]}`,
      role: recipient,
      text: assignment,
      groupId,
      positionCase: role,
      done: false,
    })
    const cases = state.positionCases ??= {}
    cases[role] = { option, status: 'waiting' }
  },
  submitPositionEvidence: (state: WorkbenchState, role: OperatingRole) => {
    const record = state.positionCases?.[role]
    const delivery = positionFollowUp(state, role)
    const response = delivery?.responseDraft?.trim()
    const group = state.workgroups?.find(item => item.id === delivery?.groupId)
    if (state.role !== positionSignals[role].recipient || record === undefined || delivery === undefined
      || response === undefined || response === '' || group === undefined
      || (record.status !== 'waiting' && record.status !== 'rework')) return
    state.followUps = state.followUps.map(item => item.id === delivery.id
      ? { ...item, response, responseDraft: '', done: true }
      : item)
    group.messages.push({
      id: group.messages.length + 1, author: delivery.role, body: response, kind: 'message', simulated: false,
    })
    const cases = state.positionCases ??= {}
    cases[role] = { option: record.option, status: 'review' }
  },
  reviewPositionCase: (
    state: WorkbenchState,
    role: OperatingRole,
    note: string,
    outcome: 'accepted' | 'rework',
    checks: readonly [boolean, boolean],
    historyText: string,
  ) => {
    const record = state.positionCases?.[role]
    const delivery = positionFollowUp(state, role)
    const group = state.workgroups?.find(item => item.id === delivery?.groupId)
    if (state.role !== role || record?.status !== 'review' || !delivery?.done || !delivery.response?.trim()
      || !note.trim() || group === undefined || (outcome === 'accepted' && !checks.every(Boolean))) return
    const cases = state.positionCases ??= {}
    cases[role] = { option: record.option, status: outcome, note: note.trim() }
    if (outcome === 'rework') {
      state.followUps = state.followUps.map(item => item.id === delivery.id ? { ...item, done: false } : item)
    }
    group.messages.push({
      id: group.messages.length + 1, author: role, body: historyText, kind: 'message', simulated: false,
    })
  },
  saveRolePreference: (state: WorkbenchState, role: RoleId, text: string) => {
    state.rolePreferences ??= {}
    if (text.trim() === '') {
      state.rolePreferences = Object.fromEntries(
        Object.entries(state.rolePreferences).filter(([id]) => id !== role),
      )
    } else state.rolePreferences[role] = text
  },
  createWorkgroup: (state: WorkbenchState, name: string, kind: WorkgroupKind, members: readonly RoleId[]) => {
    state.workgroups ??= createDemoWorkgroups()
    const nextId = state.workgroups.filter(group => group.id.startsWith('local-')).length + 1
    state.workgroups.push({
      id: `local-${nextId}`,
      name,
      kind,
      members: [...new Set(members)],
      messages: [],
    })
  },
  selectWorkgroup: (state: WorkbenchState, id: string) => {
    state.activeGroupId = id
  },
  ensureProjectGroup: (state: WorkbenchState, id: string, name: string, role: RoleId) => {
    state.workgroups ??= createDemoWorkgroups()
    const group = state.workgroups.find(item => item.id === id)
    if (group === undefined) {
      state.workgroups.push({ id, name, kind: 'project', members: [...new Set<RoleId>(['project', role])], messages: [] })
    } else if (!group.members.includes(role)) {
      group.members.push(role)
    }
  },
  addWorkgroupMember: (state: WorkbenchState, id: string, role: RoleId) => {
    const group = (state.workgroups ??= createDemoWorkgroups()).find(candidate => candidate.id === id)
    if (group !== undefined && !group.members.includes(role)) group.members.push(role)
  },
  removeWorkgroupMember: (state: WorkbenchState, id: string, role: RoleId) => {
    const group = (state.workgroups ??= createDemoWorkgroups()).find(candidate => candidate.id === id)
    if (group !== undefined) group.members = group.members.filter(member => member !== role)
  },
  addWorkgroupMessage: (
    state: WorkbenchState,
    id: string,
    author: RoleId | 'human',
    body: string,
    kind: 'message' | 'assignment',
    simulated: boolean,
    owner?: RoleId,
  ) => {
    const group = (state.workgroups ??= createDemoWorkgroups()).find(candidate => candidate.id === id)
    if (group === undefined) return
    group.messages.push({
      id: group.messages.length + 1,
      author,
      body,
      kind,
      simulated,
      ...(owner === undefined ? {} : { owner }),
    })
  },
  saveVerification: (state: WorkbenchState, id: string, text: string) => {
    state.verifications[id] = text
  },
  addFollowUp: (state: WorkbenchState, workItemId: string, role: RoleId, text: string, groupId?: string, projectActionId?: string) => {
    state.followUps.push({
      id: state.followUps.length + 1,
      workItemId,
      role,
      text,
      done: false,
      ...(groupId === undefined ? {} : { groupId }),
      ...(projectActionId === undefined ? {} : { projectActionId }),
    })
  },
  completeFollowUp: (state: WorkbenchState, id: number) => {
    state.followUps = state.followUps.map(item => item.id === id ? { ...item, done: true } : item)
  },
  saveFollowUpResponseDraft: (state: WorkbenchState, id: number, responseDraft: string) => {
    state.followUps = state.followUps.map(item => item.id === id ? { ...item, responseDraft } : item)
  },
  submitFollowUpResponse: (state: WorkbenchState, id: number) => {
    const item = state.followUps.find(entry => entry.id === id)
    if (item?.projectActionId !== undefined && item.responseDraft?.trim()) {
      state.projectOps ??= {}
      state.projectOps[item.projectActionId] = 'inProgress'
    }
    state.followUps = state.followUps.map(item => item.id === id
      ? { ...item, response: item.responseDraft?.trim() ?? '', done: true }
      : item)
  },
}

/**
 * Declare one plugin-scoped demo store persisted in browser localStorage.
 * @returns the store handle registered with the workbench main entry.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, typeof workbenchActions> {
  const handle = defineStore({
    persist: 'yuanshu-workbench.v2',
    init: (): WorkbenchState => ({
      role: 'procurement',
      view: 'assistant',
      task: 0,
      drafts: {},
      read: [],
      day: 16,
      events: [],
      workStatuses: {},
      verifications: {},
      followUps: [],
      sceneCheckpoints: {},
      rolePreferences: {},
      workgroups: createDemoWorkgroups(),
    }),
    actions: workbenchActions,
  })
  return {
    ...handle,
    create(scopeKey) {
      const instance = handle.create(scopeKey)
      const saved = instance.store.getSnapshot()
      const defaults = handle.spec.init()
      if (Object.keys(defaults).some(key => !Object.hasOwn(saved, key))) {
        instance.store.set({ ...defaults, ...saved })
      }
      return instance
    },
  }
}

/** Store selectors and actions synthesized by the DSH renderer. */
export type WorkbenchStoreProps = PropsStore<ReturnType<typeof createWorkbenchStore>>
