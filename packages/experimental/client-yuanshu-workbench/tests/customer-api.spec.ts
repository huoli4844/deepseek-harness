// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCustomer,
  fetchCustomers,
  fetchCustomerPage,
  parseCustomerList,
  parseCustomerPage,
  type CustomerDraft,
} from '../src/client/modules/business-modules/customer-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('客户资源数据层', () => {
  it('解析 md_customers 字段并保留客户信用信息', () => {
    expect(parseCustomerList({ data: { list: [{ id: 1, code: 'C-001', name: '测试客户', credit_limit: 100, credit_used: 20, status: 1, created_at: '2026-11-24 10:20:30', created_by: 7 }] } })).toEqual([expect.objectContaining({
      id: 1, code: 'C-001', name: '测试客户', creditLimit: 100, creditUsed: 20, status: 1, createdAt: '2026-11-24 10:20:30', createdBy: 7,
    })])
  })

  it('解析分页总数和当前分页信息', () => {
    const result = parseCustomerPage({ data: { list: [], pagination: { total: 31, page: 2, page_size: 20 } } }, 1, 200)
    expect(result).toEqual({ items: [], total: 31, archiveTotal: undefined, page: 2, pageSize: 20 })
  })

  it('通过同源代理读取并创建客户档案', async () => {
    localStorage.setItem('workbench-client-token', 'token')
    localStorage.setItem('yuanshu-active-tenant', 'shaoshi')
    const draft: CustomerDraft = {
      code: 'C-002', name: '新增客户', shortName: '', industry: '', level: 'normal', contactPerson: '',
      contactPhone: '', contactEmail: '', address: '', creditLimit: 0, status: 1,
    }
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { list: [{ id: 2, code: 'C-002', name: '新增客户' }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchCustomers(new AbortController().signal)).resolves.toHaveLength(1)
    await expect(createCustomer(draft, new AbortController().signal)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/yuanshu-workbench/customers?page=1&page_size=200')
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[1]?.[1]?.body).not.toContain('created_at')
    expect(fetchMock.mock.calls[1]?.[1]?.body).not.toContain('created_by')
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toBeInstanceOf(Headers)
  })

  it('编码搜索词并区分匹配数与档案总数', async () => {
    localStorage.setItem('workbench-client-token', 'token')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: { items: [], total: 3, archive_total: 42 } }))
    vi.stubGlobal('fetch', fetchMock)
    const page = await fetchCustomerPage(2, 20, { code: 'A', name: '客户 & A', contactPerson: 'Lee' },
      { key: 'createdAt', direction: 'desc' }, new AbortController().signal)
    expect(fetchMock).toHaveBeenCalledWith('/yuanshu-workbench/customers?page=2&page_size=20&code=A&name=%E5%AE%A2%E6%88%B7+%26+A&contact_person=Lee&sort_by=created_at&sort_direction=desc', expect.anything())
    expect(page).toMatchObject({ total: 3, archiveTotal: 42 })
  })
})
