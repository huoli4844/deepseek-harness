import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, Config } from '../src/index.ts'

let context: Context | undefined

afterEach(async () => {
  const active = context
  context = undefined
  await active?.fiber.dispose()
  vi.unstubAllGlobals()
})

function setup(rejection: 401 | 403 | undefined): {
  route: WebRoute
  response: ServerResponse
  disposers: Array<ReturnType<typeof vi.fn>>
  responseState: {
    status: number | undefined
    headers: Record<string, string> | undefined
    body: string | undefined
  }
  connection: {
    authenticatedUrl: ReturnType<typeof vi.fn>
    requestRejection: ReturnType<typeof vi.fn>
  }
} {
  const routes: WebRoute[] = []
  const disposers: Array<ReturnType<typeof vi.fn>> = []
  const active = new Context()
  context = active
  active.provide('webServer', {
    register(route: WebRoute) {
      routes.push(route)
      const dispose = vi.fn()
      disposers.push(dispose)
      return dispose
    },
  } as never)
  const connection = {
    authenticatedUrl: vi.fn((url: string) => `${url}?token=launch-token`),
    requestRejection: vi.fn(() => rejection),
  }
  active.provide('connection', connection as never)
  active.provide('webApp', { getAdvertisedUrl: () => 'https://example.test/workbench/' } as never)
  apply(active, new Config({ yuanshuApiUrl: 'https://yuanshu.test' }))

  const route = routes.find(candidate => candidate.path === '/yuanshu-token')
  if (route === undefined) throw new Error('yuanshu-login-server: authentication handoff route is missing')
  const responseState = {
    status: undefined as number | undefined,
    headers: undefined as Record<string, string> | undefined,
    body: undefined as string | undefined,
  }
  const response = {
    writeHead(status: number, headers?: Record<string, string>) {
      responseState.status = status
      responseState.headers = headers
      return this
    },
    end(body?: string) {
      responseState.body = body
      return this
    },
  } as never as ServerResponse
  return { route, response, responseState, disposers, connection }
}

function request(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage
}

it('publishes the external identity marker so the account launcher yields its slot', async () => {
  setup(undefined)
  const table: Array<{ kind: string; name: string; value: unknown }> = []
  context!.emit('webserver/index-inject', table as never, undefined as never)
  expect(table).toContainEqual({
    kind: 'global',
    name: '__DSH_EXTERNAL_IDENTITY__',
    value: { accountLauncher: true },
  })
})

it('rejects a request with neither a Harness session nor a YuanShu token', async () => {
  const { route, response, responseState, connection } = setup(401)
  await route.handler(request({ host: 'example.test' }), response)

  expect(responseState.status).toBe(401)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(responseState.body).toBeUndefined()
  expect(connection.authenticatedUrl).not.toHaveBeenCalled()
})

it('rejects a YuanShu token the backend does not accept', async () => {
  const { route, response, responseState, connection } = setup(401)
  const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetchMock)
  await route.handler(request({ host: 'example.test', authorization: 'Bearer expired' }), response)

  expect(fetchMock).toHaveBeenCalledWith('https://yuanshu.test/api/v1/user/tenants', expect.objectContaining({
    headers: { authorization: 'Bearer expired' },
  }))
  expect(responseState.status).toBe(401)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(connection.authenticatedUrl).not.toHaveBeenCalled()
})

it('returns the authenticated URL once the YuanShu backend accepts the token', async () => {
  const { route, response, responseState, connection } = setup(401)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })))
  await route.handler(request({ host: 'example.test', authorization: 'Bearer valid' }), response)

  expect(responseState.status).toBe(200)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(responseState.headers?.['content-type']).toBe('application/json; charset=utf-8')
  expect(connection.authenticatedUrl).toHaveBeenCalledWith('https://example.test/workbench/')
  expect(JSON.parse(String(responseState.body))).toEqual({
    url: 'https://example.test/workbench/?token=launch-token',
  })
})

it('rejects the handoff when the YuanShu backend is unreachable', async () => {
  const { route, response, responseState, connection } = setup(401)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED') }))
  await route.handler(request({ host: 'example.test', authorization: 'Bearer valid' }), response)

  expect(responseState.status).toBe(401)
  expect(connection.authenticatedUrl).not.toHaveBeenCalled()
})

it('does not fall back to a token when the host fence rejects the request', async () => {
  const { route, response, responseState } = setup(403)
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  await route.handler(request({ host: 'evil.test', authorization: 'Bearer valid' }), response)

  expect(responseState.status).toBe(403)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(fetchMock).not.toHaveBeenCalled()
})

it('returns an authenticated URL for the advertised app root to an authenticated session', async () => {
  const { route, response, responseState, connection } = setup(undefined)
  await route.handler(request({ host: 'example.test' }), response)

  expect(responseState.status).toBe(200)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(responseState.headers?.['content-type']).toBe('application/json; charset=utf-8')
  expect(connection.authenticatedUrl).toHaveBeenCalledWith('https://example.test/workbench/')
  expect(JSON.parse(String(responseState.body))).toEqual({
    url: 'https://example.test/workbench/?token=launch-token',
  })
})

it('releases all web-server routes when the plugin context is disposed', async () => {
  const { disposers } = setup(undefined)
  const active = context
  context = undefined
  await active?.fiber.dispose()

  expect(disposers).toHaveLength(4)
  for (const dispose of disposers) expect(dispose).toHaveBeenCalledOnce()
})
