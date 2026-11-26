/** 资料库工作区 HTTP 处理：校验会话根、执行本地文件操作、转发文件字节流。 */
import { createReadStream, createWriteStream } from 'node:fs'
import { stat, unlink } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { basename } from 'node:path'
import { WorkspacePathError, realWorkspaceRoot, resolveExisting, resolveNewEntry } from './workspace-paths.ts'
import { runWorkspaceCommand, type WorkspaceCommand } from './workspace-ops.ts'
import { workspaceRoute, type WorkspaceAction } from './workspace-route.ts'

/** JSON 写请求体上限（字节）：只含路径与名称。 */
const JSON_MAX_BYTES = 64 * 1024

/** 单次上传上限（字节）：超过即中止并删除半成品。 */
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024

/** 宿主提供给工作区处理的依赖：会话根解析与日志。 */
export interface WorkspaceHostServices {
  /** 按会话 ID 解析其工作区根；会话不存在时返回 undefined。 */
  readonly scopeOf: (sessionId: string) => Promise<{ readonly workspaceRoot: string } | undefined>
  /** 记录失败原因，不向客户端泄露内部细节。 */
  readonly warn: (message: string, cause: unknown) => void
}

/** 判断 JSON 解析结果是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 工作区请求公共字段。 */
interface WorkspaceFields {
  readonly session: string
  readonly root: string
  readonly directory: string
  readonly name: string
  readonly path: string
  readonly source: string
  readonly sources: readonly string[]
  readonly target: string
}

/** 回 JSON 响应。 */
function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = new TextEncoder().encode(JSON.stringify(body))
  res.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.byteLength),
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

/** 读取 JSON 请求体，超出上限或格式不合法时抛出 400。 */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > JSON_MAX_BYTES) throw new WorkspacePathError('request body too large', 413)
    chunks.push(buffer)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new WorkspacePathError('invalid JSON body')
  }
  if (!isRecord(parsed)) throw new WorkspacePathError('invalid JSON body')
  return parsed
}

/** 取字符串字段，缺省为空串。 */
function textField(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/** 解析并校验请求字段。 */
function fieldsOf(source: Record<string, unknown>): WorkspaceFields {
  const session = textField(source, 'session')
  const root = textField(source, 'root')
  if (session === '' || root === '') throw new WorkspacePathError('session and root are required')
  const sources = Array.isArray(source.sources)
    ? source.sources.filter((item): item is string => typeof item === 'string' && item !== '')
    : []
  return {
    session,
    root,
    directory: textField(source, 'directory'),
    name: textField(source, 'name'),
    path: textField(source, 'path'),
    source: textField(source, 'source'),
    sources,
    target: textField(source, 'target'),
  }
}

/** 按动作构造工作区写命令。 */
function commandOf(action: WorkspaceAction, fields: WorkspaceFields): WorkspaceCommand {
  const sources = fields.sources
  switch (action) {
    case 'mkdir':
      if (fields.name === '') throw new WorkspacePathError('name is required')
      return { action, directory: fields.directory, name: fields.name }
    case 'rename':
      if (fields.source === '' || fields.name === '') throw new WorkspacePathError('source and name are required')
      return { action, source: fields.source, name: fields.name }
    case 'move':
    case 'copy':
      if (sources.length === 0) throw new WorkspacePathError('sources are required')
      return { action, sources, target: fields.target }
    case 'delete':
      if (sources.length === 0) throw new WorkspacePathError('sources are required')
      return { action, sources }
    default:
      throw new WorkspacePathError('unsupported command')
  }
}

/** 把文件系统错误映射为面向客户端的错误响应。 */
function failure(error: unknown): { readonly status: number; readonly message: string } {
  if (error instanceof WorkspacePathError) return { status: error.status, message: error.message }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    switch (error.code) {
      case 'EEXIST':
        return { status: 409, message: 'entry already exists' }
      case 'ENOENT':
        return { status: 404, message: 'entry not found' }
      case 'EACCES':
      case 'EPERM':
        return { status: 403, message: 'permission denied' }
      case 'ENOTDIR':
        return { status: 400, message: 'not a directory' }
      case 'EISDIR':
        return { status: 400, message: 'target is a directory' }
      case 'ENOTEMPTY':
        return { status: 409, message: 'directory is not empty' }
      default:
        break
    }
  }
  return { status: 500, message: 'workspace operation failed' }
}

/** 上传：把请求字节流写入新文件，超限即中止并清理半成品。 */
async function handleUpload(
  req: IncomingMessage,
  res: ServerResponse,
  rootReal: string,
  fields: WorkspaceFields,
): Promise<void> {
  if (fields.name === '') throw new WorkspacePathError('name is required')
  const target = await resolveNewEntry(rootReal, fields.directory, fields.name)
  let bytes = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength
      if (bytes > UPLOAD_MAX_BYTES) {
        callback(new WorkspacePathError('upload too large', 413))
        return
      }
      callback(null, chunk)
    },
  })
  try {
    await pipeline(req, limiter, createWriteStream(target, { flags: 'wx' }))
  } catch (error: unknown) {
    await unlink(target).catch(() => undefined)
    throw error
  }
  json(res, 200, { ok: true, name: fields.name, size: bytes })
}

/** 下载：把工作区文件按附件流式回给客户端。 */
async function handleDownload(
  res: ServerResponse,
  rootReal: string,
  fields: WorkspaceFields,
): Promise<void> {
  const target = await resolveExisting(rootReal, fields.path)
  const info = await stat(target)
  if (!info.isFile()) throw new WorkspacePathError('target is not a file')
  res.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'application/octet-stream',
    'content-length': String(info.size),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(basename(target))}`,
    'x-content-type-options': 'nosniff',
  })
  await pipeline(createReadStream(target), res)
}

/** 属性：返回条目的名称、类型、大小与修改时间。 */
async function handleStat(res: ServerResponse, rootReal: string, fields: WorkspaceFields): Promise<void> {
  const target = await resolveExisting(rootReal, fields.path)
  const info = await stat(target)
  json(res, 200, {
    name: basename(target),
    type: info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other',
    size: info.isFile() ? info.size : 0,
    modifiedAt: info.mtime.toISOString(),
  })
}

/**
 * 处理一条工作区请求。
 * @param req - 同源请求。
 * @param res - 响应对象。
 * @param services - 会话根解析能力与日志。
 */
export async function handleWorkspaceRequest(
  req: IncomingMessage,
  res: ServerResponse,
  services: WorkspaceHostServices,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const route = workspaceRoute(url.pathname, req.method ?? 'GET')
  if (route === undefined) {
    json(res, 404, { error: 'not found' })
    return
  }
  if (route.type === 'method') {
    res.writeHead(405, { allow: route.allow, 'cache-control': 'no-store' })
    res.end()
    return
  }
  try {
    const source = route.method === 'GET' || route.action === 'upload'
      ? Object.fromEntries(url.searchParams.entries())
      : await readJson(req)
    const fields = fieldsOf(source)
    const scope = await services.scopeOf(fields.session)
    if (scope === undefined) throw new WorkspacePathError('session workspace not found', 404)
    const rootReal = await realWorkspaceRoot(fields.root)
    const declared = await realWorkspaceRoot(scope.workspaceRoot)
    if (rootReal !== declared) throw new WorkspacePathError('root is not the session workspace', 403)
    switch (route.action) {
      case 'upload':
        await handleUpload(req, res, rootReal, fields)
        return
      case 'download':
        await handleDownload(res, rootReal, fields)
        return
      case 'stat':
        await handleStat(res, rootReal, fields)
        return
      default:
        json(res, 200, { ok: true, ...await runWorkspaceCommand(rootReal, commandOf(route.action, fields)) })
    }
  } catch (error: unknown) {
    const mapped = failure(error)
    services.warn('YuanShu doclib workspace request failed', error)
    if (!res.headersSent) json(res, mapped.status, { error: mapped.message })
  }
}
