// @vitest-environment jsdom
/** 验证工作台启动时同源同步员工权限，MCP 状态不影响权限读取。 */
import { afterEach, expect, it, vi } from 'vitest'
import { initializeEnterpriseLogin } from '../src/client/modules/business-forms/source.ts'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('无登录凭证时跳过初始化，有凭证时独立通知三个同步入口', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (path) => {
    if (path === '/yuanshu-workbench/mcp-capabilities/login') throw new Error('MCP unavailable')
    return Response.json({ data: { roles: [], permissions: [] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const signal = new AbortController().signal
  await initializeEnterpriseLogin(signal)
  expect(fetchMock).not.toHaveBeenCalled()

  localStorage.setItem('workbench-client-token', 'employee')
  localStorage.setItem('yuanshu-active-tenant', '3')
  await initializeEnterpriseLogin(signal)
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/yuanshu-workbench/employee-access',
    '/yuanshu-workbench/swagger-capabilities/login',
    '/yuanshu-workbench/mcp-capabilities/login',
  ])
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST', signal,
    headers: { authorization: 'Bearer employee', 'X-Active-Tenant': '3' },
  })
})
