/** Linked project-operations records for the role workbench demonstration. */
import type { RoleId } from './model.ts'
import type { WorkbenchKey } from './locales.ts'

/** Fixture project health labels. */
export type ProjectStatus = 'healthy' | 'watch' | 'critical'
/** Recorded progress in the local project demonstration. */
export type ProjectRecordStatus = 'open' | 'inProgress' | 'done' | 'approved' | 'deferred' | 'rejected'

/** Portfolio record with planned and forecast delivery dates. */
export interface ProjectRecord {
  readonly id: string
  readonly name: WorkbenchKey
  readonly customer: WorkbenchKey
  readonly stage: WorkbenchKey
  readonly status: ProjectStatus
  readonly progress: number
  readonly baseline: string
  readonly forecast: string
  readonly budget: string
  readonly spent: string
}

/** Scheduled checkpoint and the expected deliverable. */
export interface ProjectMilestone {
  readonly id: string
  readonly projectId: string
  readonly name: WorkbenchKey
  readonly owner: RoleId
  readonly baseline: string
  readonly forecast: string
  readonly progress: number
  readonly critical: boolean
  readonly deliverable: WorkbenchKey
}

/** Predecessor and successor with the current evidence for their relationship. */
export interface ProjectDependency {
  readonly id: string
  readonly projectId: string
  readonly predecessor: WorkbenchKey
  readonly successor: WorkbenchKey
  readonly owner: RoleId
  readonly status: 'confirmed' | 'blocked' | 'unconfirmed'
  readonly impactDays: number
  readonly evidence: WorkbenchKey
}

/** Detected change and its impact on project deliverables. */
export interface ProjectChange {
  readonly id: string
  readonly projectId: string
  readonly title: WorkbenchKey
  readonly source: WorkbenchKey
  readonly detected: string
  readonly scopeImpact: WorkbenchKey
  readonly scheduleImpact: WorkbenchKey
  readonly costImpact: WorkbenchKey
  readonly qualityImpact: WorkbenchKey
  readonly affectedMilestones: readonly string[]
  readonly evidence: WorkbenchKey
}

/** Risk and its proposed mitigation. */
export interface ProjectRisk {
  readonly id: string
  readonly projectId: string
  readonly title: WorkbenchKey
  readonly owner: RoleId
  readonly probability: 'low' | 'medium' | 'high'
  readonly impact: 'medium' | 'high' | 'critical'
  readonly mitigation: WorkbenchKey
  readonly due: string
  readonly evidence: WorkbenchKey
}

/** Choice of response to a recorded change. */
export interface ProjectDecision {
  readonly id: string
  readonly projectId: string
  readonly title: WorkbenchKey
  readonly question: WorkbenchKey
  readonly owner: RoleId
  readonly due: string
  readonly options: readonly WorkbenchKey[]
  readonly changeId: string
}

/** Assigned work and its originating project record. */
export interface ProjectAction {
  readonly id: string
  readonly projectId: string
  readonly title: WorkbenchKey
  readonly owner: RoleId
  readonly due: string
  readonly evidence: WorkbenchKey
  readonly linkedId: string
}

/** Evidence and required actions for a delivery review. */
export interface ProjectAcceptance {
  readonly id: string
  readonly projectId: string
  readonly milestoneId: string
  readonly title: WorkbenchKey
  readonly criteria: readonly WorkbenchKey[]
  readonly evidence: WorkbenchKey
  readonly receiver: RoleId
  readonly requiredActionIds: readonly string[]
}

/** Three projects covering distinct delivery stages and health states. */
export const projectRecords: readonly ProjectRecord[] = [
  { id: 'controller', name: 'project.record.controller', customer: 'project.customer.north', stage: 'project.stage.validation', status: 'critical', progress: 68, baseline: 'Nov 20', forecast: 'Nov 25', budget: '¥1.80M', spent: '¥1.21M' },
  { id: 'drive', name: 'project.record.drive', customer: 'project.customer.east', stage: 'project.stage.integration', status: 'watch', progress: 76, baseline: 'Nov 27', forecast: 'Nov 29', budget: '¥2.40M', spent: '¥1.55M' },
  { id: 'vehicle', name: 'project.record.vehicle', customer: 'project.customer.internal', stage: 'project.stage.acceptance', status: 'healthy', progress: 91, baseline: 'Dec 04', forecast: 'Dec 03', budget: '¥3.10M', spent: '¥2.48M' },
]

/** Checkpoints for each project and its receiving role. */
export const projectMilestones: readonly ProjectMilestone[] = [
  { id: 'controller:bench', projectId: 'controller', name: 'project.milestone.controller.bench', owner: 'testing', baseline: 'Nov 18', forecast: 'Nov 21', progress: 72, critical: true, deliverable: 'project.deliverable.bench' },
  { id: 'controller:firmware', projectId: 'controller', name: 'project.milestone.controller.firmware', owner: 'firmware', baseline: 'Nov 20', forecast: 'Nov 25', progress: 54, critical: true, deliverable: 'project.deliverable.firmware' },
  { id: 'drive:integration', projectId: 'drive', name: 'project.milestone.drive.integration', owner: 'motor', baseline: 'Nov 27', forecast: 'Nov 29', progress: 76, critical: true, deliverable: 'project.deliverable.integration' },
  { id: 'drive:reliability', projectId: 'drive', name: 'project.milestone.drive.reliability', owner: 'quality', baseline: 'Nov 24', forecast: 'Nov 24', progress: 88, critical: false, deliverable: 'project.deliverable.reliability' },
  { id: 'vehicle:acceptance', projectId: 'vehicle', name: 'project.milestone.vehicle.acceptance', owner: 'pilot', baseline: 'Dec 04', forecast: 'Dec 03', progress: 91, critical: true, deliverable: 'project.deliverable.vehicle' },
]

/** Ownership and evidence for dependency handoffs. */
export const projectDependencies: readonly ProjectDependency[] = [
  { id: 'dependency:bench-firmware', projectId: 'controller', predecessor: 'project.dependency.bench', successor: 'project.dependency.firmware', owner: 'testing', status: 'blocked', impactDays: 3, evidence: 'project.evidence.test-rig' },
  { id: 'dependency:firmware-integration', projectId: 'controller', predecessor: 'project.dependency.firmware', successor: 'project.dependency.integration', owner: 'firmware', status: 'unconfirmed', impactDays: 2, evidence: 'project.evidence.build' },
  { id: 'dependency:drive-quality', projectId: 'drive', predecessor: 'project.dependency.reliability', successor: 'project.dependency.release', owner: 'quality', status: 'confirmed', impactDays: 0, evidence: 'project.evidence.reliability' },
]

/** Change notices surfaced on the project assistant inbox. */
export const projectChanges: readonly ProjectChange[] = [
  { id: 'change:controller-fixture', projectId: 'controller', title: 'project.change.fixture.title', source: 'project.change.fixture.source', detected: '09:14', scopeImpact: 'project.change.fixture.scope', scheduleImpact: 'project.change.fixture.schedule', costImpact: 'project.change.fixture.cost', qualityImpact: 'project.change.fixture.quality', affectedMilestones: ['controller:bench', 'controller:firmware'], evidence: 'project.evidence.fixture-revision' },
  { id: 'change:drive-sample', projectId: 'drive', title: 'project.change.sample.title', source: 'project.change.sample.source', detected: '08:42', scopeImpact: 'project.change.sample.scope', scheduleImpact: 'project.change.sample.schedule', costImpact: 'project.change.sample.cost', qualityImpact: 'project.change.sample.quality', affectedMilestones: ['drive:integration'], evidence: 'project.evidence.customer-mail' },
]

/** Risks with mitigation plans and evidence references. */
export const projectRisks: readonly ProjectRisk[] = [
  { id: 'risk:test-rig', projectId: 'controller', title: 'project.risk.test-rig', owner: 'testing', probability: 'high', impact: 'critical', mitigation: 'project.risk.test-rig.plan', due: 'Nov 19', evidence: 'project.evidence.test-rig' },
  { id: 'risk:firmware-build', projectId: 'controller', title: 'project.risk.firmware-build', owner: 'firmware', probability: 'medium', impact: 'high', mitigation: 'project.risk.firmware-build.plan', due: 'Nov 20', evidence: 'project.evidence.build' },
  { id: 'risk:drive-sample', projectId: 'drive', title: 'project.risk.drive-sample', owner: 'motor', probability: 'medium', impact: 'high', mitigation: 'project.risk.drive-sample.plan', due: 'Nov 21', evidence: 'project.evidence.customer-mail' },
]

/** Recovery options for each change that needs a decision. */
export const projectDecisions: readonly ProjectDecision[] = [
  { id: 'decision:controller-fixture', projectId: 'controller', title: 'project.decision.fixture.title', question: 'project.decision.fixture.question', owner: 'project', due: 'Today 14:00', options: ['project.decision.fixture.option0', 'project.decision.fixture.option1', 'project.decision.fixture.option2'], changeId: 'change:controller-fixture' },
  { id: 'decision:drive-sample', projectId: 'drive', title: 'project.decision.sample.title', question: 'project.decision.sample.question', owner: 'project', due: 'Nov 19 10:00', options: ['project.decision.sample.option0', 'project.decision.sample.option1'], changeId: 'change:drive-sample' },
]

/** Owner assignments, including work required before acceptance. */
export const projectActions: readonly ProjectAction[] = [
  { id: 'action:test-rig', projectId: 'controller', title: 'project.action.test-rig', owner: 'testing', due: 'Today 12:00', evidence: 'project.evidence.test-rig', linkedId: 'dependency:bench-firmware' },
  { id: 'action:firmware-build', projectId: 'controller', title: 'project.action.firmware-build', owner: 'firmware', due: 'Today 16:00', evidence: 'project.evidence.build', linkedId: 'risk:firmware-build' },
  { id: 'action:cost-review', projectId: 'drive', title: 'project.action.cost-review', owner: 'department', due: 'Nov 19 15:00', evidence: 'project.evidence.customer-mail', linkedId: 'decision:drive-sample' },
  { id: 'action:acceptance-pack', projectId: 'vehicle', title: 'project.action.acceptance-pack', owner: 'pilot', due: 'Nov 20 17:00', evidence: 'project.evidence.acceptance', linkedId: 'vehicle:acceptance' },
]

/** Review criteria and required action IDs for each delivery gate. */
export const projectAcceptances: readonly ProjectAcceptance[] = [
  { id: 'acceptance:controller', projectId: 'controller', milestoneId: 'controller:bench', title: 'project.acceptance.controller', criteria: ['project.acceptance.controller.criteria0', 'project.acceptance.controller.criteria1', 'project.acceptance.controller.criteria2'], evidence: 'project.evidence.bench-report', receiver: 'director', requiredActionIds: ['action:test-rig', 'action:firmware-build'] },
  { id: 'acceptance:vehicle', projectId: 'vehicle', milestoneId: 'vehicle:acceptance', title: 'project.acceptance.vehicle', criteria: ['project.acceptance.vehicle.criteria0', 'project.acceptance.vehicle.criteria1'], evidence: 'project.evidence.acceptance', receiver: 'pilot', requiredActionIds: ['action:acceptance-pack'] },
]

/**
 * Resolve a fixture project.
 * @param id - Demonstration project identifier.
 * @returns The matching project. An invalid fixture identifier throws.
 */
export function projectById(id: string): ProjectRecord {
  const project = projectRecords.find(record => record.id === id)
  if (project === undefined) throw new Error(`unknown demonstration project: ${id}`)
  return project
}

interface ScheduleTask {
  readonly id: WorkbenchKey
  readonly predecessors: readonly WorkbenchKey[]
  readonly baselineDays: number
  readonly forecastDays: number
}

const schedules: Readonly<Record<string, readonly ScheduleTask[]>> = {
  controller: [
    { id: 'project.dependency.bench', predecessors: [], baselineDays: 4, forecastDays: 7 },
    { id: 'project.dependency.firmware', predecessors: ['project.dependency.bench'], baselineDays: 2, forecastDays: 3 },
    { id: 'project.dependency.integration', predecessors: ['project.dependency.firmware'], baselineDays: 2, forecastDays: 3 },
    { id: 'project.deliverable.bench', predecessors: ['project.dependency.bench'], baselineDays: 1, forecastDays: 1 },
  ],
  drive: [
    { id: 'project.dependency.reliability', predecessors: [], baselineDays: 4, forecastDays: 6 },
    { id: 'project.dependency.release', predecessors: ['project.dependency.reliability'], baselineDays: 3, forecastDays: 3 },
  ],
  vehicle: [
    { id: 'project.deliverable.vehicle', predecessors: [], baselineDays: 6, forecastDays: 5 },
  ],
}

function calculateSchedule(tasks: readonly ScheduleTask[], field: 'baselineDays' | 'forecastDays') {
  const finish = new Map<WorkbenchKey, number>()
  for (const task of tasks) {
    const start = Math.max(0, ...task.predecessors.map((id) => {
      const value = finish.get(id)
      if (value === undefined) throw new Error(`Schedule predecessor must appear before its successor: ${id}`)
      return value
    }))
    finish.set(task.id, start + task[field])
  }
  const duration = Math.max(0, ...finish.values())
  const latestStart = new Map<WorkbenchKey, number>()
  for (const task of [...tasks].reverse()) {
    const successors = tasks.filter(candidate => candidate.predecessors.includes(task.id))
    const latestFinish = Math.min(duration, ...successors.map(item => latestStart.get(item.id) ?? duration))
    latestStart.set(task.id, latestFinish - task[field])
  }
  return { duration, rows: tasks.map(task => ({
    id: task.id,
    days: task[field],
    float: (latestStart.get(task.id) ?? 0) - ((finish.get(task.id) ?? 0) - task[field]),
  })) }
}

/**
 * Compare the planned and forecast durations of the fixture project schedule.
 * @param id - Demonstration project ID.
 * @returns Project duration in days and each forecast task's total float.
 */
export function projectSchedule(id: string): {
  readonly baseline: number
  readonly forecast: number
  readonly rows: readonly { id: WorkbenchKey; days: number; float: number }[]
} {
  const tasks = schedules[id]
  if (tasks === undefined) throw new Error(`Missing demonstration schedule: ${id}`)
  const baseline = calculateSchedule(tasks, 'baselineDays')
  const forecast = calculateSchedule(tasks, 'forecastDays')
  return { baseline: baseline.duration, forecast: forecast.duration, rows: forecast.rows }
}
