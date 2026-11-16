/** KPI-led work scenarios linked to each position's demonstrated work methods. */
import type { RoleId, TaskId } from './model.ts'
import { roleIds, roleFixtures } from './fixtures.ts'
import { roleMethods } from './methodology-data.ts'

/** Position KPI labels shown as scenario entry points in the prototype. */
export interface PositionScenario {
  readonly kpiIndex: 0 | 1 | 2 | 3
  readonly taskIndex: 0 | 1 | 2
  readonly task: TaskId
}

const kpiIndexes = [0, 1, 2, 3] as const

/** Map each demonstrated KPI to a position work method for scenario review. */
const scenariosByRole = {} as Record<RoleId, readonly PositionScenario[]>
for (const role of roleIds) {
  scenariosByRole[role] = kpiIndexes.map((kpiIndex) => {
    const taskIndex = kpiIndex === 3 ? 0 : kpiIndex
    return {
      kpiIndex,
      taskIndex,
      task: roleMethods[role][taskIndex].task,
    }
  })
}
/** KPI scenario entry points for every demonstrated position. */
export const positionScenarios = scenariosByRole

/** Return the demo tasks used as daily work entry points for one position.
 * @param role - active position view.
 * @returns tasks used for recurring work entry points.
 */
export function dailyWorkForRole(role: RoleId): readonly TaskId[] {
  return roleFixtures[role].tasks
}
