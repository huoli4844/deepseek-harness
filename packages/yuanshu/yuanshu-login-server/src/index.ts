/**
 * @deepseek-ai/dsh-yuanshu-login-server — serves the YuanShu login page.
 *
 * Routes:
 *   /login              → serves the Vue login page
 *   /yuanshu-token      → issues an authenticated Harness app URL
 *   /login-assets/*     → serves static JS/CSS/favicon from the login dist
 *
 * The login page authenticates directly against the YuanShu backend
 * at the configured API base URL. On success it stores the token in
 * localStorage, proves that token to /yuanshu-token, and follows the returned
 * Harness URL. A browser that already holds a Harness session needs no proof.
 * The URL handoff rejects requests that carry neither credential.
 *
 * The / path is NOT registered here — it is handled by the fallback seat
 * (frontend-static) which checks DSH browser authentication. Unauthenticated
 * users are redirected to /login by BrowserAuth.
 */

import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import type { WebEntryUrl } from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-web-app'

export const name = 'yuanshu-login-server'
export const inject = ['webServer', 'connection', 'connection.authentication', 'webApp']

/** Login asset directory and YuanShu authentication endpoint. */
export interface Config {
  /** Path to the built login dist directory. Resolved automatically if not set. */
  readonly loginDist?: string
  /** Base URL of the YuanShu backend for the login page to call. */
  readonly yuanshuApiUrl: string
}

export const Config: z<Config> = z.object({
  loginDist: z.string(),
  yuanshuApiUrl: z.string().default('http://localhost:8081'),
})

const LOGIN_PATH = '/login'
/** 登录页同源 API 前缀：桌面端 dsh-app:// 源不在后台 CORS 白名单内，必须经宿主转发。 */
const API_PROXY_PREFIX = '/yuanshu-api'
/** 登录页转发请求体上限。 */
const API_PROXY_BODY_LIMIT = 1_048_576
const YUANSHU_TOKEN_PATH = '/yuanshu-token'
const YUANSHU_TENANTS_PATH = '/api/v1/user/tenants'
const TOKEN_PROOF_TIMEOUT_MS = 5000
/** 浏览器端身份入口的接管标记，供 ui-settings-account 让出 single launcher。 */
const EXTERNAL_IDENTITY_GLOBAL = '__DSH_EXTERNAL_IDENTITY__'

/** Extract a bearer credential from an Authorization header. */
function bearerToken(header: string | readonly string[] | undefined): string | undefined {
  const raw: unknown = Array.isArray(header) ? header[0] : header
  if (typeof raw !== 'string') return undefined
  const matched = /^Bearer\s+(\S+)$/iu.exec(raw.trim())
  return matched?.[1]
}

/**
 * Prove a YuanShu token against the backend before disclosing a Harness URL.
 * The tenants endpoint is authenticated and available to every signed-in user;
 * only a 2xx reply counts as proof.
 */
async function verifyYuanshuToken(apiUrl: string, token: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/u, '')}${YUANSHU_TENANTS_PATH}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TOKEN_PROOF_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

/** Resolve the login dist path if not configured. */
function resolveLoginDist(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@deepseek-ai/yuanshu-login/package.json')), 'dist')
}

const MIME_TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  ico: 'image/x-icon',
  json: 'application/json',
  html: 'text/html; charset=utf-8',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  webmanifest: 'application/manifest+json',
}

/** 读取登录页转发的请求体；超过上限返回 undefined。 */
async function readProxyBody(req: IncomingMessage): Promise<Buffer<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false }) as AsyncIterableIterator<string | Uint8Array>) {
    const bytes = Buffer.from(chunk)
    size += bytes.byteLength
    if (size > API_PROXY_BODY_LIMIT) return undefined
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size) as Buffer<ArrayBuffer>
}

/** 把登录页的 /yuanshu-api/api/v1/* 请求转发到元枢后台，避免桌面端跨域限制。 */
async function proxyYuanshuApi(req: IncomingMessage, res: ServerResponse, apiUrl: string): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  const upstreamPath = url.pathname.slice(API_PROXY_PREFIX.length)
  if (!upstreamPath.startsWith('/api/v1/')) {
    res.writeHead(404, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  const method = req.method ?? 'GET'
  const headers: Record<string, string> = { accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json' }
  for (const key of ['content-type', 'authorization', 'x-active-tenant'] as const) {
    const value = req.headers[key]
    if (typeof value === 'string' && value !== '') headers[key] = value
  }
  let body: Buffer<ArrayBuffer> | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readProxyBody(req)
    if (body === undefined) {
      res.writeHead(413, { 'cache-control': 'no-store' })
      res.end()
      return
    }
  }
  try {
    const response = await fetch(`${apiUrl.replace(/\/+$/u, '')}${upstreamPath}${url.search}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    })
    const payload = Buffer.from(await response.arrayBuffer())
    res.writeHead(response.status, {
      'cache-control': 'no-store',
      'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
    })
    res.end(payload)
  } catch {
    res.writeHead(502, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
    res.end('{"code":502,"message":"元枢登录服务暂不可用"}')
  }
}

function serveRequest(req: IncomingMessage, res: ServerResponse, distRoot: string): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname

  // Login page
  if (pathname === LOGIN_PATH || pathname === LOGIN_PATH + '/') {
    try {
      let html = readFileSync(join(distRoot, 'index.html'), 'utf-8')
      // Inject the YuanShu API URL for the login page. The replacement must
      // close the script tag: the original <script ... src> tag stays intact
      // after it and must not lose its opening attributes.
      html = html.replace(
        '<script type="module"',
        `<script type="module">window.__YUANSHU_API_URL__ = ${JSON.stringify(API_PROXY_PREFIX)};</script>`
          + '<script type="module"',
      )
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Login page not found')
    }
    return
  }

  // Static assets (JS, CSS, images, etc.)
  const ext = pathname.split('.').pop() ?? ''
  const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream'

  try {
    const filePath = join(distRoot, pathname.slice(1))
    const st = statSync(filePath)
    if (!st.isFile()) {
      res.writeHead(404)
      res.end()
      return
    }
    const content = readFileSync(filePath)
    res.writeHead(200, { 'content-type': mimeType })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end()
  }
}

export function apply(ctx: Context, config: Config): void {
  const distRoot = config.loginDist ?? resolveLoginDist()
  const yuanshuApiUrl = config.yuanshuApiUrl

  // YuanShu is the only identity in this deployment. Publishing the marker in
  // the page index lets the DeepSeek account plugin keep its settings surfaces
  // while yielding the single sidebar launcher slot to the YuanShu plugin.
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: EXTERNAL_IDENTITY_GLOBAL, value: { accountLauncher: true } })
  })

  const unauthenticated = (req: IncomingMessage): boolean => {
    const admission = ctx.connection.admit({ headers: req.headers })
    return 'rejection' in admission && admission.rejection === 401
  }
  ctx.on('webserver/request', async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://dsh.invalid')
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')
      && !url.searchParams.has('token')
      && unauthenticated(req)) {
      res.writeHead(303, { location: '/login', 'cache-control': 'no-store' })
      res.end()
      return
    }
    await next()
  })

  // Serve the login page at /login
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PATH,
    auth: 'anonymous',
    handler: (req, res) => { serveRequest(req, res, distRoot) },
  }), 'yuanshu-login-server: login page')

  // 登录页 API 同源转发：桌面端渲染进程源为 dsh-app://app，云端 CORS 不放行。
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_PROXY_PREFIX,
    auth: 'anonymous',
    handler: (req, res) => proxyYuanshuApi(req, res, yuanshuApiUrl),
  }), 'yuanshu-login-server: api proxy')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: YUANSHU_TOKEN_PATH,
    auth: 'anonymous',
    handler: async (req, res) => {
      const admission = ctx.connection.admit({ headers: req.headers })
      const rejection = 'rejection' in admission ? admission.rejection : undefined
      // 403 means the Host/Origin fence rejected the request outright; only an
      // authentication miss (401) may fall back to a YuanShu token proof.
      if (rejection !== undefined && rejection !== 401) {
        res.writeHead(rejection, { 'cache-control': 'no-store' })
        res.end()
        return
      }
      if (rejection === 401) {
        const token = bearerToken(req.headers.authorization)
        if (token === undefined || !(await verifyYuanshuToken(yuanshuApiUrl, token))) {
          res.writeHead(401, { 'cache-control': 'no-store' })
          res.end()
          return
        }
      }
      const entries: WebEntryUrl[] = []
      ctx.emit(ctx.webServer, 'webserver/entry-url', ctx.webApp.getAdvertisedUrl(), entries)
      const entry = entries.find(entry => entry.open)
      if (entry === undefined) {
        res.writeHead(503, { 'cache-control': 'no-store' })
        res.end()
        return
      }
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ url: entry.url }))
    },
  }), 'yuanshu-login-server: browser authentication handoff')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/favicon.svg',
    auth: 'anonymous',
    handler: (_req, res) => {
      try {
        const content = readFileSync(join(distRoot, 'favicon.svg'))
        res.writeHead(200, { 'content-type': 'image/svg+xml' })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end()
      }
    },
  }), 'yuanshu-login-server: favicon')

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/login-assets',
    auth: 'anonymous',
    handler: (req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const relativePath = pathname.slice('/login-assets/'.length)
      const ext = relativePath.split('.').pop() ?? ''
      const mimeType = MIME_TYPES[ext] ?? 'application/octet-stream'
      try {
        const filePath = join(distRoot, relativePath)
        const st = statSync(filePath)
        if (!st.isFile()) {
          res.writeHead(404)
          res.end()
          return
        }
        const content = readFileSync(filePath)
        res.writeHead(200, { 'content-type': mimeType })
        res.end(content)
      } catch {
        res.writeHead(404)
        res.end()
      }
    },
  }), 'yuanshu-login-server: assets')
}
