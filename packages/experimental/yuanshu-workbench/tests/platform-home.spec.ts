import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformHomeLoader, YuanShuGrantMismatch } from '../src/platform-home.ts'

type ReadProjection = (tool: 'workbench_profile' | 'workbench_home' | 'workbench_briefing' | 'workbench_decisions' | 'workbench_position', signal: AbortSignal) => Promise<unknown>

afterEach(() => { vi.useRealTimers() })

const employee = { tenantId: '3', tenantCode: 'shaoshi', userId: 42 }
const result = (data: object) => ({ structuredContent: { outcome: 'returned', data } })

describe('employee MCP home projection', () => {
  it('returns risks and assigned tasks from the verified employee grant', async () => {
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(Date.now() + 60_000).toISOString() }))
      .mockResolvedValueOnce(result({
        tenant: { id: '3' },
        workbench: { name: '项目管理' },
        risks: [{ id: 17, title: '样机联调延期' }],
        my_tasks: [{ id: 17, name: '核实到货日期' }],
      }))
    const signal = new AbortController().signal
    await expect(new PlatformHomeLoader().load(read, Promise.resolve(employee), 1, signal)).resolves.toEqual({
      name: '项目管理',
      rows: [],
      employee,
      items: [
        { kind: 'risk', id: 17, title: '样机联调延期' },
        { kind: 'task', id: 17, title: '核实到货日期' },
      ],
    })
    expect(read.mock.calls).toEqual([['workbench_profile', signal], ['workbench_home', signal]])
  })

  it('reuses the verified identity until the profile expires or the MCP connection changes', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: expiresAt }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: expiresAt }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
    const loader = new PlatformHomeLoader()
    const signal = new AbortController().signal

    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    await loader.load(read, Promise.resolve(employee), 2, signal, 'project-operations')

    expect(read.mock.calls.map(([tool]) => tool)).toEqual([
      'workbench_profile', 'workbench_home', 'workbench_home', 'workbench_profile', 'workbench_home',
    ])
  })

  it('starts profile verification while employee identity is still loading', async () => {
    const employeeDeferred = Promise.withResolvers<typeof employee>()
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(Date.now() + 60_000).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
    const signal = new AbortController().signal
    const loading = new PlatformHomeLoader().load(read, employeeDeferred.promise, 1, signal, 'project-operations')

    expect(read.mock.calls).toEqual([['workbench_profile', signal]])
    employeeDeferred.resolve(employee)

    await expect(loading).resolves.toMatchObject({ employee, rows: [] })
    expect(read.mock.calls.map(([tool]) => tool)).toEqual(['workbench_profile', 'workbench_home'])
  })

  it('keeps an early profile failure handled while employee identity is loading', async () => {
    const employeeDeferred = Promise.withResolvers<typeof employee>()
    const profileDeferred = Promise.withResolvers<unknown>()
    const read = vi.fn<ReadProjection>().mockReturnValueOnce(profileDeferred.promise)
    const loading = new PlatformHomeLoader().load(read, employeeDeferred.promise, 1, new AbortController().signal)
    const failure = new Error('profile unavailable')
    profileDeferred.reject(failure)
    employeeDeferred.resolve(employee)

    await expect(loading).rejects.toBe(failure)
  })

  it('does not cache profiles without a future expiration', async () => {
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(0).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(0).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
    const loader = new PlatformHomeLoader()
    const signal = new AbortController().signal

    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')

    expect(read.mock.calls.map(([tool]) => tool)).toEqual([
      'workbench_profile', 'workbench_home', 'workbench_profile', 'workbench_home',
    ])
  })

  it('revalidates a profile after its expiration time', async () => {
    vi.useFakeTimers({ now: 1_000 })
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(2_000).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(10_000).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
    const loader = new PlatformHomeLoader()
    const signal = new AbortController().signal

    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    vi.setSystemTime(2_001)
    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    vi.useRealTimers()

    expect(read.mock.calls.map(([tool]) => tool)).toEqual([
      'workbench_profile', 'workbench_home', 'workbench_profile', 'workbench_home',
    ])
  })

  it('revalidates when the profile expires while employee identity is loading', async () => {
    vi.useFakeTimers({ now: 1_000 })
    const employeeDeferred = Promise.withResolvers<typeof employee>()
    const read = vi.fn<ReadProjection>()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(2_000).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(10_000).toISOString() }))
      .mockResolvedValueOnce(result({ tenant: { id: '3' }, projects: [] }))
    const loader = new PlatformHomeLoader()
    const signal = new AbortController().signal

    await loader.load(read, Promise.resolve(employee), 1, signal, 'project-operations')
    const loading = loader.load(read, employeeDeferred.promise, 1, signal, 'project-operations')
    vi.setSystemTime(2_001)
    employeeDeferred.resolve(employee)
    await loading

    expect(read.mock.calls.map(([tool]) => tool)).toEqual([
      'workbench_profile', 'workbench_home', 'workbench_profile', 'workbench_home',
    ])
  })

  it.each([{ tenant_id: '4', user_id: 42 }, { tenant_id: '3', user_id: 43 }])(
    'does not load home for a different employee or tenant',
    async (profile) => {
      const read = vi.fn<ReadProjection>().mockResolvedValue(result(profile))
      const loading = new PlatformHomeLoader().load(read, Promise.resolve(employee), 1, new AbortController().signal)
      await expect(loading).rejects.toBeInstanceOf(YuanShuGrantMismatch)
      expect(read).toHaveBeenCalledTimes(1)
    },
  )

  it('does not turn a rejected business response into an empty queue', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42, expires_at: new Date(Date.now() + 60_000).toISOString() }))
      .mockResolvedValueOnce({ structuredContent: { outcome: 'rejected' } })
    await expect(new PlatformHomeLoader().load(read, Promise.resolve(employee), 1, new AbortController().signal)).rejects.toThrow('projection failed')
  })
})
