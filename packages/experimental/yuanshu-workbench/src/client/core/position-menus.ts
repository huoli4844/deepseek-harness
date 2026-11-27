/**
 * 岗位菜单配置：本地定义每个岗位的原型、默认落地页、置顶项与隐藏项。
 *
 * 边界：只消费菜单模型，不依赖 React 与网络；后续接入租户/权限时，
 * 保持本文件的结构不变，仅把配置来源替换为后台下发即可。
 */
import type { RoleId, ViewId } from './model.ts'
import { assembleSections, type MenuArchetype, type MenuSection, type PositionMenuProfile } from './menu-model.ts'

/** 统一构造岗位画像，避免十九个岗位重复写字段名。 */
function profile(
  archetype: MenuArchetype,
  landing: ViewId,
  pinned: readonly ViewId[],
  hidden: readonly ViewId[] = [],
): PositionMenuProfile {
  return { archetype, landing, pinned, hidden }
}

const MANAGEMENT_HIDDEN: readonly ViewId[] = [
  'material-management', 'supplier-management', 'equipment-ledger', 'work-hours',
]
const TESTING_HIDDEN: readonly ViewId[] = [
  'customer-resources', 'supplier-management', 'contract-management', 'budget-cost',
]
const ENGINEERING_HIDDEN: readonly ViewId[] = [
  'customer-resources', 'supplier-management', 'equipment-ledger', 'contract-management', 'budget-cost',
]
const MARKET_HIDDEN: readonly ViewId[] = ['supplier-management', 'equipment-ledger', 'work-hours']
const PROCUREMENT_HIDDEN: readonly ViewId[] = ['customer-resources', 'equipment-ledger', 'work-hours']
const HR_HIDDEN: readonly ViewId[] = [
  'customer-resources', 'material-management', 'supplier-management',
  'equipment-ledger', 'contract-management', 'budget-cost',
]
const QUALITY_HIDDEN: readonly ViewId[] = [
  'customer-resources', 'equipment-ledger', 'budget-cost', 'work-hours',
]
const SHOP_HIDDEN: readonly ViewId[] = [
  'customer-resources', 'material-management', 'supplier-management',
  'contract-management', 'budget-cost',
]

/** 十九个岗位的本地菜单画像；岗位只影响业务应用，公共项不在配置内。 */
export const POSITION_MENUS: Record<RoleId, PositionMenuProfile> = {
  executive: profile('management', 'priorities', ['priorities', 'project-operations'], MANAGEMENT_HIDDEN),
  president: profile('management', 'priorities', ['priorities', 'project-operations'], MANAGEMENT_HIDDEN),
  department: profile('management', 'priorities', ['priorities', 'project-operations'], MANAGEMENT_HIDDEN),
  director: profile('management', 'priorities', ['priorities', 'project-operations'], MANAGEMENT_HIDDEN),
  pilot: profile('management', 'priorities', ['priorities', 'project-operations'], MANAGEMENT_HIDDEN),
  project: profile('professional', 'project-operations', [
    'project-operations', 'customer-resources', 'contract-management',
  ]),
  testing: profile('professional', 'project-operations', [
    'project-operations', 'material-management',
  ], TESTING_HIDDEN),
  motor: profile('professional', 'project-operations', [
    'project-operations', 'material-management', 'work-hours',
  ], ENGINEERING_HIDDEN),
  brake: profile('professional', 'project-operations', [
    'project-operations', 'material-management', 'work-hours',
  ], ENGINEERING_HIDDEN),
  hardware: profile('professional', 'project-operations', [
    'project-operations', 'material-management', 'work-hours',
  ], ENGINEERING_HIDDEN),
  firmware: profile('professional', 'project-operations', [
    'project-operations', 'material-management', 'work-hours',
  ], ENGINEERING_HIDDEN),
  marketing: profile('professional', 'project-operations', [
    'project-operations', 'customer-resources', 'contract-management',
  ], MARKET_HIDDEN),
  sales: profile('professional', 'project-operations', [
    'project-operations', 'customer-resources', 'contract-management',
  ], MARKET_HIDDEN),
  procurement: profile('functional', 'dashboard', [
    'supplier-management', 'material-management', 'contract-management', 'budget-cost',
  ], PROCUREMENT_HIDDEN),
  hr: profile('functional', 'dashboard', ['work-hours'], HR_HIDDEN),
  quality: profile('functional', 'dashboard', [
    'contract-management',
  ], QUALITY_HIDDEN),
  assurance: profile('functional', 'dashboard', [
    'contract-management',
  ], QUALITY_HIDDEN),
  operator: profile('execution', 'dashboard', [
    'equipment-ledger', 'work-hours',
  ], SHOP_HIDDEN),
  equipment: profile('execution', 'dashboard', [
    'equipment-ledger', 'work-hours',
  ], SHOP_HIDDEN),
}

/** 读取岗位组装后的完整菜单分组。 */
export function menuForRole(role: RoleId): readonly MenuSection[] {
  return assembleSections(POSITION_MENUS[role])
}

/** 读取岗位切换后的默认落地页。 */
export function landingForRole(role: RoleId): ViewId {
  return POSITION_MENUS[role].landing
}
