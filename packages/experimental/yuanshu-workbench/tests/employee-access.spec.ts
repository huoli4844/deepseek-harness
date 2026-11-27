/** 验证权限快照仅来自已登录员工及云端确认的租户。 */
import { afterEach, expect, it, vi } from 'vitest'
import { EmployeeAccessStore } from '../src/employee-access.ts'
import { YuanShuSessionExpired } from '../src/employee.ts'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const role = { id: 7, name: '采购', code: 'purchasing' }

function upstream() {
  return vi.fn<typeof fetch>(async (url, init) => {
    const headers = new Headers(init?.headers)
    const tenant = headers.get('x-active-tenant')
    const token = headers.get('authorization')
    if (token === 'Bearer expired') return new Response(null, { status: 401 })
    const endpoint = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    if (endpoint.endsWith('/user/tenants')) {
      return Response.json({ data: { current: { id: tenant === '9' ? 9 : 3, code: 'active' } } })
    }
    const supplied = tenant === '9' ? { permissions: [] }
      : token === 'Bearer employee' ? { permissions: ['purchase.read', 'purchase.read'] } : {}
    return Response.json({ data: { id: token === 'Bearer employee' ? 42 : 52, roles: [role], ...supplied } })
  })
}

it('合并同一登录的并发查询，跨账号和租户独立，过期重新读取', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  const mock = upstream()
  vi.stubGlobal('fetch', mock)
  const store = new EmployeeAccessStore('https://yuan.example')
  const first = store.read('Bearer employee', '3')
  expect(store.read('Bearer employee', '3')).toBe(first)
  await expect(first).resolves.toEqual({ userId: 42, tenantId: '3', roles: [role], permissions: ['purchase.read'] })
  expect(mock).toHaveBeenCalledTimes(2)
  await expect(store.read('Bearer employee', '9')).resolves.toMatchObject({ tenantId: '9', permissions: [] })
  await expect(store.read('Bearer other', '3')).resolves.toMatchObject({ userId: 52, permissions: null })
  vi.advanceTimersByTime(60_001)
  await store.read('Bearer employee', '3')
  expect(mock).toHaveBeenCalledTimes(8)
  store.dispose()
})

it('拒绝租户不符与登录失效，失败结果不被复用', async () => {
  const mock = upstream()
  vi.stubGlobal('fetch', mock)
  const store = new EmployeeAccessStore('https://yuan.example')
  await expect(store.read('Bearer employee', '4')).rejects.toMatchObject({ upstream: 403 })
  await expect(store.read('Bearer expired', '3')).rejects.toBeInstanceOf(YuanShuSessionExpired)
  await expect(store.read('Bearer expired', '3')).rejects.toBeInstanceOf(YuanShuSessionExpired)
  expect(mock).toHaveBeenCalledTimes(6)
  store.dispose()
})
