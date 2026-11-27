/** 资料库本地工作区路径校验：所有写操作都必须落在已确认的会话工作区根目录内。 */
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** 工作区请求错误：携带 HTTP 状态码，由路由层原样回给客户端。 */
export class WorkspacePathError extends Error {
  /**
   * @param message - 面向日志的英文原因。
   * @param status - 建议的 HTTP 状态码。
   */
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'WorkspacePathError'
  }
}

/** 控制字符：文件名里出现即拒绝，避免终端与日志注入。 */
const CONTROL = /[\u0000-\u001f\u007f]/u

/** 允许的最大文件名长度（UTF-8 字节）。 */
const MAX_NAME_BYTES = 255

/** 校验单个条目名：不能为空、不能含路径分隔符或控制字符。 */
export function assertName(name: string): string {
  if (name === '' || name === '.' || name === '..') throw new WorkspacePathError('invalid entry name')
  if (name.includes('/') || name.includes('\\')) throw new WorkspacePathError('entry name must not contain separators')
  if (CONTROL.test(name)) throw new WorkspacePathError('entry name contains control characters')
  if (Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) throw new WorkspacePathError('entry name too long')
  return name
}

/** 把工作区相对路径拆成合法段：拒绝绝对路径、反斜杠、空段与 `..`。 */
export function relativeSegments(relative: string): readonly string[] {
  if (relative === '') return []
  if (relative.startsWith('/') || isAbsolute(relative)) throw new WorkspacePathError('path must be relative')
  if (relative.includes('\\')) throw new WorkspacePathError('path must use forward slashes')
  if (CONTROL.test(relative)) throw new WorkspacePathError('path contains control characters')
  const segments = relative.split('/')
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') throw new WorkspacePathError('invalid path segment')
  }
  return segments
}

/** 判断 `child` 是否等于 `parent` 或位于其下。 */
export function inside(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
}

/** 在根目录内拼出目标路径，并做字面量越界检查。 */
export function resolveInside(root: string, segments: readonly string[]): string {
  const target = resolve(root, ...segments)
  if (!inside(root, target)) throw new WorkspacePathError('path escapes the workspace', 403)
  return target
}

/**
 * 把客户端声明的工作区根解析成真实路径。
 * @param claimed - 客户端传入的绝对路径。
 * @returns 解析符号链接后的目录路径。
 */
export async function realWorkspaceRoot(claimed: string): Promise<string> {
  if (claimed === '' || !isAbsolute(claimed)) throw new WorkspacePathError('workspace root must be absolute')
  const resolved = await realpath(claimed).catch(() => {
    throw new WorkspacePathError('workspace root not found', 404)
  })
  const info = await stat(resolved).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new WorkspacePathError('workspace root is not a directory')
  return resolved
}

/**
 * 解析一个已存在的条目，并确认它没有通过符号链接逃出工作区。
 * @param rootReal - 真实工作区根。
 * @param relative - 工作区相对路径。
 */
export async function resolveExisting(rootReal: string, relative: string): Promise<string> {
  const candidate = resolveInside(rootReal, relativeSegments(relative))
  const resolved = await realpath(candidate).catch(() => {
    throw new WorkspacePathError('entry not found', 404)
  })
  if (!inside(rootReal, resolved)) throw new WorkspacePathError('entry resolves outside the workspace', 403)
  return resolved
}

/** 解析一个已存在的目录。 */
export async function resolveDirectory(rootReal: string, relative: string): Promise<string> {
  const resolved = await resolveExisting(rootReal, relative)
  const info = await stat(resolved)
  if (!info.isDirectory()) throw new WorkspacePathError('target is not a directory')
  return resolved
}

/** 解析待创建条目的绝对路径：父目录必须已存在且在工作区内。 */
export async function resolveNewEntry(rootReal: string, directory: string, name: string): Promise<string> {
  const parent = await resolveDirectory(rootReal, directory)
  return join(parent, assertName(name))
}
