/**
 * @deepseek-ai/dsh-yuanshu-login-server — serves the YuanShu login page.
 *
 * Routes:
 *   /login              → serves the Vue login page
 *   /                   → redirects to /login
 *   /login-assets/*     → serves static JS/CSS/favicon from the login dist
 *
 * The login page authenticates directly against the YuanShu backend
 * at the configured API base URL. On success it stores the token in
 * localStorage and redirects back to / (the DSH web app).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import type {} from '@deepseek-ai/dsh-host-webserver'

export const name = 'yuanshu-login-server'
export const inject = ['webServer']

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

  // Root → redirect to login
  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { 'Location': LOGIN_PATH })
    res.end()
    return
  }

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

  // Serve the login page at /login
  ctx.webServer.register({
    kind: 'exact',
    path: LOGIN_PATH,
    handler: (req, res) => serveRequest(req, res, distRoot, yuanshuApiUrl),
  }, 'yuanshu-login-server: login page')

  ctx.webServer.register({
    kind: 'exact',
    path: '/',
    handler: (_req, res) => {
      res.writeHead(302, { 'Location': LOGIN_PATH })
      res.end()
    },
  }, 'yuanshu-login-server: redirect root to login')

  ctx.webServer.register({
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
  }, 'yuanshu-login-server: favicon')

  ctx.webServer.register({
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
  }, 'yuanshu-login-server: login assets')
}

export default { name, inject, Config, apply }
