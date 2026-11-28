/** 校验数据卡片查询代理：目录外路径拒绝、路径参数拼接、凭证转发与响应裁剪。 */
import { afterEach, expect, it, vi } from 'vitest'
import { registerDataQueryRoute } from '../src/data-query-proxy.ts'

/** 捕获注册路由并模拟请求/响应的测试壳。 */
function setup() {
  const routes: { handler: (req: unknown, res: unknown) => Promise<void> }[] = []
  const scope = {
    effect: (build: () => unknown) => { void build() },
    logger: { warn: () => { }, info: () => { } },
    webServer: { register: (route: { handler: (req: unknown, res: unknown) => Promise<void> }) => { routes.push(route) } },
  }
  registerDataQueryRoute(scope as never, 'https://backend.test')
  const route = routes[0]!
  return {
    ask: async (url: string, headers: Record<string, string> = { authorization: 'Bearer t', 'sec-fetch-site': 'same-origin' }) => {
      let status = 0
      let body: string | undefined
      await route.handler(
        { method: 'GET', url, headers },
        { writeHead: (code: number) => { status = code }, end: (text: string | undefined) => { body = text } },
      )
      return { status, body: body === undefined || body === '' ? undefined : JSON.parse(body) as unknown }
    },
  }
}

afterEach(() => { vi.unstubAllGlobals() })

it('目录内路径把路径参数拼进上游地址，转发凭证并裁剪分页结构', async () => {
  const fetchMock = vi.fn(async (input: URL) => {
    expect(String(input)).toContain('/api/v1/apps/shaoshi/projects/EP01/tasks')
    // 目录未声明的分页参数应被忽略而不是拒绝。
    expect(String(input)).not.toContain('page_size')
    return Response.json({ success: true, data: { total: 3, items: [
      { id: 1, name: '任务A' }, { id: 2, name: '任务B' }, { id: 3, name: '任务C' },
    ] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const { ask } = setup()
  const result = await ask('/yuanshu-workbench/data-query?path='
    + encodeURIComponent('/api/v1/apps/shaoshi/projects/{code}/tasks') + '&code=EP01&page_size=50&limit=2')
  expect(result.status).toBe(200)
  expect(result.body).toEqual(expect.objectContaining({
    data: { total: 3, items: [{ id: 1, name: '任务A' }, { id: 2, name: '任务B' }] },
    labels: expect.objectContaining({}) as Record<string, string>,
  }))
})

it('目录外路径直接拒绝，不发起后台请求', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const { ask } = setup()
  const result = await ask('/yuanshu-workbench/data-query?path=' + encodeURIComponent('/api/v1/not-in-catalog'))
  expect(result.status).toBe(404)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('缺少目录声明的路径参数时返回参数错误', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const { ask } = setup()
  const result = await ask('/yuanshu-workbench/data-query?path='
    + encodeURIComponent('/api/v1/apps/shaoshi/projects/{code}/tasks'))
  expect(result.status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('缺少鉴权或非同源请求被拒绝', async () => {
  const { ask } = setup()
  expect((await ask('/yuanshu-workbench/data-query?path=%2Fapi%2Fv1%2Ftenants', {})).status).toBe(401)
  expect((await ask('/yuanshu-workbench/data-query?path=%2Fapi%2Fv1%2Ftenants',
    { authorization: 'Bearer t', 'sec-fetch-site': 'cross-site' })).status).toBe(403)
})
