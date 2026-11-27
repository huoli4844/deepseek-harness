/** 工作台 MCP 服务目录的宿主缓存，不代理 REST 写入或改变 MCP 授权。 */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEmployee } from './employee.ts'
import { field } from './business-forms/model.ts'

const freshnessMs = 300_000

export interface CapabilityListing {
  readonly toolNames: readonly string[]
  readonly truncated: boolean
}

function loginKey(req: IncomingMessage): string | undefined {
  const { authorization, 'x-active-tenant': tenant } = req.headers
  if (!authorization || !/^Bearer [^\s]+$/u.test(authorization) || typeof tenant !== 'string' || !tenant) return undefined
  return createHash('sha256').update(authorization).update('\0').update(tenant).digest('hex')
}

/** 登录启动一次发现；业务请求仅在同一已知登录会话内触发过期刷新。 */
export function registerMcpCapabilities(ctx: Context, name: string, api: string) {
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'yuanshu: close capability discovery')
  let current: {
    key: string
    cache: McpCapabilities
    load: () => Promise<CapabilityListing | undefined>
    lifetime: AbortController
  } | undefined
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/yuanshu-workbench/mcp-capabilities/login', auth: 'required',
    handler(req, res) {
      const key = loginKey(req)
      if (req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin' || !key) {
        res.writeHead(req.method !== 'POST' ? 405 : 403).end()
        return
      }
      if (current?.key === key) {
        if (ctx.mcpManager.list().some(server => server.name === name && server.status.state === 'connected')) {
          void current.cache.read(current.load)
        }
      } else {
        current?.lifetime.abort()
        const login = new AbortController()
        const authorization = req.headers.authorization ?? ''
        const tenant = String(req.headers['x-active-tenant'])
        const load = async () => {
          const signal = AbortSignal.any([lifetime.signal, login.signal, AbortSignal.timeout(30_000)])
          const employee = await loadEmployee(api, { authorization, 'X-Active-Tenant': tenant }, signal)
          if (current?.key !== key) return undefined
          const read = ctx.mcpManager.projectionReader(name)
          const profile = field(field(await read('workbench_profile', signal), 'structuredContent'), 'data')
          signal.throwIfAborted()
          if (field(profile, 'user_id') !== employee.userId || field(profile, 'tenant_id') !== employee.tenantId) return undefined
          const toolNames = await ctx.mcpManager.refreshCatalog(name)
          signal.throwIfAborted()
          ctx.logger.info('元枢 MCP 服务目录已更新，共 %s 个工具', toolNames.length)
          return { toolNames, truncated: false }
        }
        const entry = { key, cache: new McpCapabilities(), load, lifetime: login }
        current = entry
        const signal = AbortSignal.any([lifetime.signal, login.signal, AbortSignal.timeout(freshnessMs)])
        void (async () => {
          for await (const servers of ctx.mcpManager.watch(signal)) {
            if (current !== entry) break
            if (servers.some(server => server.name === name && server.status.state === 'connected')) {
              await entry.cache.read(load)
              break
            }
          }
        })().catch(() => {})
      }
      res.writeHead(202, { 'cache-control': 'no-store' }).end()
    },
  }), 'yuanshu: discover capabilities after login')
  return (req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode < 400 || !res.headersSent) return
    if (current && current.key === loginKey(req) &&
        ctx.mcpManager.list().some(server => server.name === name && server.status.state === 'connected')) {
      void current.cache.read(current.load)
    }
  }
}

/** 合并同一登录会话的刷新；失败也限制尝试频率，工况恢复后再按需发现。 */
export class McpCapabilities {
  private lastAttempt = -Infinity
  private pending?: Promise<CapabilityListing | undefined>
  private value?: { readonly at: number; readonly listing: CapabilityListing }

  /** 优先返回五分钟内的成功目录，过期后最多并发一次请求。 */
  read(load: () => Promise<CapabilityListing | undefined>, now = Date.now): Promise<CapabilityListing | undefined> {
    if (this.value && now() - this.value.at < freshnessMs) return Promise.resolve(this.value.listing)
    if (this.pending) return this.pending
    if (now() - this.lastAttempt < freshnessMs) return Promise.resolve(undefined)
    this.lastAttempt = now()
    this.pending = Promise.resolve().then(load).then((listing) => {
      if (listing) this.value = { at: now(), listing }
      return listing
    }, () => undefined).finally(() => { delete this.pending })
    return this.pending
  }
}
