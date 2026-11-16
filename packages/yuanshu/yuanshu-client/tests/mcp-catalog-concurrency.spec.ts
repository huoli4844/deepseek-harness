import { afterEach, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { YuanShuMcp } from '../src/mcp.ts'

afterEach(() => { vi.restoreAllMocks() })

it('shares concurrent catalog discovery and reads again after settlement or failure', async () => {
  vi.spyOn(Client.prototype, 'connect').mockResolvedValue()
  const tools = [{ name: 'workbench_home', inputSchema: { type: 'object' as const } }]
  const list = vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools })
  const client = new YuanShuMcp({ resource: 'https://platform.example/mcp', issuer: 'https://platform.example',
    clientId: 'dsh', redirectUri: 'http://localhost:3080/callback', timeoutMs: 1000,
    credentials: { read: async () => undefined, write: async () => {} },
  })
  try {
    const results = await Promise.all(Array.from({ length: 6 }, () => client.tools()))
    expect(results).toEqual(Array.from({ length: 6 }, () => tools))
    expect(list).toHaveBeenCalledTimes(1)
    list.mockRejectedValueOnce(new Error('Catalog unavailable'))
    const failures = await Promise.allSettled([client.tools(), client.tools()])
    expect(failures.every(result => result.status === 'rejected')).toBe(true)
    expect(list).toHaveBeenCalledTimes(2)
    await expect(client.tools()).resolves.toEqual(tools)
    expect(list).toHaveBeenCalledTimes(3)
  } finally { await client.close() }
})
