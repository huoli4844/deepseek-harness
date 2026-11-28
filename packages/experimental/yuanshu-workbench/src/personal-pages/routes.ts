/** 个人页配置的 HTTP 投影端点：按账号读写本机固定目录中的页面定义。 */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { PersonalPageStore } from './store.ts'

/** 路由前缀。 */
const BASE = '/yuanshu-workbench/personal-pages'

/** 请求体上限，与存储层文件上限一致。 */
const BODY_LIMIT = 256 * 1024

/**
 * 注册个人页配置端点；与待办端点一致，要求 Bearer 头，写操作校验同源。
 * @param scope - 已注入 webServer 的上下文。
 * @param store - 本机个人页配置存储。
 */
export function registerPersonalPageRoutes(scope: Context, store: PersonalPageStore): void {
  scope.effect(() => scope.webServer.register({
    kind: 'prefix',
    path: BASE,
    auth: 'required',
    async handler(req, res) {
      const send = (status: number, payload?: object): void => {
        res.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json' })
        res.end(payload === undefined ? undefined : JSON.stringify(payload))
      }
      const authorization = req.headers.authorization
      if (authorization === undefined || !/^Bearer [^\s]+$/u.test(authorization)) {
        send(401)
        return
      }
      if (req.method !== 'GET' && req.headers['sec-fetch-site'] !== 'same-origin') {
        send(403)
        return
      }
      const account = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(BASE.length)).replace(/^\//u, '')
      try {
        if (req.method === 'GET' && account !== '') {
          const pages = await store.read(account)
          // data 为 null 表示本机还没有该账号的配置文件，由客户端决定是否迁移旧数据。
          send(200, { data: pages ?? null })
          return
        }
        if (req.method === 'PUT' && account !== '') {
          const body = await readJson(req)
          const pages = body.pages
          if (!Array.isArray(pages) || pages.some(item => typeof item !== 'object' || item === null)) {
            send(400, { error: '页面定义格式不正确' })
            return
          }
          await store.write(account, pages)
          send(200, { data: pages })
          return
        }
        send(405)
      } catch (error) {
        send(400, { error: error instanceof Error ? error.message : '个人页配置操作失败' })
      }
    },
  }), 'yuanshu: personal page storage')
}

/**
 * 读取并解析 JSON 请求体。
 * @param req - 入站请求。
 * @returns 解析后的对象；空体返回空对象。
 */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new Error('请求内容过大')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('请求格式不正确')
  return parsed as Record<string, unknown>
}
