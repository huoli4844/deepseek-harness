/** 验证文本搜索纯函数：字面量匹配、大小写开关、命中上限与空关键字。 */
import { expect, it } from 'vitest'
import { findTextMatches, MAX_TEXT_MATCHES } from '../src/client/text-search.ts'

it('空关键字不产生任何匹配', () => {
  expect(findTextMatches('hello', '', false)).toEqual({ matches: [], total: 0 })
})

it('不区分大小写时返回全部匹配区间', () => {
  const result = findTextMatches('Alpha alpha ALPHA', 'alpha', false)
  expect(result.total).toBe(3)
  expect(result.matches).toEqual([
    { start: 0, end: 5 }, { start: 6, end: 11 }, { start: 12, end: 17 },
  ])
})

it('区分大小写时只保留完全一致的片段', () => {
  expect(findTextMatches('Alpha alpha', 'alpha', true)).toEqual({
    matches: [{ start: 6, end: 11 }], total: 1,
  })
})

it('命中过多时只返回前若干个区间但保留完整命中数', () => {
  const text = 'x'.repeat(MAX_TEXT_MATCHES + 5)
  const result = findTextMatches(text, 'x', false)
  expect(result.matches).toHaveLength(MAX_TEXT_MATCHES)
  expect(result.total).toBe(MAX_TEXT_MATCHES + 5)
})
