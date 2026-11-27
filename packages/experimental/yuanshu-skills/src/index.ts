/** 技能市场宿主注册：把元枢技能接口代理到同源路径，前端只访问本地路由。 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { skillsProxyRoute } from './skills-proxy.ts'
import z from '@deepseek-ai/schemastery'

/** 稳定插件名，供 Loader 与补丁文件引用。 */
export const name = 'yuanshu-skills'

/** 技能市场插件配置。 */
export interface Config {
  /** 元枢后台 API 基地址。 */
  apiUrl: string
}

/** 配置校验与默认值。 */
export const Config: z<Config> = z.object({
  apiUrl: z.string().default('http://localhost:8081'),
})

/** 上游查询与写请求超时（毫秒）。 */
const UPSTREAM_TIMEOUT_MS = 30_000

/** 技能包上传超时（毫秒）：安装包按流传输。 */
const UPLOAD_TIMEOUT_MS = 10 * 60_000

/** JSON 写请求体上限（字节）：安装来源只含少量字段。 */
const JSON_MAX_BYTES = 256 * 1024

/** 读取请求体，超出上限直接返回 undefined 由调用方拒绝。 */
async function readBody(req: IncomingMessage, limit: number): Promise<string | undefined> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > limit) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 流式转发所需的 Node 扩展字段。 */
type StreamingInit = RequestInit & { readonly duplex?: 'half' }

/**
 * 转发技能市场请求到元枢后台。
 * 读取与二进制下载为 GET；安装来源为 JSON 写；导入包按字节流转发。
 */
async function proxySkillsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  api: string,
  authorization: string,
  activeTenant: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost')
  const method = req.method ?? 'GET'
  const decision = skillsProxyRoute(incoming.pathname, method)
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
  const headers: Record<string, string> = { authorization, accept: '*/*' }
  if (activeTenant !== undefined && activeTenant !== '') headers['X-Active-Tenant'] = activeTenant
  let payload: BodyInit | undefined
  if (decision.type === 'write') {
    const body = await readBody(req, JSON_MAX_BYTES)
    if (body === undefined) {
      res.writeHead(413, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    payload = body
    headers['content-type'] = 'application/json'
  } else if (decision.type === 'upload') {
    const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined
    if (contentType !== undefined) headers['content-type'] = contentType
    const length = req.headers['content-length']
    if (typeof length === 'string') headers['content-length'] = length
    payload = Readable.toWeb(req) as unknown as BodyInit
  }
  const remote = new URL(`${api}${decision.remote}`)
  remote.search = incoming.search
  const init: StreamingInit = {
    method,
    headers,
    signal,
    redirect: 'error',
    ...(payload === undefined ? {} : { body: payload }),
    ...(decision.type === 'upload' ? { duplex: 'half' } : {}),
  }
  const response = await fetch(remote, init)
  if (decision.type === 'binary') {
    // 技能包下载：透传字节流、内容类型与文件名。
    const bytes = await response.arrayBuffer()
    const disposition = response.headers.get('content-disposition')
    res.writeHead(response.status, {
      'cache-control': 'no-store',
      'content-length': String(bytes.byteLength),
      'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      ...(disposition === null ? {} : { 'content-disposition': disposition }),
    })
    res.end(new Uint8Array(bytes))
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
 * 注册技能市场同源代理。
 * @param ctx - 插件上下文。
 * @param config - 元枢后台 API 基地址。
 */
export function apply(ctx: Context, config: Config): void {
  const api = config.apiUrl.replace(/\/+$/u, '')
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: '/yuanshu-skills',
      auth: 'required',
      async handler(req, res) {
        const authorization = req.headers.authorization
        if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
          res.writeHead(401, { 'cache-control': 'no-store' })
          res.end()
          return
        }
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        const isUpload = pathname === '/yuanshu-skills/skills/import-package'
        const lifetime = new AbortController()
        const close = () => { lifetime.abort() }
        res.once('close', close)
        try {
          await proxySkillsRequest(
            req,
            res,
            api,
            authorization,
            typeof req.headers['x-active-tenant'] === 'string' ? req.headers['x-active-tenant'] : undefined,
            AbortSignal.any([
              lifetime.signal,
              AbortSignal.timeout(isUpload ? UPLOAD_TIMEOUT_MS : UPSTREAM_TIMEOUT_MS),
            ]),
          )
        } catch (error) {
          if (!lifetime.signal.aborted && !res.headersSent) {
            scope.logger.warn('YuanShu skills API unavailable', error instanceof Error ? error.name : 'unknown error')
            res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'YuanShu skills API unavailable' }))
          }
        } finally {
          res.off('close', close)
        }
      },
    }), 'yuanshu-skills: API')
  })
}
