/** 校验只读查询的参数处理、凭证注入、错误映射与响应裁剪，不访问真实后台。 */
import { afterEach, expect, it, vi } from 'vitest'
import { ApiQueryError, buildApiUrl, queryApi } from '../src/api-catalog/query.ts'
import { trimApiResponse } from '../src/api-catalog/model.ts'
import type { ApiCatalogEntry } from '../src/api-catalog/model.ts'

afterEach(() => { vi.unstubAllGlobals() })

const entry: ApiCatalogEntry = {
  path: '/api/v1/apps/shaoshi/mes/equipments/{id}',
  summary: '查询设备台账详情',
  tag: 'apps/shaoshi',
  fields: [],
  params: [
    { name: 'id', in: 'path', type: 'integer', required: true, description: '设备标识' },
    { name: 'status', in: 'query', type: 'string', required: false, description: '状态' },
    { name: 'ids', in: 'query', type: 'array', required: false, description: '批量标识' },
  ],
}

it('路径参数替换并编码，查询参数逐个拼接，数组按重复键展开', () => {
  const built = buildApiUrl(entry, { id: '12', status: '运行中', ids: '1,2' })
  expect(built.path).toBe('/api/v1/apps/shaoshi/mes/equipments/12')
  expect(built.query).toEqual([['status', '运行中'], ['ids', '1'], ['ids', '2']])
})

it('未知参数、缺少必填或类型不符时拒绝调用', () => {
  expect(() => buildApiUrl(entry, { id: '12', unknown: 'x' })).toThrow(/没有参数 unknown/u)
  expect(() => buildApiUrl(entry, {})).toThrow(/缺少必填参数 id/u)
  expect(() => buildApiUrl(entry, { id: 'abc' })).toThrow(/需要整数/u)
})

it('查询自动携带员工凭证与主动租户，不把令牌写入结果', async () => {
  let requested = ''
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    requested = input instanceof URL ? input.href : input instanceof Request ? input.url : input
    return Response.json({ success: true, code: 0, data: [{ id: 1 }] })
  })
  vi.stubGlobal('fetch', fetchMock)
  const text = await queryApi({
    api: 'https://workbench.test/', entry, params: { id: '12' }, limit: 20,
    credential: { authorization: 'Bearer secret-token', tenant: 'shaoshi' },
    signal: new AbortController().signal,
  })
  expect(text).toBe(JSON.stringify({ total: 1, returned: 1, truncated: false, items: [{ id: 1 }] }))
  expect(text).not.toContain('secret-token')
  expect(requested).toBe('https://workbench.test/api/v1/apps/shaoshi/mes/equipments/12')
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer secret-token', 'X-Active-Tenant': 'shaoshi' })
})

it('后台失败按状态映射为可读说明，避免泄露技术细节', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ code: 403, message: 'forbidden by policy' }, { status: 403 }))
  vi.stubGlobal('fetch', fetchMock)
  const run = queryApi({
    api: 'https://workbench.test', entry, params: { id: '12' }, limit: 20,
    credential: { authorization: 'Bearer token', tenant: '' }, signal: new AbortController().signal,
  })
  await expect(run).rejects.toBeInstanceOf(ApiQueryError)
  await expect(run).rejects.toThrow('forbidden by policy')
})

it('响应按条数裁剪并标记截断', () => {
  const rows = [1, 2, 3, 4, 5]
  expect(JSON.parse(trimApiResponse(rows, 2))).toEqual({ total: 5, returned: 2, truncated: true, items: [1, 2] })
  expect(JSON.parse(trimApiResponse({ items: [1, 2], total: 9 }, 50))).toEqual({ total: 9, returned: 2, truncated: false, items: [1, 2] })
  expect(trimApiResponse(null, 10)).toBe('null')
})
