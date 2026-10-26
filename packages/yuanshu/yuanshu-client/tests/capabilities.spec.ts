import { expect, it, vi } from 'vitest'
import { YuanShuClient, YuanShuError } from '../src/index.ts'

/** 构造元枢统一成功信封，测试重点放在客户端契约而不是 HTTP 框架。 */
function ok(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

it('遍历元枢分页能力目录并保留所有绑定资产', async () => {
  const seenHeaders: Array<HeadersInit | undefined> = []
  const fetcher = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    seenHeaders.push(init?.headers)
    const url = new URL(String(input))
    const page = Number(url.searchParams.get('page'))
    const path = url.pathname
    if (path === '/api/v1/agent/definitions' && page === 1) {
      // 第一页故意填满 100 条，验证客户端不会把“整页”误判为结束。
      return ok({
        list: Array.from({ length: 100 }, (_, index) => ({ id: `agent-${index}`, name: `Agent ${index}` })),
        total: 101,
        page: 1,
        page_size: 100,
      })
    }
    if (path === '/api/v1/agent/definitions' && page === 2) {
      return ok({ list: [{ id: 'agent-100', name: 'Agent 100' }], total: 101, page: 2, page_size: 100 })
    }
    const kind = path.includes('/skills') ? 'skill' : path.includes('/algorithms') ? 'algorithm' : 'dag'
    return ok({ list: [{ id: `${kind}-1`, name: `${kind} one` }], total: 1, page, page_size: 100 })
  })
  const client = new YuanShuClient({ baseURL: 'https://yuanshu.test', token: 'test-token', tenantId: 'tenant-1', fetch: fetcher })

  const capabilities = await client.listCapabilities()

  expect(capabilities).toHaveLength(104)
  expect(capabilities.find(item => item.id === 'agent-100')?.kind).toBe('agent')
  expect(fetcher).toHaveBeenCalledTimes(5)
  for (const call of fetcher.mock.calls) {
    const [input] = call
    const url = new URL(String(input))
    expect(url.searchParams.get('page_size')).toBe('100')
  }
  expect(seenHeaders).toHaveLength(5)
  expect(seenHeaders.every(headers => headers !== undefined &&
    Object.fromEntries(new Headers(headers).entries())['x-tenant-id'] === 'tenant-1')).toBe(true)
})

it('兼容旧网关直接返回数组的能力目录', async () => {
  const fetcher = vi.fn(async () => ok([{ id: 'legacy-agent', name: 'Legacy Agent' }]))
  const client = new YuanShuClient({ baseURL: 'https://yuanshu.test', fetch: fetcher })

  const capabilities = await client.listCapabilities()

  expect(capabilities).toHaveLength(4)
  expect(capabilities.every(item => item.id === 'legacy-agent')).toBe(true)
})

it('能力目录权限或服务错误不会被伪装成空列表', async () => {
  const fetcher = vi.fn(async (input: URL | RequestInfo) => {
    if (new URL(String(input)).pathname === '/api/v1/skills') {
      return new Response('forbidden', { status: 403, statusText: 'Forbidden' })
    }
    return ok({ list: [], total: 0, page: 1, page_size: 100 })
  })
  const client = new YuanShuClient({ baseURL: 'https://yuanshu.test', fetch: fetcher })

  await expect(client.listCapabilities()).rejects.toEqual(expect.objectContaining({
    name: 'YuanShuError',
    status: 403,
  } satisfies Partial<YuanShuError>))
})
