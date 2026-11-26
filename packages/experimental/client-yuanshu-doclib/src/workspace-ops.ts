/** 资料库本地文件操作：在已校验的工作区根内执行新建、重命名、移动、复制与删除。 */
import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  WorkspacePathError, assertName, inside, resolveDirectory, resolveExisting, resolveNewEntry,
} from './workspace-paths.ts'

/** 单次工作区写命令；路径全部是工作区相对路径，`''` 表示根目录。 */
export type WorkspaceCommand =
  | { readonly action: 'mkdir'; readonly directory: string; readonly name: string }
  | { readonly action: 'rename'; readonly source: string; readonly name: string }
  | { readonly action: 'move' | 'copy'; readonly sources: readonly string[]; readonly target: string }
  | { readonly action: 'delete'; readonly sources: readonly string[] }

/** 操作结果：成功处理的条目数。 */
export interface WorkspaceCommandResult {
  readonly changed: number
}

/** 条目是否存在；悬空符号链接也算存在，避免覆盖。 */
async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch {
    return false
  }
}

/**
 * 生成同目录复制用的新名称：`报告.docx` → `报告 副本.docx`，重名时追加序号。
 * @param name - 原条目名。
 * @param index - 第几次尝试（从 1 开始）。
 */
export function copyName(name: string, index: number): string {
  const suffix = index <= 1 ? ' 副本' : ` 副本 ${index}`
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return `${name}${suffix}`
  return `${name.slice(0, dot)}${suffix}${name.slice(dot)}`
}

/** 同目录复制时挑选一个不冲突的名称。 */
async function availableCopyPath(directory: string, name: string): Promise<string> {
  for (let index = 1; index < 100; index += 1) {
    const candidate = join(directory, copyName(name, index))
    if (!await exists(candidate)) return candidate
  }
  throw new WorkspacePathError('too many copies in this directory', 409)
}

/** 拒绝把条目移动或复制进它自身。 */
function assertNotIntoItself(source: string, targetDirectory: string): void {
  if (inside(source, targetDirectory)) throw new WorkspacePathError('cannot place an entry inside itself')
}

/**
 * 执行一条工作区写命令。
 * @param rootReal - 已确认的会话工作区真实根路径。
 * @param command - 命令内容。
 * @returns 成功处理的条目数。
 */
export async function runWorkspaceCommand(
  rootReal: string,
  command: WorkspaceCommand,
): Promise<WorkspaceCommandResult> {
  switch (command.action) {
    case 'mkdir': {
      const target = await resolveNewEntry(rootReal, command.directory, command.name)
      if (await exists(target)) throw new WorkspacePathError('entry already exists', 409)
      await mkdir(target)
      return { changed: 1 }
    }
    case 'rename': {
      const source = await resolveExisting(rootReal, command.source)
      if (source === rootReal) throw new WorkspacePathError('cannot rename the workspace root')
      const target = join(dirname(source), assertName(command.name))
      if (target === source) return { changed: 0 }
      if (await exists(target)) throw new WorkspacePathError('entry already exists', 409)
      await rename(source, target)
      return { changed: 1 }
    }
    case 'move':
    case 'copy':
      return command.action === 'move'
        ? moveEntries(rootReal, command.sources, command.target)
        : copyEntries(rootReal, command.sources, command.target)
    case 'delete': {
      let changed = 0
      for (const source of command.sources) {
        const target = await resolveExisting(rootReal, source)
        if (target === rootReal) throw new WorkspacePathError('cannot delete the workspace root')
        await rm(target, { recursive: true, force: false })
        changed += 1
      }
      return { changed }
    }
  }
}

/** 移动条目到目标目录：目标已存在时拒绝；跨卷时退化为复制后删除。 */
async function moveEntries(
  rootReal: string,
  sources: readonly string[],
  target: string,
): Promise<WorkspaceCommandResult> {
  const directory = await resolveDirectory(rootReal, target)
  let changed = 0
  for (const source of sources) {
    const from = await resolveExisting(rootReal, source)
    if (from === rootReal) throw new WorkspacePathError('cannot move the workspace root')
    assertNotIntoItself(from, directory)
    const to = join(directory, basename(from))
    if (to === from) continue
    if (await exists(to)) throw new WorkspacePathError('an entry with that name already exists', 409)
    try {
      await rename(from, to)
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EXDEV') {
        await cp(from, to, { recursive: true, errorOnExist: true, force: false })
        await rm(from, { recursive: true, force: false })
      } else {
        throw error
      }
    }
    changed += 1
  }
  return { changed }
}

/** 复制条目到目标目录：同目录自动改用「副本」名称，跨目录重名时拒绝。 */
async function copyEntries(
  rootReal: string,
  sources: readonly string[],
  target: string,
): Promise<WorkspaceCommandResult> {
  const directory = await resolveDirectory(rootReal, target)
  let changed = 0
  for (const source of sources) {
    const from = await resolveExisting(rootReal, source)
    if (from === rootReal) throw new WorkspacePathError('cannot copy the workspace root')
    assertNotIntoItself(from, directory)
    const sameDirectory = dirname(from) === directory
    const to = sameDirectory
      ? await availableCopyPath(directory, basename(from))
      : join(directory, basename(from))
    if (!sameDirectory && await exists(to)) throw new WorkspacePathError('an entry with that name already exists', 409)
    await cp(from, to, { recursive: true, errorOnExist: true, force: false })
    changed += 1
  }
  return { changed }
}
