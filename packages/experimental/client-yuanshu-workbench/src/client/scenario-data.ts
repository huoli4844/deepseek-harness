/** KPI-led work scenarios and actionable position work items for the prototype. */
import type { RoleId, TaskId } from './model.ts'
import { roleIds, roleFixtures } from './fixtures.ts'

/** Work lifecycle state shown in the assistant queue. */
export type WorkStatus = 'attention' | 'inProgress' | 'waiting' | 'review' | 'done'

/** A position work item with enough context to explain why it reached the user. */
export interface WorkItem {
  readonly id: string
  readonly task: TaskId
  readonly metricIndex: 0 | 1 | 2
  readonly status: WorkStatus
  readonly priority: 'high' | 'normal'
  readonly dueKey: 'task.today' | 'task.tomorrow' | 'task.friday'
  readonly sourceMetricIndex: 0 | 1 | 2 | 3
  readonly owner: RoleId
}

/** Position KPI labels shown as scenario entry points in the prototype. */
export interface PositionScenario {
  readonly kpiIndex: 0 | 1 | 2 | 3
  readonly taskIndex: 0 | 1 | 2
  readonly task: TaskId
  readonly workItemId: string
}

const kpiIndexes = [0, 1, 2, 3] as const

/** Keep the KPI-to-task relationship explicit; one task may serve multiple KPIs. */
const taskIndexByKpi: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2] = [0, 1, 2, 0]

const statusByTaskIndex: readonly [WorkStatus, WorkStatus, WorkStatus] = ['attention', 'waiting', 'review']
const dueKeyByTaskIndex: readonly ['task.today', 'task.tomorrow', 'task.friday'] = [
  'task.today', 'task.tomorrow', 'task.friday',
]

/** Map each demonstrated KPI to a position work method for scenario review. */
const scenariosByRole = {} as Record<RoleId, readonly PositionScenario[]>
const workItemsByRole = {} as Record<RoleId, readonly WorkItem[]>
for (const role of roleIds) {
  const tasks = roleFixtures[role].tasks
  workItemsByRole[role] = ([0, 1, 2] as const).map((taskIndex) => {
    const task = tasks[taskIndex]
    return {
      id: `${role}:${task}`,
      task,
      metricIndex: taskIndex,
      status: statusByTaskIndex[taskIndex],
      priority: taskIndex === 0 ? 'high' : 'normal',
      dueKey: dueKeyByTaskIndex[taskIndex],
      sourceMetricIndex: taskIndex,
      owner: role,
    }
  })
  scenariosByRole[role] = kpiIndexes.map((kpiIndex) => {
    const taskIndex = taskIndexByKpi[kpiIndex]
    const task = tasks[taskIndex]
    return {
      kpiIndex,
      taskIndex,
      task,
      workItemId: `${role}:${task}`,
    }
  })
}
/** KPI scenario entry points for every demonstrated position. */
export const positionScenarios = scenariosByRole

/** Return the actionable work queue for one position.
 * @param role - position owning the demonstration work.
 * @returns the position's ordered work items.
 */
export function workItemsForRole(role: RoleId): readonly WorkItem[] {
  return workItemsByRole[role]
}

/** Return the work item associated with a KPI scenario.
 * @param role - position owning the KPI scenario.
 * @param kpiIndex - zero-based position KPI index.
 * @returns the work item linked to the KPI.
 */
export function workItemForScenario(role: RoleId, kpiIndex: 0 | 1 | 2 | 3): WorkItem {
  const scenario = positionScenarios[role][kpiIndex]
  if (scenario === undefined) throw new Error(`missing KPI scenario ${role}:${kpiIndex}`)
  const item = workItemsByRole[role].find(candidate => candidate.id === scenario.workItemId)
  if (item === undefined) throw new Error(`missing work item ${scenario.workItemId}`)
  return item
}

/** Return the demo tasks used as daily work entry points for one position.
 * @param role - active position view.
 * @returns tasks used for recurring work entry points.
 */
export function dailyWorkForRole(role: RoleId): readonly TaskId[] {
  return roleFixtures[role].tasks
}
