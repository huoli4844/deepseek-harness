/** 验证汇总项目合同的真实读取链路、分页及失败行为，不访问云端数据。 */
import { expect, it, vi } from 'vitest'
import { loadContractCatalog } from '../src/contract-catalog.ts'
import { contractListPage, contractListQuery } from '../src/contract-list.ts'
import { proxyContractList } from '../src/contract-proxy.ts'

const signal = new AbortController().signal

it('先读取全部项目，再读取合同所有分页并补充项目名称', async () => {
  const request = vi.fn<typeof fetch>(async (input, init) => {
    expect(init?.headers).toEqual({ authorization: 'Bearer employee', 'X-Active-Tenant': 'tenant' })
    const url = new URL(input instanceof Request ? input.url : input)
    const page = url.searchParams.get('page')
    if (url.pathname.endsWith('/projects')) return Response.json({ data: {
      items: [{ code: page === '1' ? 'P1' : 'P2', name: page === '1' ? '项目一' : '项目二' }], total: 2,
    } })
    if (url.pathname.includes('/P2/')) return Response.json({ data: { items: [], total: 0 } })
    return Response.json({ data: { items: [{ id: Number(page), code: `C${page ?? ''}` }], total: 2 } })
  })
  const rows = await loadContractCatalog('https://api.test', {
    authorization: 'Bearer employee', 'X-Active-Tenant': 'tenant',
  }, signal, request)
  expect(rows).toEqual([
    { id: 1, code: 'C1', project_code: 'P1', project_name: '项目一' },
    { id: 2, code: 'C2', project_code: 'P1', project_name: '项目一' },
  ])
  expect(request).toHaveBeenCalledTimes(5)
})

it('跨项目合同先搜索和数值排序再分页，档案总数独立保留', () => {
  const rows = [
    { id: 1, code: 'C1', project_name: '项目一', total_amount: '100' },
    { id: 2, code: 'C2', project_name: '项目一', total_amount: '9' },
    { id: 3, code: 'C3', project_name: '项目二', total_amount: '1' },
  ]
  const query = contractListQuery(new URLSearchParams('keyword=项目一&sort_by=total_amount&page=2&page_size=1'))
  if (!query) throw new Error('查询无效')
  expect(contractListPage(rows, query)).toMatchObject({
    items: [rows[0]], total: 2, archive_total: 3, page: 2, page_size: 1,
  })
})

it('项目或合同请求被拒绝时不返回空清单冒充成功', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: [{ code: 'P1' }] }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  await expect(loadContractCatalog('https://api.test', {}, signal, request)).rejects.toMatchObject({ status: 403 })
  await expect(loadContractCatalog('https://api.test', {}, signal,
    vi.fn<typeof fetch>(async () => Response.json({ code: 500, data: [] })))).rejects.toMatchObject({ status: 502 })
})

it('没有可访问项目时返回空清单，非法查询和写请求不执行读取', async () => {
  expect(await loadContractCatalog('https://api.test', {}, signal,
    vi.fn<typeof fetch>(async () => Response.json({ data: { items: [], total: 0 } })))).toEqual([])
  const res = { writeHead: vi.fn(), end: vi.fn() }
  await proxyContractList({ method: 'GET', url: '/yuanshu-workbench/contracts?page=0' }, res, '', {}, signal)
  expect(res.writeHead).toHaveBeenCalledWith(400, expect.anything())
  await proxyContractList({ method: 'POST' }, res, '', {}, signal)
  expect(res.writeHead).toHaveBeenLastCalledWith(405, expect.objectContaining({ allow: 'GET' }))
})
