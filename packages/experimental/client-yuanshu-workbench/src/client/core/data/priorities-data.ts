/** Ten ranked company-wide work priorities with role-specific entry points. */
import type { RoleId } from '../model.ts'
import type { WorkbenchKey } from '../locales/locales.ts'

/** One position and KPI entry point for a ranked priority. */
export interface PriorityAssignment {
  readonly role: RoleId
  readonly kpiIndex: 0 | 1 | 2 | 3
}

/** Static demonstration details shown before opening the related work. */
export interface PriorityItem {
  readonly id: string
  readonly rank: number
  readonly title: WorkbenchKey
  readonly reason: WorkbenchKey
  readonly source: WorkbenchKey
  readonly action: WorkbenchKey
  readonly current: string
  readonly target: string
  readonly unit: '%' | '项' | '万元' | '天'
  readonly dueKey: 'task.today' | 'task.tomorrow' | 'task.friday'
  readonly assignments: readonly PriorityAssignment[]
}

/** Ranked examples cover management, delivery, production and support work. */
export const priorityItems: readonly PriorityItem[] = [
  {
    id: 'operating-gap', rank: 1, title: 'priority.1.title', reason: 'priority.1.reason',
    source: 'priority.1.source', action: 'priority.1.action', current: '82', target: '90', unit: '%', dueKey: 'task.today',
    assignments: [{ role: 'executive', kpiIndex: 0 }, { role: 'president', kpiIndex: 0 }, { role: 'department', kpiIndex: 0 }, { role: 'director', kpiIndex: 0 }],
  },
  {
    id: 'receivables', rank: 2, title: 'priority.2.title', reason: 'priority.2.reason',
    source: 'priority.2.source', action: 'priority.2.action', current: '126', target: '80', unit: '万元', dueKey: 'task.today',
    assignments: [{ role: 'sales', kpiIndex: 2 }, { role: 'executive', kpiIndex: 3 }, { role: 'president', kpiIndex: 3 }, { role: 'department', kpiIndex: 3 }],
  },
  {
    id: 'milestone-risk', rank: 3, title: 'priority.3.title', reason: 'priority.3.reason',
    source: 'priority.3.source', action: 'priority.3.action', current: '4', target: '1', unit: '项', dueKey: 'task.tomorrow',
    assignments: [{ role: 'project', kpiIndex: 0 }, { role: 'director', kpiIndex: 1 }, { role: 'president', kpiIndex: 2 }, { role: 'pilot', kpiIndex: 1 }],
  },
  {
    id: 'supplier-delivery', rank: 4, title: 'priority.4.title', reason: 'priority.4.reason',
    source: 'priority.4.source', action: 'priority.4.action', current: '3', target: '0', unit: '项', dueKey: 'task.today',
    assignments: [{ role: 'procurement', kpiIndex: 1 }, { role: 'quality', kpiIndex: 0 }, { role: 'operator', kpiIndex: 2 }],
  },
  {
    id: 'incoming-quality', rank: 5, title: 'priority.5.title', reason: 'priority.5.reason',
    source: 'priority.5.source', action: 'priority.5.action', current: '4', target: '0', unit: '项', dueKey: 'task.today',
    assignments: [{ role: 'quality', kpiIndex: 2 }, { role: 'assurance', kpiIndex: 1 }, { role: 'procurement', kpiIndex: 0 }],
  },
  {
    id: 'verification-coverage', rank: 6, title: 'priority.6.title', reason: 'priority.6.reason',
    source: 'priority.6.source', action: 'priority.6.action', current: '76', target: '95', unit: '%', dueKey: 'task.tomorrow',
    assignments: [{ role: 'testing', kpiIndex: 0 }, { role: 'director', kpiIndex: 2 }, { role: 'motor', kpiIndex: 1 }, { role: 'brake', kpiIndex: 1 }, { role: 'hardware', kpiIndex: 1 }, { role: 'firmware', kpiIndex: 1 }],
  },
  {
    id: 'pilot-schedule', rank: 7, title: 'priority.7.title', reason: 'priority.7.reason',
    source: 'priority.7.source', action: 'priority.7.action', current: '86', target: '92', unit: '%', dueKey: 'task.today',
    assignments: [{ role: 'pilot', kpiIndex: 0 }, { role: 'operator', kpiIndex: 1 }, { role: 'equipment', kpiIndex: 2 }, { role: 'procurement', kpiIndex: 2 }],
  },
  {
    id: 'equipment-downtime', rank: 8, title: 'priority.8.title', reason: 'priority.8.reason',
    source: 'priority.8.source', action: 'priority.8.action', current: '2', target: '0', unit: '项', dueKey: 'task.today',
    assignments: [{ role: 'equipment', kpiIndex: 0 }, { role: 'operator', kpiIndex: 2 }, { role: 'quality', kpiIndex: 3 }],
  },
  {
    id: 'customer-conversion', rank: 9, title: 'priority.9.title', reason: 'priority.9.reason',
    source: 'priority.9.source', action: 'priority.9.action', current: '31', target: '40', unit: '%', dueKey: 'task.friday',
    assignments: [{ role: 'marketing', kpiIndex: 0 }, { role: 'sales', kpiIndex: 0 }, { role: 'department', kpiIndex: 2 }],
  },
  {
    id: 'critical-role-gap', rank: 10, title: 'priority.10.title', reason: 'priority.10.reason',
    source: 'priority.10.source', action: 'priority.10.action', current: '12', target: '5', unit: '天', dueKey: 'task.friday',
    assignments: [{ role: 'hr', kpiIndex: 0 }, { role: 'department', kpiIndex: 3 }, { role: 'executive', kpiIndex: 3 }, { role: 'president', kpiIndex: 3 }],
  },
]

/** Return the entry point for a position when it participates in a priority.
 * @param item - ranked company priority.
 * @param role - position to locate in the priority assignments.
 * @returns the matching position and KPI entry point, or undefined when the position is not assigned.
 */
export function priorityAssignment(item: PriorityItem, role: RoleId): PriorityAssignment | undefined {
  return item.assignments.find(assignment => assignment.role === role)
}

/** Return the ranked priorities that include one position.
 * @param role - position to find in the assignments.
 * @returns the priorities assigned to the position, ordered by rank.
 */
export function prioritiesForRole(role: RoleId): readonly PriorityItem[] {
  return priorityItems.filter(item => priorityAssignment(item, role) !== undefined)
}
