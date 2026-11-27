/** 校验只读目录的检索行为，使用真实生成目录但不访问后台。 */
import { expect, it } from 'vitest'
import { API_CATALOG } from '../src/api-catalog/catalog.generated.ts'
import { apiEntriesToWire, searchApiCatalog } from '../src/api-catalog/search.ts'

it('目录只收录可结构化读取的 GET，不含导出、下载、模板与流式接口', () => {
  expect(API_CATALOG.length).toBeGreaterThan(500)
  const excluded = /(?:^|\/)(?:exports?|downloads?|templates?|stream)(?:\/|$)/iu
  expect(API_CATALOG.filter(entry => excluded.test(entry.path))).toEqual([])
  expect(API_CATALOG.every(entry => entry.path.startsWith('/api/v1/'))).toBe(true)
})

it('按业务词检索返回相关接口，并保持精简结构', () => {
  const hits = searchApiCatalog(API_CATALOG, '客户')
  expect(hits.length).toBeGreaterThan(0)
  expect(hits.some(entry => entry.path.includes('customers') || entry.summary.includes('客户'))).toBe(true)
  const wire = apiEntriesToWire(hits.slice(0, 1))
  expect(wire).toHaveLength(1)
  expect(JSON.stringify(wire)).toContain('/api/v1/')
  expect(JSON.stringify(wire)).toContain('"params"')
})

it('按模块过滤并限制返回条数', () => {
  const hits = searchApiCatalog(API_CATALOG, '', { tag: 'agent-runtime', limit: 3 })
  expect(hits).toHaveLength(3)
  expect(hits.every(entry => entry.tag === 'agent-runtime')).toBe(true)
  expect(searchApiCatalog(API_CATALOG, '', { limit: 500 })).toHaveLength(20)
})

it('没有匹配时返回空结果，不猜测接口', () => {
  expect(searchApiCatalog(API_CATALOG, 'qqqzzz')).toEqual([])
})
