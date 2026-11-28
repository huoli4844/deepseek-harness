/** 岗位菜单配置：公共项恒定、业务项随原型与岗位画像变化。 */
import { describe, expect, it } from 'vitest'
import { roleIds } from '../src/client/core/fixtures.ts'
import { flattenEntries } from '../src/client/core/menu-model.ts'
import { landingForRole, menuForRole, POSITION_MENUS } from '../src/client/core/position-menus.ts'
import type { ViewId } from '../src/client/core/model.ts'

/** 取指定分组的菜单项标识，子项一并展开。 */
function idsInGroup(role: (typeof roleIds)[number], group: 'work' | 'business' | 'collaboration' | 'personal'): readonly ViewId[] {
  const section = menuForRole(role).find(item => item.id === group)
  if (section === undefined) throw new Error(`missing menu group ${group}`)
  return flattenEntries(section.entries).map(entry => entry.id)
}

describe('岗位菜单配置', () => {
  it('所有岗位都包含四个固定分组和全部公共项', () => {
    for (const role of roleIds) {
      expect(menuForRole(role).map(section => section.id)).toEqual(['work', 'business', 'collaboration', 'personal'])
      expect(idsInGroup(role, 'work')).toEqual(['dashboard', 'tasks', 'weekly-daily-reports', 'calendar'])
      expect(idsInGroup(role, 'collaboration')).toEqual(['organization', 'work-methods'])
      expect(idsInGroup(role, 'personal')).toEqual(['profile'])
      expect([...idsInGroup(role, 'work'), ...idsInGroup(role, 'business')]).not.toContain('files')
    }
  })

  it('经营管理岗位包含经营重点和经营视角五屏，其他岗位不出现', () => {
    const management = idsInGroup('executive', 'business')
    expect(management).toContain('priorities')
    expect(management).toEqual(expect.arrayContaining(['operator-overview', 'operator-decisions', 'operator-evidence']))
    expect(idsInGroup('procurement', 'business')).not.toContain('priorities')
    expect(idsInGroup('equipment', 'business')).not.toContain('operator-overview')
  })

  it('采购岗位置顶供应商、物料、合同与预算，并隐藏无关模块', () => {
    const business = idsInGroup('procurement', 'business')
    expect(business.slice(0, 4)).toEqual([
      'supplier-management', 'material-management', 'contract-management', 'budget-cost',
    ])
    expect(business).not.toContain('customer-resources')
    expect(business).not.toContain('project-operations')
    expect(business).not.toContain('work-hours')
  })

  it('项目岗位保留全部业务模块，周报已移入我的工作', () => {
    const business = idsInGroup('project', 'business')
    expect(business).toEqual(expect.arrayContaining([
      'customer-resources', 'material-management', 'supplier-management', 'equipment-ledger',
      'contract-management', 'budget-cost', 'work-hours',
    ]))
    expect(business).not.toContain('weekly-daily-reports')
    expect(idsInGroup('project', 'work')).toContain('weekly-daily-reports')
  })

  it('执行岗位只保留设备与工时，周报在公共分组中', () => {
    for (const role of ['operator', 'equipment'] as const) {
      const business = idsInGroup(role, 'business')
      expect(business).toEqual(expect.arrayContaining(['equipment-ledger', 'work-hours']))
      expect(business).not.toContain('weekly-daily-reports')
      expect(idsInGroup(role, 'work')).toContain('weekly-daily-reports')
      expect(business).not.toContain('customer-resources')
      expect(business).not.toContain('contract-management')
      expect(business).not.toContain('budget-cost')
    }
  })

  it('每个岗位的置顶项都真实存在于业务应用并保留默认落地页', () => {
    for (const role of roleIds) {
      const business = idsInGroup(role, 'business')
      for (const pinned of POSITION_MENUS[role].pinned) expect(business).toContain(pinned)
      if (landingForRole(role) !== 'dashboard') expect(business).toContain(landingForRole(role))
    }
    expect(landingForRole('executive')).toBe('priorities')
    expect(landingForRole('project')).toBe('project-operations')
    expect(landingForRole('procurement')).toBe('dashboard')
  })
})
