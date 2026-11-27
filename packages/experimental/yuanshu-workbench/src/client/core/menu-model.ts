/**
 * 岗位菜单模型：定义公共项、业务项与四个固定分组，并按岗位画像组装菜单。
 *
 * 边界：只依赖类型与本地常量，不依赖 React、网络、权限接口或文案运行时；
 * 岗位配置暂为本地演示数据，后续由租户与权限下发时只替换配置来源。
 */
import type { ViewId } from './model.ts'
import type { WorkbenchKey } from './locales/locales.ts'

/** 左侧菜单的四个固定分组，顺序即渲染顺序。 */
export type MenuGroupId = 'work' | 'business' | 'collaboration' | 'personal'

/** 岗位原型：同原型的岗位共用菜单结构，只通过置顶与隐藏产生差异。 */
export type MenuArchetype = 'management' | 'professional' | 'functional' | 'execution'

/** 菜单项；`archetypes` 为空表示所有原型可见，子项仍由工作台统一路由。 */
export interface MenuEntry {
  readonly id: ViewId
  readonly label: WorkbenchKey
  readonly archetypes?: readonly MenuArchetype[]
  readonly children?: readonly MenuEntry[]
}

/** 一个菜单分组及其条目。 */
export interface MenuSection {
  readonly id: MenuGroupId
  readonly label: WorkbenchKey
  readonly entries: readonly MenuEntry[]
}

/** 单个岗位的菜单画像：原型决定可见范围，置顶与隐藏只作用于业务应用。 */
export interface PositionMenuProfile {
  readonly archetype: MenuArchetype
  readonly landing: ViewId
  readonly pinned: readonly ViewId[]
  readonly hidden: readonly ViewId[]
}

/** 公共层：所有岗位恒定出现，不受岗位模板裁剪。 */
const WORK_ENTRIES: readonly MenuEntry[] = [
  { id: 'dashboard', label: 'nav.dashboard' },
  { id: 'tasks', label: 'nav.tasks' },
  { id: 'weekly-daily-reports', label: 'position.module.reports' },
  { id: 'calendar', label: 'nav.calendar' },
]

/** 组织与协作层：同样全员恒定；资料库改为左轨「知识中心」入口。 */
const COLLABORATION_ENTRIES: readonly MenuEntry[] = [
  { id: 'organization', label: 'nav.organization' },
]

/** 个人层：全员恒定。 */
const PERSONAL_ENTRIES: readonly MenuEntry[] = [
  { id: 'profile', label: 'nav.profile' },
]

/** 岗位运营下的八个业务模块；是否显示由岗位画像的 hidden 决定。 */
const POSITION_MODULE_ENTRIES: readonly MenuEntry[] = [
  { id: 'customer-resources', label: 'position.module.customer' },
  { id: 'material-management', label: 'position.module.material' },
  { id: 'supplier-management', label: 'position.module.supplier' },
  { id: 'equipment-ledger', label: 'position.module.equipment' },
  { id: 'contract-management', label: 'position.module.contract' },
  { id: 'budget-cost', label: 'position.module.budget' },
  { id: 'work-hours', label: 'position.module.hours' },
]

/** 经营视角五屏：与现有内容区数据对应，只在经营管理原型中出现。 */
const OPERATOR_ENTRIES: MenuEntry = {
  id: 'operator-overview',
  label: 'operator.group.operations',
  archetypes: ['management'],
  children: [
    { id: 'operator-decisions', label: 'operator.screen.decisions' },
    { id: 'operator-projects', label: 'operator.screen.projects' },
    { id: 'operator-functional', label: 'operator.screen.functional' },
    { id: 'operator-evidence', label: 'operator.screen.evidence' },
  ],
}

/** 业务应用层：按岗位原型与岗位隐藏项过滤。 */
const BUSINESS_ENTRIES: readonly MenuEntry[] = [
  { id: 'priorities', label: 'nav.priorities', archetypes: ['management'] },
  OPERATOR_ENTRIES,
  { id: 'project-operations', label: 'nav.projectOperations', archetypes: ['management', 'professional'] },
  ...POSITION_MODULE_ENTRIES,
]

/** 菜单标题补充：仍可从内容区进入但不再占据菜单的视图。 */
const EXTRA_VIEW_LABELS: Partial<Record<ViewId, WorkbenchKey>> = {
  'position-operations': 'nav.positionOperations',
  doclib: 'nav.doclib',
  files: 'nav.files',
  team: 'nav.groups',
  groups: 'nav.groups',
  'meeting-rooms': 'nav.meetingRooms',
  assistant: 'nav.assistant',
  methods: 'nav.methods',
}

/** 按岗位画像过滤并排序业务应用，再拼接三个公共分组。 */
export function assembleSections(profile: PositionMenuProfile): readonly MenuSection[] {
  const hidden = new Set<ViewId>(profile.hidden)
  const business = BUSINESS_ENTRIES
    .filter(entry => entry.archetypes === undefined || entry.archetypes.includes(profile.archetype))
    .filter(entry => !hidden.has(entry.id))
    .map(entry => entry.children === undefined
      ? entry
      : { ...entry, children: entry.children.filter(child => !hidden.has(child.id)) })
    .filter(entry => entry.children === undefined || entry.children.length > 0)
  const pinned = profile.pinned
    .map(id => business.find(entry => entry.id === id))
    .filter((entry): entry is MenuEntry => entry !== undefined)
  const rest = business.filter(entry => !profile.pinned.includes(entry.id))
  return [
    { id: 'work', label: 'nav.group.work', entries: WORK_ENTRIES },
    { id: 'business', label: 'nav.group.business', entries: [...pinned, ...rest] },
    { id: 'collaboration', label: 'nav.group.collaboration', entries: COLLABORATION_ENTRIES },
    { id: 'personal', label: 'nav.group.personal', entries: PERSONAL_ENTRIES },
  ]
}

/** 递归展开菜单项，供测试与标题查找使用。 */
export function flattenEntries(entries: readonly MenuEntry[]): readonly MenuEntry[] {
  return entries.flatMap(entry => entry.children === undefined ? [entry] : [entry, ...flattenEntries(entry.children)])
}

/** 查找视图对应的菜单标题；不在菜单中的视图返回 undefined。 */
export function menuLabelFor(view: ViewId): WorkbenchKey | undefined {
  const entry = flattenEntries([...WORK_ENTRIES, ...BUSINESS_ENTRIES, ...COLLABORATION_ENTRIES, ...PERSONAL_ENTRIES])
    .find(item => item.id === view)
  return entry?.label ?? EXTRA_VIEW_LABELS[view]
}
