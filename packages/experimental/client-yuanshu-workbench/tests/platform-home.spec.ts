import { describe, expect, it, vi } from 'vitest'
import { loadPlatformHome } from '../src/platform-home.ts'

const employee = { tenantId: '3', userId: 42 }
const result = (data: object) => ({ structuredContent: { outcome: 'returned', data } })

describe('employee MCP home projection', () => {
  it('returns risks and assigned tasks from the verified employee grant', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42 }))
      .mockResolvedValueOnce(result({
        tenant: { id: '3' },
        workbench: { name: '项目管理' },
        risks: [{ id: 17, title: '样机联调延期' }],
        my_tasks: [{ id: 17, name: '核实到货日期' }],
      }))
    const signal = new AbortController().signal
    await expect(loadPlatformHome(read, employee, signal)).resolves.toEqual({
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

  it.each([{ tenant_id: '4', user_id: 42 }, { tenant_id: '3', user_id: 43 }])(
    'does not load home for a different employee or tenant',
    async (profile) => {
      const read = vi.fn().mockResolvedValue(result(profile))
      await expect(loadPlatformHome(read, employee, new AbortController().signal)).rejects.toThrow('another employee')
      expect(read).toHaveBeenCalledTimes(1)
    },
  )

  it('does not turn a rejected business response into an empty queue', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(result({ tenant_id: '3', user_id: 42 }))
      .mockResolvedValueOnce({ structuredContent: { outcome: 'rejected' } })
    await expect(loadPlatformHome(read, employee, new AbortController().signal)).rejects.toThrow('projection failed')
  })
})
