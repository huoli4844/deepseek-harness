/** 农历显示工具：以已知历法锚点日期核对 Intl 中历换算与初一显示月名的规则。 */
import { describe, expect, it } from 'vitest'
import { isoLunarLabel, lunarLabel } from '../src/client/core/lunar.ts'

describe('lunarLabel', () => {
  it('春节（正月初一）显示农历月名「正月」', () => {
    expect(lunarLabel(new Date(2024, 1, 10))).toBe('正月')
    expect(lunarLabel(new Date(2026, 1, 17))).toBe('正月')
  })

  it('闰月初一显示带「闰」前缀的月名（2025 年闰六月）', () => {
    expect(lunarLabel(new Date(2025, 6, 25))).toBe('闰六月')
  })

  it('非初一的日期显示农历日名', () => {
    // 2025 年中秋节（八月十五）与 2026 年端午节（五月初五）。
    expect(lunarLabel(new Date(2025, 9, 6))).toBe('十五')
    expect(lunarLabel(new Date(2026, 5, 19))).toBe('初五')
    expect(lunarLabel(new Date(2026, 10, 28))).toBe('二十')
    // 农历大月的三十日。
    expect(lunarLabel(new Date(2026, 2, 18))).toBe('三十')
  })
})

describe('isoLunarLabel', () => {
  it('按 ISO 日期串换算农历显示名', () => {
    expect(isoLunarLabel('2025-10-06')).toBe('十五')
    expect(isoLunarLabel('2026-02-17')).toBe('正月')
  })

  it('非法日期串返回空串，调用方按无值处理', () => {
    expect(isoLunarLabel('not-a-date')).toBe('')
    expect(isoLunarLabel('2026-11')).toBe('')
    expect(isoLunarLabel('')).toBe('')
  })
})
