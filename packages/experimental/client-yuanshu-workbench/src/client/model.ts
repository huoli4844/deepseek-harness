/** In-memory demo records and declared actions; nothing is a platform task. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { roleFixtures } from './fixtures.ts'
import type { WorkStatus } from './scenario-data.ts'

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
/** Workbench destinations shared by every position. */
export type ViewId =
  'assistant' | 'dashboard' | 'tasks' | 'versions' | 'calendar' | 'team' | 'notifications' | 'files' | 'methods' | 'work'
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
  saveVerification: (state: WorkbenchState, id: string, text: string) => {
    state.verifications[id] = text
  },
  addFollowUp: (state: WorkbenchState, workItemId: string, role: RoleId, text: string) => {
    state.followUps.push({
      id: state.followUps.length + 1,
      workItemId,
      role,
      text,
      done: false,
    })
  },
  completeFollowUp: (state: WorkbenchState, id: number) => {
    state.followUps = state.followUps.map(item => item.id === id ? { ...item, done: true } : item)
  },
}

/**
 * Declare one plugin-scoped demo store persisted in browser localStorage.
 * @returns the store handle registered with the workbench main entry.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, typeof workbenchActions> {
  return defineStore({
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
    }),
    actions: workbenchActions,
  })
}

/** Store selectors and actions synthesized by the DSH renderer. */
export type WorkbenchStoreProps = PropsStore<ReturnType<typeof createWorkbenchStore>>
