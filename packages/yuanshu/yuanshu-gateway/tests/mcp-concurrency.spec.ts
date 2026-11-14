import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { YuanShuMcp } from '@deepseek-ai/dsh-yuanshu-client'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.restoreAllMocks()
})

async function gateway() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  apply(ctx, { baseURL: 'http://localhost:8081' })
  return { ctx, call: (token = 'user-a', tenant = 'tenant-a') => fetch(`${ctx.webServer.getOrigin()}/yuanshu-api/mcp/tools`, {
    headers: { authorization: `Bearer ${token}`, 'x-active-tenant': tenant },
  }) }
}

it('shares overlapping requests only within one gateway user and tenant, then closes after the final request', async () => {
  const blocked = Promise.withResolvers<undefined>()
  const clients: YuanShuMcp[] = []
  vi.spyOn(YuanShuMcp.prototype, 'tools').mockImplementation(async function (this: YuanShuMcp) {
    clients.push(this)
    await blocked.promise
    return []
  })
  const close = vi.spyOn(YuanShuMcp.prototype, 'close').mockResolvedValue()
  const first = await gateway()
  const other = await gateway()
  const requests = [first.call(), first.call()]
  await expect.poll(() => clients.length).toBe(2)
  requests.push(first.call('user-b'), first.call('user-a', 'tenant-b'), other.call())
  try {
    await expect.poll(() => clients.length).toBe(5)
    expect(clients[0]).toBe(clients[1])
    expect(new Set(clients).size).toBe(4)
    expect(close).not.toHaveBeenCalled()
  } finally { blocked.resolve(undefined); await Promise.allSettled(requests) }
  expect((await Promise.all(requests)).every(r => r.status === 200)).toBe(true)
  await expect.poll(() => close.mock.calls.length).toBe(4)
  await first.call()
  expect(clients[5]).not.toBe(clients[0])
  await expect.poll(() => close.mock.calls.length).toBe(5)
})

it('closes a shared active client once when its plugin is disposed', async () => {
  const blocked = Promise.withResolvers<undefined>()
  const started = Promise.withResolvers<undefined>()
  vi.spyOn(YuanShuMcp.prototype, 'tools').mockImplementation(async () => {
    started.resolve(undefined)
    await blocked.promise
    return []
  })
  const close = vi.spyOn(YuanShuMcp.prototype, 'close').mockImplementation(async () => { blocked.resolve(undefined) })
  const active = await gateway()
  const response = Promise.allSettled([active.call()])
  await started.promise
  await active.ctx.fiber.dispose()
  await response
  expect(close).toHaveBeenCalledOnce()
})
