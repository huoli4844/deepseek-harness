/** 资料库宿主注册：代理元枢知识库查询与 NAS（外部存储）配置，供客户端同源访问。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { doclibProxyRoute } from './doclib-proxy.ts'
import z from '@deepseek-ai/schemastery'

/** 稳定插件名，供 Loader 与补丁文件引用。 */
export const name = 'yuanshu-doclib'

/** 资料库插件配置。 */
export interface Config {
  /** 元枢后台 API 基地址。 */
  apiUrl: string
}

/** 配置校验与默认值。 */
export const Config: z<Config> = z.object({
  apiUrl: z.string().default('http://localhost:8081'),
})

/** 上游请求超时（毫秒）。 */
const UPSTREAM_TIMEOUT_MS = 30_000

/** 预览字节流上限（字节）：资料库 v1 只预览常规文档，超出即拒绝。 */
const PREVIEW_MAX_BYTES = 64 * 1024 * 1024

/** 配置写入请求体上限（字节）：NAS 配置只含少量字段。 */
const CONFIG_MAX_BYTES = 64 * 1024

/** 读取请求体，超出上限直接返回 undefined 由调用方拒绝。 */
async function readBody(req: IncomingMessage): Promise<string | undefined> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > CONFIG_MAX_BYTES) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * 转发资料库请求到元枢后台。
 * 查询与预览为 GET；NAS 配置为 GET/PUT。JSON 路由统一回 JSON 响应，预览路由透传上游字节流与类型。
 */
async function proxyDoclibRequest(
  req: IncomingMessage,
  res: ServerResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost')
  const method = req.method ?? 'GET'
  const decision = doclibProxyRoute(incoming.pathname, method)
  if (decision === undefined) {
    res.writeHead(404, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  if (decision.type === 'method') {
    res.writeHead(405, { allow: decision.allow, 'cache-control': 'no-store' })
    res.end()
    return
  }
  const remote = new URL(`${api}${decision.remote}`)
  remote.search = incoming.search
  const headers: Record<string, string> = { authorization, accept: '*/*' }
  if (activeTenant !== undefined && activeTenant !== '') headers['X-Active-Tenant'] = activeTenant
  let payload: string | undefined
  if (decision.type === 'write') {
    payload = await readBody(req)
    if (payload === undefined) {
      res.writeHead(413, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    headers['content-type'] = 'application/json'
  }
  const response = await fetch(remote, {
    method,
    headers,
    signal,
    redirect: 'error',
    ...(payload === undefined ? {} : { body: payload }),
  })
  if (decision.type === 'preview') {
    // 原文预览：透传上游字节流与内容类型，客户端据此构造本地预览。
    const payload = await response.arrayBuffer()
    if (payload.byteLength > PREVIEW_MAX_BYTES) {
      res.writeHead(413, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    res.writeHead(response.status, {
      'cache-control': 'no-store',
      'content-length': String(payload.byteLength),
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    res.end(new Uint8Array(payload))
    return
  }
  const result = new Uint8Array(await response.arrayBuffer())
  res.writeHead(response.status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  res.end(result)
}

/**
 * 注册资料库同源代理路由。
 * @param ctx - 插件上下文。
 * @param config - 元枢后台 API 基地址。
 */
export function apply(ctx: Context, config: Config): void {
  const api = config.apiUrl.replace(/\/+$/u, '')
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/yuanshu-doclib',
      auth: 'required',
      async handler(req, res) {
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          res.writeHead(401, { 'cache-control': 'no-store' })
          res.end()
          return
        }
        const lifetime = new AbortController()
        const close = () => { lifetime.abort() }
        res.once('close', close)
        try {
          await proxyDoclibRequest(
            req,
            res,
            api,
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([lifetime.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
          )
        } catch (error) {
          if (!lifetime.signal.aborted && !res.headersSent) {
            scope.logger.warn('YuanShu doclib API unavailable', error instanceof Error ? error.name : 'unknown error')
            res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'YuanShu doclib API unavailable' }))
          }
        } finally {
          res.off('close', close)
        }
      },
    }), 'doclib: knowledge-base API')
  })
}
