import { request as httpRequest, type IncomingMessage } from 'node:http'
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

it.each(['/qa/ask/stream', '/execute-stream'])('aborts the YuanShu SSE request at %s when the browser connection closes', async (path) => {
  const upstreamAborted = Promise.withResolvers<undefined>()
  const upstreamStarted = Promise.withResolvers<undefined>()
  const fetchMock = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
    const signal = init?.signal
    if (signal === null || signal === undefined) throw new Error('gateway test: upstream request has no signal')
    signal.addEventListener('abort', () => upstreamAborted.resolve(undefined), { once: true })
    upstreamStarted.resolve(undefined)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: progress\ndata: {"step":1}\n\n'))
      },
    })
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', fetchMock)

  const active = new Context()
  context = active
  await active.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  apply(active, { baseURL: 'http://yuanshu.test' })

  const port = Number(new URL(active.webServer.getOrigin()).port)
  const client = httpRequest({
    host: '127.0.0.1',
    port,
    path: `/yuanshu-api${path}`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
  client.write(JSON.stringify(path === '/execute-stream'
    ? { task: 'test task', worker_type: 'test_worker' }
    : { question: 'test question' }))
  client.end()

  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    client.once('response', resolve)
    client.once('error', reject)
  })
  const firstChunk = new Promise<void>((resolve, reject) => {
    response.once('data', () => resolve())
    response.once('error', reject)
  })
  await upstreamStarted.promise
  await firstChunk
  client.destroy()
  await upstreamAborted.promise
  expect(fetchMock).toHaveBeenCalledOnce()
})
