/** Demonstration series and label keys, unrelated to live KPI evaluation. */
import type { RoleId, TaskId, ViewId } from './model.ts'
import type { WorkbenchKey } from './locales/locales.ts'

/** A role's chart series and task focus. Values are illustrative percentages. */
interface RoleFixture {
  readonly metrics: readonly string[]
  readonly trend: readonly number[]
  readonly bars: readonly number[]
  readonly tasks: readonly [TaskId, TaskId, TaskId]
}
/** Position-specific demonstration content; no database values are embedded. */
export const roleFixtures: Record<RoleId, RoleFixture> = {
  procurement: {
    metrics: ['94.2%', '3', '2', '1'],
    trend: [86, 90, 88, 92, 91, 94.2],
    bars: [96, 89, 94],
    tasks: [0, 1, 2],
  },
  quality: {
    metrics: ['97.8%', '3', '2', '4'],
    trend: [94, 95.1, 96, 95.6, 97.2, 97.8],
    bars: [83, 67, 42],
    tasks: [0, 3, 4],
  },
  director: { metrics: ['82%', '2', '3', '2'], trend: [58, 63, 65, 72, 78, 82], bars: [70, 45, 85], tasks: [0, 5, 6] },
  testing: {
    metrics: ['96%', '4', '2', '1'],
    trend: [88, 91, 90, 93, 94, 96],
    bars: [88, 72, 91],
    tasks: ['testing.0', 'testing.1', 'testing.2'],
  },
  pilot: {
    metrics: ['86%', '3', '2', '4'],
    trend: [62, 67, 70, 78, 81, 86],
    bars: [92, 76, 64],
    tasks: ['pilot.0', 'pilot.1', 'pilot.2'],
  },
  motor: {
    metrics: ['88%', '3', '2', '2'],
    trend: [65, 69, 72, 78, 82, 88],
    bars: [94, 78, 66],
    tasks: ['motor.0', 'motor.1', 'motor.2'],
  },
  marketing: {
    metrics: ['31%', '5', '2', '4'],
    trend: [18, 20, 24, 27, 26, 31],
    bars: [85, 74, 62],
    tasks: ['marketing.0', 'marketing.1', 'marketing.2'],
  },
  sales: {
    metrics: ['81%', '6', '2', '3'],
    trend: [45, 52, 58, 66, 73, 81],
    bars: [78, 85, 69],
    tasks: ['sales.0', 'sales.1', 'sales.2'],
  },
  department: {
    metrics: ['87%', '2', '4', '3'],
    trend: [50, 56, 65, 71, 79, 87],
    bars: [87, 82, 70],
    tasks: ['department.0', 'department.1', 'department.2'],
  },
  brake: {
    metrics: ['84%', '3', '4', '2'],
    trend: [52, 60, 66, 70, 77, 84],
    bars: [93, 78, 65],
    tasks: ['brake.0', 'brake.1', 'brake.2'],
  },
  hardware: {
    metrics: ['89%', '3', '5', '2'],
    trend: [60, 64, 69, 74, 80, 89],
    bars: [89, 72, 64],
    tasks: ['hardware.0', 'hardware.1', 'hardware.2'],
  },
  hr: {
    metrics: ['79%', '2', '3', '2'],
    trend: [55, 59, 62, 68, 71, 79],
    bars: [79, 86, 58],
    tasks: ['hr.0', 'hr.1', 'hr.2'],
  },
  firmware: {
    metrics: ['90%', '5', '3', '2'],
    trend: [61, 67, 72, 74, 81, 90],
    bars: [91, 78, 83],
    tasks: ['firmware.0', 'firmware.1', 'firmware.2'],
  },
  operator: {
    metrics: ['93%', '3', '2', '4'],
    trend: [70, 74, 79, 81, 86, 93],
    bars: [93, 89, 96],
    tasks: ['operator.0', 'operator.1', 'operator.2'],
  },
  equipment: {
    metrics: ['98%', '2', '3', '1'],
    trend: [92, 93, 94, 93, 96, 98],
    bars: [88, 82, 70],
    tasks: ['equipment.0', 'equipment.1', 'equipment.2'],
  },
  assurance: {
    metrics: ['91%', '4', '2', '3'],
    trend: [68, 71, 76, 79, 83, 91],
    bars: [92, 84, 76],
    tasks: ['assurance.0', 'assurance.1', 'assurance.2'],
  },
  president: {
    metrics: ['83%', '3', '4', '5'],
    trend: [48, 55, 59, 67, 72, 83],
    bars: [83, 74, 86],
    tasks: ['president.0', 'president.1', 'president.2'],
  },
  project: {
    metrics: ['84%', '2', '3', '4'],
    trend: [51, 56, 63, 69, 75, 84],
    bars: [91, 78, 69],
    tasks: ['project.0', 'project.1', 'project.2'],
  },
  executive: {
    metrics: ['82%', '4', '3', '5'],
    trend: [50, 57, 63, 68, 76, 82],
    bars: [81, 73, 84],
    tasks: ['executive.0', 'executive.1', 'executive.2'],
  },
}
/** 侧栏导航项可包含二级业务模块，子项仍由工作台统一路由。 */
export interface NavigationItem {
  readonly id: ViewId
  readonly label: WorkbenchKey
  readonly children?: readonly NavigationItem[]
}

/** 每个岗位都显示完整导航，业务模块挂在岗位运营下。 */
export const navigation: readonly NavigationItem[] = [
  { id: 'operator-overview', label: 'operator.screen.overview' },
  { id: 'operator-decisions', label: 'operator.screen.decisions' },
  { id: 'operator-projects', label: 'operator.screen.projects' },
  { id: 'operator-functional', label: 'operator.screen.functional' },
  { id: 'operator-evidence', label: 'operator.screen.evidence' },
  { id: 'assistant', label: 'nav.assistant' },
  { id: 'dashboard', label: 'nav.dashboard' },
  { id: 'project-operations', label: 'nav.projectOperations' },
  {
    id: 'position-operations',
    label: 'nav.positionOperations',
    children: [
      { id: 'customer-resources', label: 'position.module.customer' },
      { id: 'material-management', label: 'position.module.material' },
      { id: 'supplier-management', label: 'position.module.supplier' },
      { id: 'equipment-ledger', label: 'position.module.equipment' },
      { id: 'contract-management', label: 'position.module.contract' },
      { id: 'budget-cost', label: 'position.module.budget' },
      { id: 'work-hours', label: 'position.module.hours' },
      { id: 'weekly-daily-reports', label: 'position.module.reports' },
    ],
  },
  { id: 'organization', label: 'nav.organization' },
  { id: 'groups', label: 'nav.groups' },
  { id: 'calendar', label: 'nav.calendar' },
  { id: 'files', label: 'nav.files' },
  { id: 'profile', label: 'nav.profile' },
]
/** Localized title for each fixed demonstration task. */
export const taskTitles: Record<TaskId, WorkbenchKey> = {
  0: 'task.0',
  1: 'task.1',
  2: 'task.2',
  3: 'task.3',
  4: 'task.4',
  5: 'task.5',
  6: 'task.6',
  'testing.0': 'task.testing.0',
  'testing.1': 'task.testing.1',
  'testing.2': 'task.testing.2',
  'pilot.0': 'task.pilot.0',
  'pilot.1': 'task.pilot.1',
  'pilot.2': 'task.pilot.2',
  'motor.0': 'task.motor.0',
  'motor.1': 'task.motor.1',
  'motor.2': 'task.motor.2',
  'marketing.0': 'task.marketing.0',
  'marketing.1': 'task.marketing.1',
  'marketing.2': 'task.marketing.2',
  'sales.0': 'task.sales.0',
  'sales.1': 'task.sales.1',
  'sales.2': 'task.sales.2',
  'department.0': 'task.department.0',
  'department.1': 'task.department.1',
  'department.2': 'task.department.2',
  'brake.0': 'task.brake.0',
  'brake.1': 'task.brake.1',
  'brake.2': 'task.brake.2',
  'hardware.0': 'task.hardware.0',
  'hardware.1': 'task.hardware.1',
  'hardware.2': 'task.hardware.2',
  'hr.0': 'task.hr.0',
  'hr.1': 'task.hr.1',
  'hr.2': 'task.hr.2',
  'firmware.0': 'task.firmware.0',
  'firmware.1': 'task.firmware.1',
  'firmware.2': 'task.firmware.2',
  'operator.0': 'task.operator.0',
  'operator.1': 'task.operator.1',
  'operator.2': 'task.operator.2',
  'equipment.0': 'task.equipment.0',
  'equipment.1': 'task.equipment.1',
  'equipment.2': 'task.equipment.2',
  'assurance.0': 'task.assurance.0',
  'assurance.1': 'task.assurance.1',
  'assurance.2': 'task.assurance.2',
  'president.0': 'task.president.0',
  'president.1': 'task.president.1',
  'president.2': 'task.president.2',
  'project.0': 'task.project.0',
  'project.1': 'task.project.1',
  'project.2': 'task.project.2',
  'executive.0': 'task.executive.0',
  'executive.1': 'task.executive.1',
  'executive.2': 'task.executive.2',
}
/** Position selector groups separate managerial and specialist responsibilities. */
export const roleGroups: readonly { readonly label: WorkbenchKey; readonly roles: readonly RoleId[] }[] = [
  { label: 'group.management', roles: ['executive', 'president', 'department', 'director', 'pilot'] },
  { label: 'group.engineering', roles: ['project', 'testing', 'motor', 'brake', 'hardware', 'firmware'] },
  { label: 'group.production', roles: ['quality', 'assurance', 'operator', 'equipment'] },
  { label: 'group.market', roles: ['marketing', 'sales'] },
  { label: 'group.support', roles: ['procurement', 'hr'] },
]
/** All 18 verified positions plus the company management demonstration view. */
export const roleIds: readonly RoleId[] = roleGroups.flatMap(group => group.roles)
/** Company summary links each risk to the position responsible for the next action. */
export const managementDomains: readonly {
  readonly id: string
  readonly label: WorkbenchKey
  readonly risk: WorkbenchKey
  readonly role: RoleId
  readonly progress: number
}[] = [
  { id: 'sales', label: 'management.sales', risk: 'management.salesRisk', role: 'sales', progress: 81 },
  { id: 'delivery', label: 'management.delivery', risk: 'management.deliveryRisk', role: 'project', progress: 84 },
  { id: 'quality', label: 'management.quality', risk: 'management.qualityRisk', role: 'assurance', progress: 91 },
  { id: 'supply', label: 'management.supply', risk: 'management.supplyRisk', role: 'procurement', progress: 94 },
  { id: 'people', label: 'management.people', risk: 'management.peopleRisk', role: 'hr', progress: 79 },
]
