/** 本地待办的 HTTP 投影端点：列表、新增、修改、删除。 */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { normalizeTodoDueAt, normalizeTodoNote, normalizeTodoTitle, type TodoPatch } from './model.ts'
import type { TodoStore } from './store.ts'

/** 路由前缀。 */
const BASE = '/yuanshu-workbench/todos'

/** 请求体上限，避免误传大文件。 */
const BODY_LIMIT = 64 * 1024

/**
 * 注册待办端点；与工作台其它投影端点一致，要求 Bearer 头，写操作校验同源。
 * @param scope - 已注入 webServer 的上下文。
 * @param store - 本地待办存储。
 */
export function registerTodoRoutes(scope: Context, store: TodoStore): void {
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
      const id = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.slice(BASE.length)).replace(/^\//u, '')
      try {
        if (req.method === 'GET' && id === '') {
          send(200, { data: await store.list() })
          return
        }
        if (req.method === 'POST' && id === '') {
          const body = await readJson(req)
          send(200, {
            data: await store.add({
              title: normalizeTodoTitle(body.title),
              dueAt: normalizeTodoDueAt(body.dueAt),
              note: normalizeTodoNote(body.note),
            }),
          })
          return
        }
        if (req.method === 'PATCH' && id !== '') {
          const body = await readJson(req)
          const patch: TodoPatch & { reminded?: boolean } = {
            ...(body.title === undefined ? {} : { title: normalizeTodoTitle(body.title) }),
            ...(body.dueAt === undefined ? {} : { dueAt: normalizeTodoDueAt(body.dueAt) }),
            ...(body.note === undefined ? {} : { note: normalizeTodoNote(body.note) }),
            ...(typeof body.done === 'boolean' ? { done: body.done } : {}),
            ...(body.reminded === true ? { reminded: true } : {}),
          }
          const item = await store.update(id, patch)
          send(item === undefined ? 404 : 200, item === undefined ? undefined : { data: item })
          return
        }
        if (req.method === 'DELETE' && id !== '') {
          send(await store.remove(id) ? 200 : 404)
          return
        }
        send(405)
      } catch (error) {
        send(400, { error: error instanceof Error ? error.message : '待办操作失败' })
      }
    },
  }), 'yuanshu: local todos')
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
