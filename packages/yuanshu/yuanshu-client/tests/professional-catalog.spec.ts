import { expect, it, vi } from 'vitest'
import { YuanShuClient, YuanShuMcp } from '../src/index.ts'

function fixture() {
  const mcp = new YuanShuMcp({ resource: 'http://localhost:8081/api/v1/client/mcp', issuer: 'http://localhost:8081', clientId: 'test', redirectUri: 'http://localhost:3000/callback', timeoutMs: 1000, credentials: { read: async () => undefined, write: async () => {} } })
  const fetch = vi.fn(async () => { throw new Error('Enterprise discovery must use MCP') })
  const client = new YuanShuClient({ baseURL: 'http://localhost:8081', enterprise: mcp, fetch })
  return { mcp, client, fetch }
}
const envelope = (value: Record<string, unknown>) => ({ resultType: 'complete' as const, content: [], structuredContent: { schema_version: '1', data: value } })

it('follows a professional cursor through a page emptied by publication filtering', async () => {
  const { client, mcp, fetch } = fixture()
  const call = vi.spyOn(mcp, 'call').mockResolvedValueOnce(envelope({ items: [{ id: 4, name: '专业评估', description: '质量评估', revision_id: 8 }], next_after_id: 4 })).mockResolvedValueOnce(envelope({ items: [], next_after_id: 6 })).mockResolvedValueOnce(envelope({ items: [{ id: 7, name: '专业问数', description: '本体查询', revision_id: 9 }], next_after_id: 0 }))
  await expect(client.listScenarios(1)).resolves.toEqual({ items: [{ id: 4, name: '专业评估', description: '质量评估', revision_id: 8 }, { id: 7, name: '专业问数', description: '本体查询', revision_id: 9 }] })
  expect(call.mock.calls.map(item => item.slice(0, 2))).toEqual([['scenarios_list', { after_id: 0, limit: 1 }], ['scenarios_list', { after_id: 4, limit: 1 }], ['scenarios_list', { after_id: 6, limit: 1 }]])
  expect(fetch).not.toHaveBeenCalled()
})

it('rejects a nonadvancing professional cursor instead of silently losing entries', async () => {
  const { client, mcp } = fixture()
  vi.spyOn(mcp, 'call').mockResolvedValue(envelope({ items: [], next_after_id: 4 }))
  await expect(client.listScenarios()).rejects.toMatchObject({ code: 'MCP_CATALOG_INVALID' })
})

it('rejects management rows without a published revision', async () => {
  const { client, mcp } = fixture()
  vi.spyOn(mcp, 'call').mockResolvedValue(envelope({ items: [{ id: 4, name: 'draft', description: '' }], next_after_id: 0 }))
  await expect(client.listScenarios()).rejects.toMatchObject({ code: 'MCP_CATALOG_INVALID' })
})

it.each([0, -1, 1.5, 101])('rejects invalid professional page size %s before calling the platform', async (limit) => {
  const { client, mcp } = fixture()
  const call = vi.spyOn(mcp, 'call')
  await expect(client.listScenarios(limit)).rejects.toMatchObject({ code: 'MCP_CATALOG_INVALID' })
  expect(call).not.toHaveBeenCalled()
})

it.each([0, -1, 1.5])('rejects an invalid immutable revision %s', async (revision) => {
  const { client, mcp } = fixture()
  vi.spyOn(mcp, 'call').mockResolvedValue(envelope({ items: [{ id: 4, name: '专业任务', description: '', revision_id: revision }], next_after_id: 0 }))
  await expect(client.listScenarios()).rejects.toMatchObject({ code: 'MCP_CATALOG_INVALID' })
})
