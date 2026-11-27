/** 组织统计纯函数：在司时间分段、年度入职/离职/累计曲线与角色分布汇总的规则测试。 */
import { expect, describe, it } from 'vitest'
import { createdMonth, emptyStats, summarizeMembers, tenureYears } from '../src/client/modules/business-modules/organization-stats.ts'
import type { MemberStatEntry } from '../src/client/modules/business-modules/organization-stats.ts'

/** 固定的“当前时间”，避免测试随运行日期漂移。 */
const now = new Date('2026-11-27T00:00:00Z')

describe('createdMonth', () => {
  it('从 created_at 提取 YYYY-MM，无效值返回空串', () => {
    expect(createdMonth('2026-03-15 09:00:00')).toBe('2026-03')
    expect(createdMonth('')).toBe('')
    expect(createdMonth(undefined)).toBe('')
    expect(createdMonth('abc')).toBe('')
  })
})

describe('tenureYears', () => {
  it('按公历日期差计算在司年数', () => {
    // 2026-03-15 至 2026-11-27 约为 0.7 年
    const years = tenureYears('2026-03-15 09:00:00', now)
    expect(years).toBeGreaterThan(0.6)
    expect(years).toBeLessThan(0.8)
  })
  it('无法解析的日期返回 undefined', () => {
    expect(tenureYears('2026-03', now)).toBeUndefined()
    expect(tenureYears('', now)).toBeUndefined()
  })
})

describe('summarizeMembers', () => {
  it('按月统计入职、累计与当前已离职人数', () => {
    const members: MemberStatEntry[] = [
      { createdAt: '2026-03-15 09:00:00', active: true },
      { createdAt: '2026-03-20 10:00:00', active: false },
      { createdAt: '2026-01-02 09:00:00', active: true },
      { createdAt: '', active: true },
    ]
    const stats = summarizeMembers(members, new Map([['管理员', 2]]), 3, 1, now)
    const march = stats.monthly.find(point => point.month === '2026-03')
    expect(march?.joined).toBe(2)
    expect(march?.departed).toBe(1)
    // 累计人数含未知入职月份的基数
    expect(march?.total).toBe(4)
    const january = stats.monthly.find(point => point.month === '2026-01')
    expect(january?.joined).toBe(1)
    expect(january?.departed).toBe(0)
    // 未知入职月份只计入累计基数
    expect(stats.monthly[0]?.total).toBe(2)
    // 在司时间分布只统计在职成员
    expect(stats.tenure.find(point => point.bucket === 'lt1')?.count).toBe(2)
    expect(stats.roles).toEqual([{ name: '管理员', count: 2 }])
  })

  it('在司时间按 1/3/5/10 年边界归入分段', () => {
    const members: MemberStatEntry[] = [
      { createdAt: '2020-06-01 09:00:00', active: true }, // 约 6.5 年 → 5-10 年
      { createdAt: '2021-10-01 09:00:00', active: true }, // 约 5.2 年 → 5-10 年
      { createdAt: '2024-01-01 09:00:00', active: true }, // 约 2.9 年 → 1-3 年
      { createdAt: '2010-01-01 09:00:00', active: true }, // 约 16.9 年 → 10 年以上
    ]
    const stats = summarizeMembers(members, new Map(), 4, 0, now)
    expect(stats.tenure.find(point => point.bucket === 'lt1')?.count).toBe(0)
    expect(stats.tenure.find(point => point.bucket === 'y1to3')?.count).toBe(1)
    expect(stats.tenure.find(point => point.bucket === 'y5to10')?.count).toBe(2)
    expect(stats.tenure.find(point => point.bucket === 'gte10')?.count).toBe(1)
  })

  it('emptyStats 返回零值且分段齐全', () => {
    const stats = emptyStats()
    expect(stats.monthly).toHaveLength(12)
    expect(stats.monthly.every(point => point.joined === 0 && point.departed === 0 && point.total === 0)).toBe(true)
    expect(stats.tenure).toHaveLength(5)
    expect(stats.tenure.every(point => point.count === 0)).toBe(true)
  })
})
