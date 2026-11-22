import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadEmployee, YuanShuIdentityUnavailable, YuanShuSessionExpired } from '../src/employee.ts'

afterEach(() => { vi.unstubAllGlobals() })

const jsonResponse = (status: number, body: object) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

describe('YuanShu employee identity', () => {
  it('derives the active tenant from YuanShu rather than trusting the request header', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 42 } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { current: { id: 3 } } }))
    vi.stubGlobal('fetch', fetchMock)
    const headers = { authorization: 'Bearer test-token', 'X-Active-Tenant': '003' }
    const signal = new AbortController().signal

    await expect(loadEmployee('https://yuan.example', headers, signal)).resolves.toEqual({
      tenantId: '3',
      userId: 42,
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://yuan.example/api/v1/user/me',
      'https://yuan.example/api/v1/user/tenants',
    ])
    expect(fetchMock.mock.calls.every(([, options]) => options?.headers === headers)).toBe(true)
  })

  it('loads the current tenant when the browser has no numeric tenant selection', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 42 } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { current: { id: 3 } } }))
    vi.stubGlobal('fetch', fetchMock)
    const headers = { authorization: 'Bearer test-token', 'X-Active-Tenant': 'tenant-code' }

    await expect(loadEmployee('https://yuan.example', headers, new AbortController().signal)).resolves.toEqual({
      tenantId: '3',
      userId: 42,
    })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://yuan.example/api/v1/user/me',
      'https://yuan.example/api/v1/user/tenants',
    ])
  })

  it('keeps session-expiry and unavailable-identity failures distinct', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(401, {})))
    await expect(loadEmployee('https://yuan.example', { 'X-Active-Tenant': '3' }, new AbortController().signal))
      .rejects.toBeInstanceOf(YuanShuSessionExpired)

    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }))
      .mockResolvedValueOnce(jsonResponse(200, { data: {} })))
    await expect(loadEmployee('https://yuan.example', { 'X-Active-Tenant': '3' }, new AbortController().signal))
      .rejects.toBeInstanceOf(YuanShuIdentityUnavailable)
  })
})
