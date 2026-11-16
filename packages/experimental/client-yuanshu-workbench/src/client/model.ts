/** In-memory demo records and declared actions; nothing is a platform task. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { roleFixtures } from './fixtures.ts'

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
/** Framework-retained prototype data, discarded on page refresh or plugin reload. */
export interface WorkbenchState {
  role: RoleId
  view: ViewId
  task: TaskId
  drafts: Record<string, WorkDraft | undefined>
  read: number[]
  day: number
  events: DemoEvent[]
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
}

/**
 * Declare one plugin-scoped demo store without browser or Host persistence.
 * @returns the store handle registered with the workbench main entry.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchState, typeof workbenchActions> {
  return defineStore({
    init: (): WorkbenchState => ({
      role: 'procurement',
      view: 'assistant',
      task: 0,
      drafts: {},
      read: [],
      day: 16,
      events: [],
    }),
    actions: workbenchActions,
  })
}

/** Store selectors and actions synthesized by the DSH renderer. */
export type WorkbenchStoreProps = PropsStore<ReturnType<typeof createWorkbenchStore>>
