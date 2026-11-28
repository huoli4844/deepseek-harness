/** 技能包端点：清单、下载、安装到本机技能目录、上传到元枢后台。 */
import type { IncomingMessage } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { installSkillArchive, isSkillName, SkillInstallError } from './install.ts'
import { packageSkillDirectory } from './local.ts'
import { deleteSkillPackage, fetchSkillArchive, listSkillPackages, SkillStoreError, uploadSkillPackage } from './source.ts'

/** 路由前缀。 */
const BASE = '/yuanshu-workbench/skill-store'

/** 上传请求体上限，与技能包上限一致。 */
const BODY_LIMIT = 20 * 1024 * 1024

/** JSON 请求体上限，本机技能上传只提交名称。 */
const JSON_LIMIT = 64 * 1024

/** 技能标识只允许正整数，避免拼进后台地址时引入路径片段。 */
const SKILL_ID = /^[1-9][0-9]{0,18}$/u

/** 技能包路由依赖的后台配置。 */
export interface SkillStoreOptions {
  /** 元枢后台地址，不含末尾斜杠。 */
  readonly api: string
  /** 本机技能根目录；缺省为 $DSH_HOME/skills。 */
  readonly skillsRoot?: string | undefined
  /** 工作台随包分发的技能目录，用于上传平台内置技能。 */
  readonly bundledSkillsRoot?: string | undefined
}

/**
 * 解析本机技能根目录：优先 DSH_HOME，其次用户目录下的 .dsh。
 * @returns 技能根目录绝对路径。
 */
function resolveSkillsRoot(): string {
  const configured = process.env.DSH_HOME?.trim()
  return join(configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured, 'skills')
}

/**
 * 读取上传的原始字节。
 * @param req - 入站请求。
 * @returns 请求体字节。
 */
async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > BODY_LIMIT) throw new SkillStoreError(413, '技能包超过 20MB，无法上传')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

/**
 * 读取并解析小型 JSON 请求体。
 * @param req - 入站请求。
 * @returns 解析后的对象；空体返回空对象。
 */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > JSON_LIMIT) throw new SkillStoreError(413, '请求内容过大')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (_invalidJson) {
    throw new SkillStoreError(400, '请求格式不正确')
  }
  return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
}

/**
 * 在本机技能根目录中定位同名技能。
 * @param name - 已校验的技能名。
 * @param roots - 候选根目录，按优先级排列。
 * @returns 技能目录绝对路径；未找到时返回 undefined。
 */
function resolveLocalSkill(name: string, roots: readonly (string | undefined)[]): string | undefined {
  for (const root of roots) {
    if (root === undefined) continue
    const dir = join(root, name)
    if (existsSync(join(dir, 'SKILL.md'))) return dir
  }
  return undefined
}

/**
 * 生成下载文件名：优先使用技能名，剔除不安全字符。
 * @param name - 查询参数提供的技能名。
 * @param id - 技能标识。
 * @returns 以 .zip 结尾的文件名。
 */
function archiveFileName(name: string | null, id: string): string {
  const cleaned = (name ?? '').replace(/[^A-Za-z0-9._-]/gu, '').slice(0, 80)
  return cleaned.endsWith('.zip') ? cleaned : `${cleaned === '' ? `skill-${id}` : cleaned}.zip`
}

/**
 * 从请求头读取并解码上传文件名。
 * @param value - x-skill-file-name 头。
 * @returns 解码后的文件名；缺失时返回默认名。
 */
function uploadFileName(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === '') return 'skill-package.zip'
  try {
    return decodeURIComponent(raw)
  } catch (_invalidEncoding) {
    return 'skill-package.zip'
  }
}

/**
 * 注册技能包端点：清单与下载走 GET，安装与上传走 POST 且要求同源。
 * @param scope - 已注入 webServer 的上下文。
 * @param options - 后台地址与本机技能根目录。
 */
export function registerSkillStoreRoutes(scope: Context, options: SkillStoreOptions): void {
  const skillsRoot = options.skillsRoot ?? resolveSkillsRoot()
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
      const tenant = req.headers['x-active-tenant']
      const auth = {
        api: options.api,
        authorization,
        tenant: typeof tenant === 'string' ? tenant : undefined,
      }
      const incoming = new URL(req.url ?? '/', 'http://localhost')
      const rest = incoming.pathname.slice(BASE.length).replace(/^\//u, '')
      try {
        if (req.method === 'GET' && rest === '') {
          send(200, { data: await listSkillPackages(auth) })
          return
        }
        if (req.method === 'GET' && rest.endsWith('/download')) {
          const id = rest.slice(0, -'/download'.length)
          if (!SKILL_ID.test(id)) {
            send(400, { error: '技能标识不合法' })
            return
          }
          const bytes = await fetchSkillArchive(auth, id)
          const fileName = archiveFileName(incoming.searchParams.get('name'), id)
          res.writeHead(200, {
            'cache-control': 'no-store',
            'content-type': 'application/zip',
            'content-length': String(bytes.byteLength),
            'content-disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          })
          res.end(Buffer.from(bytes))
          return
        }
        if (req.method === 'POST' && rest === 'upload') {
          const bytes = await readBody(req)
          const data = await uploadSkillPackage(auth, uploadFileName(req.headers['x-skill-file-name']), bytes)
          send(200, { data: data ?? null })
          return
        }
        if (req.method === 'POST' && rest === 'local/upload') {
          const body = await readJson(req)
          const name = typeof body.name === 'string' ? body.name : ''
          if (!isSkillName(name)) {
            send(400, { error: '技能名称不合法' })
            return
          }
          // 只有元枢平台技能（yuanshu- 前缀）支持上传，通用技能不上传。
          if (!name.startsWith('yuanshu-')) {
            send(400, { error: '只有元枢平台技能支持上传' })
            return
          }
          const dir = resolveLocalSkill(name, [skillsRoot, options.bundledSkillsRoot])
          if (dir === undefined) {
            send(404, { error: '本机没有找到该技能目录' })
            return
          }
          const archive = await packageSkillDirectory(dir)
          const data = await uploadSkillPackage(auth, `${name}.zip`, archive)
          send(200, { data: data ?? null })
          return
        }
        if (req.method === 'POST' && rest.endsWith('/install')) {
          const id = rest.slice(0, -'/install'.length)
          if (!SKILL_ID.test(id)) {
            send(400, { error: '技能标识不合法' })
            return
          }
          const archive = await fetchSkillArchive(auth, id)
          const installed = await installSkillArchive(archive, skillsRoot)
          send(200, { data: installed })
          return
        }
        if (req.method === 'DELETE' && SKILL_ID.test(rest)) {
          await deleteSkillPackage(auth, rest)
          send(200, { data: { id: rest } })
          return
        }
        send(405)
      } catch (error) {
        if (error instanceof SkillStoreError || error instanceof SkillInstallError) {
          send(error.status, { error: error.message })
          return
        }
        scope.logger.warn(`yuanshu: skill store failed: ${error instanceof Error ? error.message : String(error)}`)
        send(502, { error: '技能包操作失败' })
      }
    },
  }), 'yuanshu: skill store routes')
}
