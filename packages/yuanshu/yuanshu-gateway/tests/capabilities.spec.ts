import { request as httpRequest, type IncomingHttpHeaders } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  vi.unstubAllGlobals()
  const active = context
  context = undefined
  await active?.fiber.dispose()
})

interface GatewayResponse {
  readonly status: number
  readonly body: unknown
  readonly headers: IncomingHttpHeaders
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

/** 启动真实的 WebServer 并注册 gateway，返回同源调用函数。 */
async function startGateway(): Promise<
  (path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) => Promise<GatewayResponse>
> {
  const active = new Context()
  context = active
  await active.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  apply(active, { baseURL: 'http://yuanshu.test' })
  const port = Number(new URL(active.webServer.getOrigin()).port)

  return (path, init = {}) => new Promise<GatewayResponse>((resolve, reject) => {
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body)
    const client = httpRequest({
      host: '127.0.0.1',
      port,
      path,
      method: init.method ?? 'GET',
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) }),
        ...init.headers,
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      response.once('error', reject)
      response.once('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let body: unknown = text
        try { body = JSON.parse(text) } catch { /* keep raw text */ }
        resolve({ status: response.statusCode ?? 0, body, headers: response.headers })
      })
    })
    client.once('error', reject)
    if (payload !== undefined) client.write(payload)
    client.end()
  })
}

function recordedFetch(payload: unknown, status = 200): {
  fetch: ReturnType<typeof vi.fn>
  calls: Array<{ url: string; init: RequestInit | undefined }>
} {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init })
    return jsonResponse(payload, status)
  })
  vi.stubGlobal('fetch', fetch)
  return { fetch, calls }
}

it('proxies a skill execution and forwards the caller token', async () => {
  const { calls } = recordedFetch({ code: 0, data: { result: { ok: true } } })
  const call = await startGateway()

  const response = await call('/yuanshu-api/skills/7/execute', {
    method: 'POST',
    body: { input_data: { question: 'hello' } },
    headers: { authorization: 'Bearer user-token', 'x-tenant-id': '42' },
  })

  expect(response.status).toBe(200)
  expect(response.body).toEqual({ result: { ok: true } })
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/client/skills/7/execute')
  expect(calls[0]?.init?.method).toBe('POST')
  expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ input_data: { question: 'hello' } })
  const headers = calls[0]?.init?.headers as Record<string, string>
  expect(headers.Authorization).toBe('Bearer user-token')
  expect(headers['X-Active-Tenant']).toBe('42')
})

it('preserves a 404 so the client can treat the capability as invisible', async () => {
  recordedFetch({ code: 40401, message: 'skill not found' }, 404)
  const call = await startGateway()

  const response = await call('/yuanshu-api/skills/9/execute', { method: 'POST', body: { input_data: {} } })

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ error: 'skill not found', code: 40401 })
})

it('rejects a wrong method without touching upstream', async () => {
  const { fetch } = recordedFetch({ code: 0, data: {} })
  const call = await startGateway()

  const response = await call('/yuanshu-api/skills/7/execute')

  expect(response.status).toBe(405)
  expect(response.headers.allow).toBe('POST')
  expect(fetch).not.toHaveBeenCalled()
})

it('forwards the idempotency key and artifact ids for async executions', async () => {
  const { calls } = recordedFetch({ code: 0, data: { execution: { id: 11 }, reused: false } })
  const call = await startGateway()

  const response = await call('/yuanshu-api/algorithms/3/executions', {
    method: 'POST',
    body: { input_data: { x: 1 }, input_artifact_ids: ['a-1'] },
    headers: { 'idempotency-key': 'key-1' },
  })

  expect(response.status).toBe(200)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/algorithms/3/executions')
  expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
    input_data: { x: 1 }, input_artifact_ids: ['a-1'], idempotency_key: 'key-1',
  })
  const headers = calls[0]?.init?.headers as Record<string, string>
  expect(headers['Idempotency-Key']).toBe('key-1')
})

it('maps a DAG invoke body to the YuanShu contract', async () => {
  const { calls } = recordedFetch({ code: 0, data: { run_id: 'run-1' } })
  const call = await startGateway()

  const response = await call('/yuanshu-api/dag/definitions/flow-1/invoke', {
    method: 'POST',
    body: { input: { q: 1 }, conversation_id: 'c-1', conversationVars: { v: 2 }, trace_id: 't-1' },
  })

  expect(response.status).toBe(200)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/client/dag/definitions/flow-1/invoke')
  expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
    input: { q: 1 }, conversation_id: 'c-1', conversationVars: { v: 2 }, trace_id: 't-1',
  })
})

it('lists DAG history with a page size', async () => {
  const { calls } = recordedFetch({ code: 0, data: { list: [], total: 0 } })
  const call = await startGateway()

  const response = await call('/yuanshu-api/dag/history?page_size=20')

  expect(response.status).toBe(200)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/client/dag/history?page=1&page_size=20')
})

it('forwards the DAG definition filter and reads run detail through the client channel', async () => {
  const { calls } = recordedFetch({ code: 0, data: { id: 33, status: 'success' } })
  const call = await startGateway()

  await call('/yuanshu-api/dag/history?page_size=20&dag_definition_id=flow-1')
  const detail = await call('/yuanshu-api/dag/history/33')

  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/client/dag/history?page=1&page_size=20&dag_definition_id=flow-1')
  expect(calls[1]?.url).toBe('http://yuanshu.test/api/v1/client/dag/history/33')
  expect(detail.status).toBe(200)
  expect(detail.body).toEqual({ id: 33, status: 'success' })
})

it('keeps a 404 from the run detail endpoint intact', async () => {
  recordedFetch({ code: 404, message: 'capability not found' }, 404)
  const call = await startGateway()

  const response = await call('/yuanshu-api/dag/history/404')

  expect(response.status).toBe(404)
  expect(response.body).toEqual({ error: 'capability not found', code: 404 })
})

it('rejects malformed execution input before calling YuanShu', async () => {
  const { fetch } = recordedFetch({ code: 0, data: {} })
  const call = await startGateway()

  const response = await call('/yuanshu-api/skills/7/executions', {
    method: 'POST',
    body: { input_artifact_ids: 'not-an-array' },
  })

  expect(response.status).toBe(400)
  expect(response.body).toEqual({ error: 'input_artifact_ids must be an array of strings' })
  expect(fetch).not.toHaveBeenCalled()
})

it('uses the client capability catalog for ordinary users', async () => {
  const { calls } = recordedFetch({ code: 0, data: [
    { kind: 'skill', id: 7, name: '报表技能', description: '生成月报' },
    { kind: 'skill', id: 8, name: '本体资源', executable: false, interaction_mode: 'resource' },
  ] })
  const call = await startGateway()

  const response = await call('/yuanshu-api/capabilities')

  expect(response.status).toBe(200)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/client/capabilities')
  expect(response.body).toEqual([
    { kind: 'skill', id: '7', name: '报表技能', description: '生成月报', executable: true, raw: { kind: 'skill', id: 7, name: '报表技能', description: '生成月报' } },
    { kind: 'skill', id: '8', name: '本体资源', executable: false, interactionMode: 'resource', raw: { kind: 'skill', id: 8, name: '本体资源', executable: false, interaction_mode: 'resource' } },
  ])
})

it('does not proxy unregistered admin paths', async () => {
  const { fetch } = recordedFetch({ code: 0, data: {} })
  const call = await startGateway()

  const response = await call('/yuanshu-api/admin/users')

  expect(response.status).toBe(404)
  expect(fetch).not.toHaveBeenCalled()
})

it('accepts the console tenant header without resolving tenants', async () => {
  const { calls } = recordedFetch({ code: 0, data: [] })
  const call = await startGateway()

  await call('/yuanshu-api/capabilities', { headers: { authorization: 'Bearer console-token-a', 'x-active-tenant': 'shaoshi' } })

  expect(calls).toHaveLength(1)
  const headers = calls[0]?.init?.headers as Record<string, string>
  expect(headers['X-Active-Tenant']).toBe('shaoshi')
})

it('resolves the current tenant when the browser only sends a token', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push({ url, init })
    if (url.endsWith('/api/v1/user/tenants')) {
      return jsonResponse({
        code: 0,
        data: {
          current: { code: 'default' },
          list: [{ id: 1, code: 'default', current: true }, { id: 2, code: 'shaoshi' }],
        },
      })
    }
    return jsonResponse({ code: 0, data: [] })
  })
  vi.stubGlobal('fetch', fetch)
  const call = await startGateway()

  const response = await call('/yuanshu-api/capabilities', { headers: { authorization: 'Bearer admin-token' } })

  expect(response.status).toBe(200)
  expect(calls.map(call => call.url)).toEqual([
    'http://yuanshu.test/api/v1/user/tenants',
    'http://yuanshu.test/api/v1/client/capabilities',
  ])
  const headers = calls[1]?.init?.headers as Record<string, string>
  expect(headers['X-Active-Tenant']).toBe('default')
})

it('never falls back to an environment or file token', async () => {
  process.env.YUANSHU_TOKEN = 'stale-instance-token'
  try {
    const { calls } = recordedFetch({ code: 0, data: [] })
    const call = await startGateway()

    await call('/yuanshu-api/capabilities')

    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  } finally {
    delete process.env.YUANSHU_TOKEN
  }
})
