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

it('does not disclose a launch URL to a request without a Harness browser session', () => {
  const { route, response, responseState, connection } = setup(401)
  route.handler({ headers: { host: 'example.test' } } as IncomingMessage, response)

  expect(responseState.status).toBe(401)
  expect(responseState.headers?.['cache-control']).toBe('no-store')
  expect(responseState.body).toBeUndefined()
  expect(connection.authenticatedUrl).not.toHaveBeenCalled()
})

it('returns an authenticated URL for the advertised app root to an authenticated session', () => {
  const { route, response, responseState, connection } = setup(undefined)
  route.handler({ headers: { host: 'example.test' } } as IncomingMessage, response)

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
