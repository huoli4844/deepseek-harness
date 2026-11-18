/** One evidence-led operating scenario for each position outside project management. */
import type { RoleId } from './model.ts'
import type { WorkbenchKey } from './locales.ts'

/** Positions with a dedicated scenario rather than the project portfolio. */
export type OperatingRole = Exclude<RoleId, 'project'>

/** Supported scenario statuses in the assistant and workgroup. */
export type PositionCaseStatus = 'attention' | 'waiting' | 'review' | 'rework' | 'accepted'

/** A decision and any subsequent review for one position's scenario. */
export type PositionCaseRecord =
  | { readonly option: 0 | 1; readonly status: 'waiting' | 'review' }
  | { readonly option: 0 | 1; readonly status: 'rework' | 'accepted'; readonly note: string }

interface PositionSignal {
  readonly recipient: RoleId
  readonly taskIndex: 0 | 1 | 2
  readonly recommended: 0 | 1
  readonly metric: WorkbenchKey
  readonly current: number
  readonly target: number
  readonly unit: 'percent' | 'count' | 'min' | 'pieces'
}

/** Each comparison uses one demo source and the scenario-specific target or limit. */
export const positionSignals: Readonly<Record<OperatingRole, PositionSignal>> = {
  procurement: { recipient: 'operator', taskIndex: 0, recommended: 0, metric: 'position.metric.onTime', current: 88, target: 95, unit: 'percent' },
  quality: { recipient: 'operator', taskIndex: 1, recommended: 0, metric: 'position.metric.yield', current: 94, target: 98, unit: 'percent' },
  director: { recipient: 'project', taskIndex: 2, recommended: 0, metric: 'position.metric.milestone', current: 76, target: 90, unit: 'percent' },
  testing: { recipient: 'firmware', taskIndex: 0, recommended: 0, metric: 'position.metric.coverage', current: 86, target: 100, unit: 'percent' },
  pilot: { recipient: 'quality', taskIndex: 0, recommended: 0, metric: 'position.metric.blockers', current: 3, target: 0, unit: 'count' },
  motor: { recipient: 'testing', taskIndex: 0, recommended: 0, metric: 'position.metric.coverage', current: 82, target: 95, unit: 'percent' },
  marketing: { recipient: 'sales', taskIndex: 2, recommended: 1, metric: 'position.metric.conversion', current: 18, target: 25, unit: 'percent' },
  sales: { recipient: 'project', taskIndex: 0, recommended: 0, metric: 'position.metric.progress', current: 70, target: 90, unit: 'percent' },
  department: { recipient: 'hr', taskIndex: 0, recommended: 0, metric: 'position.metric.gaps', current: 2, target: 0, unit: 'count' },
  brake: { recipient: 'testing', taskIndex: 2, recommended: 0, metric: 'position.metric.coverage', current: 78, target: 100, unit: 'percent' },
  hardware: { recipient: 'procurement', taskIndex: 1, recommended: 0, metric: 'position.metric.blockers', current: 1, target: 0, unit: 'count' },
  hr: { recipient: 'department', taskIndex: 0, recommended: 0, metric: 'position.metric.gaps', current: 3, target: 0, unit: 'count' },
  firmware: { recipient: 'hardware', taskIndex: 0, recommended: 1, metric: 'position.metric.blockers', current: 2, target: 0, unit: 'count' },
  operator: { recipient: 'procurement', taskIndex: 2, recommended: 0, metric: 'position.metric.shortage', current: 36, target: 0, unit: 'pieces' },
  equipment: { recipient: 'operator', taskIndex: 0, recommended: 0, metric: 'position.metric.downtime', current: 65, target: 30, unit: 'min' },
  assurance: { recipient: 'quality', taskIndex: 2, recommended: 1, metric: 'position.metric.blockers', current: 2, target: 0, unit: 'count' },
  president: { recipient: 'project', taskIndex: 0, recommended: 0, metric: 'position.metric.milestone', current: 81, target: 95, unit: 'percent' },
  executive: { recipient: 'sales', taskIndex: 2, recommended: 0, metric: 'position.metric.collection', current: 78, target: 90, unit: 'percent' },
}
