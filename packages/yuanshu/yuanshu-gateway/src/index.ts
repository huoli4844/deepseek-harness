import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { YuanShuExecuteRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { AskKnowledgeQuestionRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const name = 'yuanshu-gateway'
export const inject = ['webServer']

/** Gateway endpoint and optional server-side credentials. */
export interface Config {
  /** Base URL of the YuanShu API. */
  readonly baseURL: string
  /** Optional default bearer token used when a request has no authorization header. */
  readonly token?: string
  /** Same-origin path prefix registered by the gateway. */
  readonly prefix?: string
}
export const Config: z<Config> = z.object({ baseURL: z.string().required(), token: z.string(), prefix: z.string().default('/yuanshu-api') })

/**
 * Gateway routes exposed on the prefix path.
 *
 * Worker API:
 *   /capabilities           GET  → list all YuanShu capabilities
 *   /tenants                GET  → list user tenants
 *   /login                  POST → authenticate (sets token on client)
 *   /execute                POST → execute worker (sync)
 *   /execute-stream         POST → execute worker (SSE stream)
 *
 * Knowledge Q&A:
 *   /qa/ask                 POST → ask knowledge question (sync)
 *   /qa/ask/stream          POST → ask knowledge question (SSE stream)
 *   /qa/sessions            GET  → list Q&A sessions
 *   /qa/readiness           GET  → check QA readiness of collections
 *   /knowledges             GET  → list knowledge collections
 *   /knowledges/:id         GET  → get knowledge document by ID
 */
const ALLOWED = new Set([
  // Worker API
  '/capabilities', '/tenants', '/login', '/execute', '/execute-stream',
  // Knowledge Q&A
  '/qa/ask', '/qa/ask/stream', '/qa/sessions', '/qa/readiness',
  '/knowledges', '/knowledges/',
])

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    if (Buffer.concat(chunks).length > 1024 * 1024) throw new Error('request body too large')
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : undefined
}

function bindClientAbort(req: IncomingMessage, res: ServerResponse): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  const onResponseClose = (): void => {
    if (!res.writableEnded) abort()
  }
  req.once('aborted', abort)
  res.once('close', onResponseClose)
  return {
    signal: controller.signal,
    dispose: () => {
      req.off('aborted', abort)
      res.off('close', onResponseClose)
    },
  }
}

/**
 * Parse a query string from the URL into a Record.
 */
function parseQuery(url: string): Record<string, string> {
  const parsed = new URL(url, 'http://localhost')
  const params: Record<string, string> = {}
  parsed.searchParams.forEach((value, key) => { params[key] = value })
  return params
}

/** Resolve the YuanShu auth token: config > env var > shared token file. */
function resolveToken(config: Config): string | undefined {
  if (config.token) return config.token
  const envToken = process.env.YUANSHU_TOKEN
  if (envToken) return envToken
  const tokenFile = join(homedir(), '.dsh', 'yuanshu-token')
  try {
    const fileToken = readFileSync(tokenFile, 'utf8').trim()
    if (fileToken) return fileToken
  } catch {
    // File doesn't exist or unreadable — fall through
  }
  return undefined
}

export function apply(ctx: Context, config: Config): void {
  const token = resolveToken(config)
  const prefix = config.prefix ?? '/yuanshu-api'
  const route: WebRoute = { kind: 'prefix', path: prefix, handler: async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname
    // Remove prefix and leading slash
    const relative = pathname.startsWith(prefix)
      ? pathname.slice(prefix.length) || '/'
      : pathname

    if (!ALLOWED.has(relative) && !relative.startsWith('/qa/') && !relative.startsWith('/knowledges') && !relative.startsWith('/capabilities') && !relative.startsWith('/tenants') && !relative.startsWith('/login') && !relative.startsWith('/execute')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }

    const auth = req.headers.authorization
    const tenant = req.headers['x-tenant-id']
    const requestClient = new YuanShuClient({
      baseURL: config.baseURL,
      ...(typeof auth === 'string'
        ? { token: auth.replace(/^Bearer\s+/u, '') }
        : token === undefined ? {} : { token }),
      ...(typeof tenant === 'string' ? { tenantId: tenant } : {}),
    })

    try {
      // ── Worker API ────────────────────────────────────────────────────

      if (relative === '/capabilities') {
        await writeJSON(res, await requestClient.listCapabilities())
        return
      }

      if (relative === '/tenants') {
        await writeJSON(res, await requestClient.listTenants())
        return
      }

      if (relative === '/login') {
        const input = await body(req)
        const record = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {}
        await writeJSON(res, await requestClient.login(
          String(record.username ?? ''),
          String(record.password ?? ''),
        ))
        return
      }

      if (relative === '/execute') {
        const executeRequest = (await body(req)) as YuanShuExecuteRequest
        await writeJSON(res, await requestClient.executeWorker(executeRequest))
        return
      }

      if (relative === '/execute-stream') {
        const executeRequest = (await body(req)) as YuanShuExecuteRequest
        const clientAbort = bindClientAbort(req, res)
        const stream = requestClient.executeWorkerStream(executeRequest, clientAbort.signal)
        try {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          for await (const event of stream) {
            res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
          }
          res.end()
        } finally {
          clientAbort.dispose()
        }
        return
      }

      // ── Knowledge Q&A ─────────────────────────────────────────────────

      if (relative === '/qa/ask') {
        const bodyData = await body(req)
        const askRequest = bodyData as AskKnowledgeQuestionRequest
        await writeJSON(res, await requestClient.askQuestion(askRequest))
        return
      }

      if (relative === '/qa/ask/stream') {
        const bodyData = await body(req)
        const askRequest = bodyData as AskKnowledgeQuestionRequest
        const clientAbort = bindClientAbort(req, res)
        const stream = requestClient.askQuestionStream(askRequest, clientAbort.signal)
        try {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          })
          for await (const event of stream) {
            res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
          }
          res.end()
        } finally {
          clientAbort.dispose()
        }
        return
      }

      if (relative === '/qa/sessions') {
        const query = parseQuery(url.toString())
        const limit = query.limit ? parseInt(query.limit, 10) : undefined
        await writeJSON(res, await requestClient.listQASessions(limit))
        return
      }

      if (relative === '/qa/readiness') {
        const query = parseQuery(url.toString())
        const collectionIds = query.collection_ids
          ? query.collection_ids.split(',').map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n))
          : undefined
        await writeJSON(res, await requestClient.getQAReadiness(collectionIds))
        return
      }

      if (relative === '/knowledges') {
        const query = parseQuery(url.toString())
        const keyword = query.keyword
        const limit = query.limit ? parseInt(query.limit, 10) : undefined
        await writeJSON(res, await requestClient.listKnowledgeCollections(keyword, limit))
        return
      }

      // /knowledges/:id
      if (relative.startsWith('/knowledges/') && relative.split('/').length === 3) {
        const idStr = relative.split('/')[2]
        if (idStr === undefined) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid knowledge document id' }))
          return
        }
        const id = parseInt(idStr, 10)
        if (Number.isNaN(id) || id <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid knowledge document id' }))
          return
        }
        await writeJSON(res, await requestClient.getKnowledgeDocument(id))
        return
      }

      // Fallback: 404
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    } catch (error) {
      if (res.headersSent) { res.destroy(); return }
      await writeJSON(res, { error: error instanceof Error ? error.message : String(error) }, 502)
    }
  } }
  ctx.effect(() => ctx.webServer.register(route), 'yuanshu-gateway: route')
}

async function writeJSON(res: ServerResponse, value: unknown, status = 200): Promise<void> {
  const output = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(output)
}
