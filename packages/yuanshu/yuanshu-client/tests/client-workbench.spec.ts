import { describe, expect, it, vi } from 'vitest'
import { YuanShuClient } from '../src/index.ts'

interface RecordedCall {
  readonly url: string
  readonly init: RequestInit
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createClient(handler: (call: RecordedCall) => Response | Promise<Response>): {
  readonly client: YuanShuClient
  readonly calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    return handler(call)
  })
  const client = new YuanShuClient({
    baseURL: 'https://yuan-shu.example/',
    token: 'token-1',
    tenantId: '42',
    fetch: fetch as unknown as typeof globalThis.fetch,
  })
  return { client, calls }
}

function headersOf(call: RecordedCall): Record<string, string> {
  return call.init.headers as Record<string, string>
}

function bodyOf(call: RecordedCall): unknown {
  return JSON.parse(String(call.init.body))
}

describe('YuanShuClient client workbench', () => {
  it('reads the current account profile from the user endpoint', async () => {
    const { client, calls } = createClient(() => jsonResponse({
      code: 0,
      message: 'success',
      data: { id: 1, username: 'admin', nickname: '管理员', extra: true },
    }))

    await expect(client.getCurrentUser()).resolves.toEqual({ id: 1, username: 'admin', nickname: '管理员' })
    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/user/me')
    expect(headersOf(calls[0]!)).toMatchObject({ Authorization: 'Bearer token-1' })
  })

  it('returns undefined when the user endpoint carries no object', async () => {
    const { client } = createClient(() => jsonResponse({ code: 0, message: 'success', data: null }))
    await expect(client.getCurrentUser()).resolves.toBeUndefined()
  })

  it('reads the client capability catalog and drops unusable rows', async () => {
    const { client, calls } = createClient(() => jsonResponse({
      code: 0,
      data: [
        { kind: 'skill', id: 7, name: '报表技能', description: '生成月报', input_schema: { type: 'object', properties: { month: { type: 'string' } } } },
        { kind: 'algorithm', id: 'a-1', name: '评分算法', input_schema: [] },
        { kind: 'plugin', id: 'x', name: '插件' },
        { kind: 'dag', id: 'd-1' },
        { kind: 'skill', id: 8, name: '本体资源', executable: false, interaction_mode: 'resource' },
      ],
    }))

    const capabilities = await client.listClientCapabilities()

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/client/capabilities')
    expect(capabilities).toEqual([
      {
        kind: 'skill', id: '7', name: '报表技能', description: '生成月报',
        inputSchema: { type: 'object', properties: { month: { type: 'string' } } },
        executable: true,
        raw: { kind: 'skill', id: 7, name: '报表技能', description: '生成月报', input_schema: { type: 'object', properties: { month: { type: 'string' } } } },
      },
      { kind: 'algorithm', id: 'a-1', name: '评分算法', description: undefined, executable: true, raw: { kind: 'algorithm', id: 'a-1', name: '评分算法', input_schema: [] } },
      {
        kind: 'skill', id: '8', name: '本体资源', executable: false, interactionMode: 'resource',
        raw: { kind: 'skill', id: 8, name: '本体资源', executable: false, interaction_mode: 'resource' },
      },
    ])
  })

  it('executes skills and algorithms through the client channel', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { result: { ok: true } } }))

    await client.executeClientSkill(7, { question: '销售额' })
    await client.executeClientAlgorithm('a-1', { score: 1 })

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/client/skills/7/execute')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({ input_data: { question: '销售额' } })
    expect(calls[1]?.url).toBe('https://yuan-shu.example/api/v1/client/algorithms/a-1/execute')
    expect(bodyOf(calls[1] as RecordedCall)).toEqual({ input_data: { score: 1 }, draft: false })
  })

  it('invokes a DAG app with the idempotency key on body and header', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { run_id: 'run-1' } }))

    await client.invokeClientDag('flow-1', {
      input: { q: 1 },
      conversationId: 'c-1',
      conversationVars: { v: 2 },
      traceId: 't-1',
      idempotencyKey: 'idem-1',
    })

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/client/dag/definitions/flow-1/invoke')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({
      input: { q: 1 }, conversation_id: 'c-1', conversationVars: { v: 2 }, trace_id: 't-1', idempotency_key: 'idem-1',
    })
    expect(headersOf(calls[0] as RecordedCall)['Idempotency-Key']).toBe('idem-1')
  })

  it('normalizes the tenant list payload and marks the active tenant header', async () => {
    const { client, calls } = createClient(() => jsonResponse({
      code: 0,
      data: { current: { code: 'default' }, list: [{ id: 1, code: 'default', current: true }, { id: 2, code: 'shaoshi' }] },
    }))

    const tenants = await client.listTenants()

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/user/tenants')
    expect(tenants).toEqual([{ id: 1, code: 'default', current: true }, { id: 2, code: 'shaoshi' }])
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers['X-Active-Tenant']).toBe('42')
    expect(headers['X-Tenant-ID']).toBeUndefined()
  })

  it('lists client histories with a page size and reads a DAG run detail', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { list: [], total: 0 } }))

    await client.listClientAlgorithmExecutions('a-1', 20)
    await client.listClientDagHistory(10, 'flow-1')
    await client.getClientDagHistoryDetail(33)

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/client/algorithms/a-1/executions?page=1&page_size=20')
    expect(calls[1]?.url).toBe('https://yuan-shu.example/api/v1/client/dag/history?page=1&page_size=10&dag_definition_id=flow-1')
    expect(calls[2]?.url).toBe('https://yuan-shu.example/api/v1/client/dag/history/33')
  })

  it('reads ontology catalogs and scenarios for the workbench', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { list: [], total: 0 } }))

    await client.getOntologyOverview()
    await client.listOntologySpaces(50)
    await client.listOntologyCollections()
    await client.listOntologyReleases(10)
    await client.listScenarios(5)

    expect(calls.map(call => call.url)).toEqual([
      'https://yuan-shu.example/api/v1/ontology-platform/overview',
      'https://yuan-shu.example/api/v1/ontology-platform/spaces?page=1&page_size=50',
      'https://yuan-shu.example/api/v1/ontology-platform/collections?page=1',
      'https://yuan-shu.example/api/v1/ontology-platform/releases?page=1&page_size=10',
      'https://yuan-shu.example/api/v1/agent/definitions?page=1&page_size=5',
    ])
  })

  it('reads the role workbench profile and its home projection', async () => {
    const { client, calls } = createClient(call => jsonResponse({
      code: 0,
      data: call.url.endsWith('/workbench/profile')
        ? { workbench: { code: 'tenant-admin', name: '租户管理工作台' }, active_roles: [] }
        : { workbench: { code: 'tenant-admin', name: '租户管理工作台' }, metrics: { project_total: 1 } },
    }))

    const profile = await client.getWorkbenchProfile()
    const home = await client.getWorkbenchHome()

    expect(calls.map(call => call.url)).toEqual([
      'https://yuan-shu.example/api/v1/apps/shaoshi/workbench/profile',
      'https://yuan-shu.example/api/v1/apps/shaoshi/workbench/home',
    ])
    expect(profile.workbench.code).toBe('tenant-admin')
    expect(home.metrics.project_total).toBe(1)
    expect(headersOf(calls[0]!).Authorization).toBe('Bearer token-1')
    expect(headersOf(calls[0]!)['X-Active-Tenant']).toBe('42')
  })

  it('keeps the 404 status so the UI can treat the capability as invisible', async () => {
    const { client } = createClient(() => jsonResponse({ code: 404, message: 'capability not found' }, 404))

    await expect(client.executeClientSkill(99, {})).rejects.toMatchObject({
      status: 404,
      message: 'capability not found',
    })
  })
})
