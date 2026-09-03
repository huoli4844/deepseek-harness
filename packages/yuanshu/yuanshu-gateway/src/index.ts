import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { YuanShuExecuteRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'yuanshu-gateway'
export const inject = ['webServer']

export interface Config { readonly baseURL: string; readonly token?: string; readonly prefix?: string }
export const Config: z<Config> = z.object({ baseURL: z.string().required(), token: z.string(), prefix: z.string().default('/yuanshu-api') })

const ALLOWED = new Set(['/capabilities', '/tenants', '/login', '/execute', '/execute-stream'])

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (Buffer.concat(chunks).length > 1024 * 1024) throw new Error('request body too large')
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

export function apply(ctx: Context, config: Config): void {
  const client = new YuanShuClient({
    baseURL: config.baseURL,
    ...(config.token === undefined ? {} : { token: config.token }),
  })
  const prefix = config.prefix ?? '/yuanshu-api'
  const route: WebRoute = { kind: 'prefix', path: prefix, handler: async (req, res) => {
    const relative = new URL(req.url ?? '/', 'http://localhost').pathname.slice(prefix.length) || '/capabilities'
    if (!ALLOWED.has(relative)) { res.writeHead(404); res.end(); return }
    const auth = req.headers.authorization
    const tenant = req.headers['x-tenant-id']
    client.setAuth(typeof auth === 'string' ? auth.replace(/^Bearer\s+/u, '') : undefined, typeof tenant === 'string' ? tenant : undefined)
    try {
      if (relative === '/capabilities') {
        await writeJSON(res, await client.listCapabilities()); return
      }
      if (relative === '/tenants') {
        await writeJSON(res, await client.listTenants()); return
      }
      const input = await body(req)
      const record = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
      if (relative === '/login') { await writeJSON(res, await client.login(String(record.username ?? ''), String(record.password ?? ''))); return }
      const executeRequest = input as YuanShuExecuteRequest
      if (relative === '/execute') { await writeJSON(res, await client.executeWorker(executeRequest)); return }
      const stream = client.executeWorkerStream(executeRequest)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
      for await (const event of stream) res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
      res.end()
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      await writeJSON(res, { error: error instanceof Error ? error.message : String(error) }, 502)
    }
  } }
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(route), 'yuanshu-gateway: route')
  })
}

async function writeJSON(res: ServerResponse, value: unknown, status = 200): Promise<void> {
  const output = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(output)
}

export default apply
