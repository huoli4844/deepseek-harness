import { describe, expect, it, vi } from 'vitest'
import { YuanShuClient, YuanShuError } from '../src/index.ts'

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

/** 构造一个带调用记录的客户端；测试只替换 fetch，不启动 HTTP 服务。 */
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

describe('YuanShuClient capability execution', () => {
  it('executes a skill with snake_case input and authenticated tenant headers', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { result: { rows: 1 } } }))

    const result = await client.executeSkill(7, { question: '销售额' })

    expect(result).toEqual({ result: { rows: 1 } })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/skills/7/execute')
    expect(calls[0]?.init.method).toBe('POST')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({ input_data: { question: '销售额' } })
    expect(headersOf(calls[0] as RecordedCall).Authorization).toBe('Bearer token-1')
    expect(headersOf(calls[0] as RecordedCall)['X-Active-Tenant']).toBe('42')
  })

  it('submits a skill execution with artifacts and idempotency key', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { execution: { id: 9 }, reused: false } }))

    const result = await client.submitSkillExecution(7, {
      inputData: { month: '2026-10' },
      inputArtifactIds: ['a1', 'a2'],
      idempotencyKey: 'idem-1',
    })

    expect(result).toEqual({ execution: { id: 9 }, reused: false })
    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/skills/7/executions')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({
      input_data: { month: '2026-10' },
      input_artifact_ids: ['a1', 'a2'],
      idempotency_key: 'idem-1',
    })
    expect(headersOf(calls[0] as RecordedCall)['Idempotency-Key']).toBe('idem-1')
  })

  it('defaults algorithm execution to published mode and follows the draft flag', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { result: 1 } }))

    await client.executeAlgorithm(3, { values: [1, 2] })
    await client.executeAlgorithm(3, { values: [1, 2] }, { draft: true })

    expect(bodyOf(calls[0] as RecordedCall)).toEqual({ input_data: { values: [1, 2] }, draft: false })
    expect(bodyOf(calls[1] as RecordedCall)).toEqual({ input_data: { values: [1, 2] }, draft: true })
  })

  it('submits an algorithm execution and lists its history', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { list: [] } }))

    await client.submitAlgorithmExecution(3, { inputData: { x: 1 } })
    await client.listAlgorithmExecutions(3, 20)

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/algorithms/3/executions')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({ input_data: { x: 1 } })
    expect(calls[1]?.url).toBe('https://yuan-shu.example/api/v1/algorithms/3/executions?page=1&page_size=20')
    expect(calls[1]?.init.method).toBe('GET')
  })

  it('invokes a published DAG app and preserves camelCase conversation variables', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { run_id: 'r-1' } }))

    const result = await client.invokeDag(11, {
      input: { query: '本月订单' },
      conversationId: 'c-1',
      conversationVars: { region: '华东' },
      traceId: 't-1',
      idempotencyKey: 'idem-dag',
    })

    expect(result).toEqual({ run_id: 'r-1' })
    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/dag/definitions/11/invoke')
    expect(bodyOf(calls[0] as RecordedCall)).toEqual({
      input: { query: '本月订单' },
      conversation_id: 'c-1',
      conversationVars: { region: '华东' },
      trace_id: 't-1',
      idempotency_key: 'idem-dag',
    })
    expect(headersOf(calls[0] as RecordedCall)['Idempotency-Key']).toBe('idem-dag')
  })

  it('reads a DAG run and lists history with pagination', async () => {
    const { client, calls } = createClient(() => jsonResponse({ code: 0, data: { id: 5 } }))

    await client.getDagHistory(5)
    await client.listDagHistory(10)

    expect(calls[0]?.url).toBe('https://yuan-shu.example/api/v1/dag/history/5')
    expect(calls[1]?.url).toBe('https://yuan-shu.example/api/v1/dag/history?page=1&page_size=10')
  })

  it('accepts the 202 queued envelope when invoking a DAG app', async () => {
    const { client } = createClient(() => jsonResponse({
      code: 202,
      success: true,
      execution_id: 'dag-app-1-queued',
      status: 'queued',
      data: { execution_id: 'dag-app-1-queued', status: 'queued' },
    }, 202))

    const result = await client.invokeClientDag(1, { input: { dry_run: true }, idempotencyKey: 'idem-queued' })

    expect(result).toEqual({ execution_id: 'dag-app-1-queued', status: 'queued' })
  })

  it('keeps the YuanShu error code and classifies 404 as non-retryable', async () => {
    const { client } = createClient(() => jsonResponse({ code: 404, message: 'skill not visible' }, 404))

    await expect(client.executeSkill(7, {})).rejects.toMatchObject({
      name: 'YuanShuError',
      status: 404,
      code: 404,
      message: 'skill not visible',
      retryable: false,
    })
  })

  it('classifies transient failures as retryable', async () => {
    const { client } = createClient(() => jsonResponse({ code: 503, message: 'execution agent unavailable' }, 503))

    const error = await client.executeAlgorithm(3, {}).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(YuanShuError)
    expect((error as YuanShuError).status).toBe(503)
    expect((error as YuanShuError).retryable).toBe(true)
  })
})
