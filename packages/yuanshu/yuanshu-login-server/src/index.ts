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
import { fileURLToPath } from 'node:url'
import { readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-web-app'

export const name = 'yuanshu-login-server'
export const inject = ['webServer', 'connection', 'webApp']

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
const YUANSHU_TOKEN_PATH = '/yuanshu-token'
const YUANSHU_TENANTS_PATH = '/api/v1/user/tenants'
const TOKEN_PROOF_TIMEOUT_MS = 5000
/** 浏览器端身份入口的接管标记，供 ui-settings-account 让出 single launcher。 */
const EXTERNAL_IDENTITY_GLOBAL = '__DSH_EXTERNAL_IDENTITY__'

/** Extract a bearer credential from an Authorization header. */
function bearerToken(header: string | readonly string[] | undefined): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header
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
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', '..', '..', 'apps', 'yuanshu-login', 'dist')
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

function serveRequest(req: IncomingMessage, res: ServerResponse, distRoot: string, yuanshuApiUrl: string): void {
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
        `<script type="module">window.__YUANSHU_API_URL__ = ${JSON.stringify(yuanshuApiUrl)};</script>`
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

  // Serve the login page at /login
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PATH,
    handler: (req, res) => serveRequest(req, res, distRoot, yuanshuApiUrl),
  }), 'yuanshu-login-server: login page')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: YUANSHU_TOKEN_PATH,
    handler: async (req, res) => {
      const rejection = ctx.connection.requestRejection({ headers: req.headers })
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
      res.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ url: ctx.connection.authenticatedUrl(ctx.webApp.getAdvertisedUrl()) }))
    },
  }), 'yuanshu-login-server: browser authentication handoff')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/favicon.svg',
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
