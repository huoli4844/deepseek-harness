/** 技能包安装器：解压 zip、校验路径与体积、写入本机技能目录。 */
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'

/** 压缩包上限，与上传/下载保持一致。 */
const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024
/** 单个文件解压后上限。 */
const MAX_ENTRY_BYTES = 5 * 1024 * 1024
/** 单包文件数量上限。 */
const MAX_ENTRIES = 500
/** 解压后总大小上限，防止 zip 炸弹。 */
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024
/** 技能目录名白名单：字母数字开头，允许点、下划线与连字符。 */
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

/**
 * 判断技能名是否可作为本机目录名。
 * @param value - 待校验名称。
 * @returns 是否合法。
 */
export function isSkillName(value: string): boolean {
  return SKILL_NAME.test(value)
}

/** 安装失败，status 直接作为前端 HTTP 状态码。 */
export class SkillInstallError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'SkillInstallError'
    this.status = status
  }
}

/** 安装结果。 */
export interface InstalledSkill {
  /** 技能名称，也是本机目录名。 */
  readonly name: string
}

/**
 * 校验并规范化 zip 内的条目路径，拒绝绝对路径、盘符与上跳目录。
 * @param entry - zip 中记录的路径。
 * @returns 规范化后的相对路径；目录条目返回 undefined。
 */
function safeEntryPath(entry: string): string | undefined {
  const unified = entry.replace(/\\/gu, '/')
  if (unified.endsWith('/')) return undefined
  if (unified.startsWith('/') || /^[A-Za-z]:/u.test(unified) || unified.includes('\0')) {
    throw new SkillInstallError(400, '技能包包含非法路径')
  }
  const segments = unified.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new SkillInstallError(400, '技能包包含非法路径')
  }
  return segments.join('/')
}

/**
 * 读取 SKILL.md front matter 中的 name，作为技能目录名候选。
 * @param markdown - SKILL.md 文本。
 * @returns 合法的技能名；没有声明时返回 undefined。
 */
function frontMatterName(markdown: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(markdown)
  if (block === null) return undefined
  const line = /^name:\s*(.+)$/mu.exec(block[1] ?? '')
  const value = line?.[1]?.trim().replace(/^['"]|['"]$/gu, '')
  return value !== undefined && SKILL_NAME.test(value) ? value : undefined
}

/**
 * 从条目集合里确定技能根目录与目录名。
 * @param entries - 已规范化的条目，键为相对路径。
 * @returns 根目录前缀（根目录为空时是空串）与技能名。
 */
function resolveSkillRoot(entries: ReadonlyMap<string, Uint8Array>): { root: string; name: string } {
  const markdown = [...entries.keys()].filter(path => basename(path) === 'SKILL.md')
  if (markdown.length === 0) throw new SkillInstallError(400, '技能包中缺少 SKILL.md')
  // 取层级最浅的 SKILL.md，避免可执行示例里的嵌套技能干扰。
  const shallowest = markdown.sort((left, right) => left.split('/').length - right.split('/').length)[0] ?? ''
  const root = dirname(shallowest) === '.' ? '' : dirname(shallowest)
  const declared = frontMatterName(new TextDecoder().decode(entries.get(shallowest) ?? new Uint8Array()))
  const fallback = root === '' ? undefined : basename(root)
  const name = declared ?? fallback
  if (name === undefined || !SKILL_NAME.test(name)) {
    throw new SkillInstallError(400, '技能包缺少合法的技能名称，请在 SKILL.md 中声明 name')
  }
  return { root, name }
}

/**
 * 判断目标目录是否已存在。
 * @param path - 技能目录绝对路径。
 * @returns 是否存在。
 */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (_missing) {
    return false
  }
}

/**
 * 安装技能包到技能根目录下的同名子目录。
 * 只写入包含 SKILL.md 的那一层，安装过程不会执行包内任何脚本。
 * @param archive - zip 压缩包字节。
 * @param skillsRoot - 本机技能根目录（通常为 $DSH_HOME/skills）。
 * @returns 安装后的技能名。
 */
export async function installSkillArchive(archive: Uint8Array, skillsRoot: string): Promise<InstalledSkill> {
  if (archive.byteLength === 0) throw new SkillInstallError(400, '技能包内容为空')
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new SkillInstallError(413, '技能包超过 20MB，无法安装')
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(archive)
  } catch (_invalidZip) {
    throw new SkillInstallError(400, '技能包不是有效的 zip 文件')
  }
  const entries = new Map<string, Uint8Array>()
  let total = 0
  for (const [entry, bytes] of Object.entries(files)) {
    const path = safeEntryPath(entry)
    if (path === undefined) continue
    if (bytes.byteLength > MAX_ENTRY_BYTES) throw new SkillInstallError(413, `技能包中的 ${path} 超过 5MB`)
    total += bytes.byteLength
    if (total > MAX_UNCOMPRESSED_BYTES) throw new SkillInstallError(413, '技能包解压后超过 40MB')
    entries.set(path, bytes)
  }
  if (entries.size === 0) throw new SkillInstallError(400, '技能包是空的')
  if (entries.size > MAX_ENTRIES) throw new SkillInstallError(413, '技能包文件数量超过 500 个')
  const { root, name } = resolveSkillRoot(entries)
  const prefix = root === '' ? '' : `${root}/`
  const target = join(skillsRoot, name)
  // 二次确认目标仍落在技能根目录下，防御名称里的边界字符。
  const base = resolve(skillsRoot)
  if (resolve(target) !== join(base, name) || !resolve(target).startsWith(`${base}${sep}`)) {
    throw new SkillInstallError(400, '技能名称不合法')
  }
  if (await exists(target)) throw new SkillInstallError(409, `技能 ${name} 已存在，请先删除旧版本`)
  await mkdir(target, { recursive: true })
  try {
    for (const [path, bytes] of entries) {
      if (prefix !== '' && !path.startsWith(prefix)) continue
      const relative = prefix === '' ? path : path.slice(prefix.length)
      if (relative === '') continue
      const destination = resolve(target, relative)
      if (!destination.startsWith(`${resolve(target)}${sep}`)) {
        throw new SkillInstallError(400, '技能包包含非法路径')
      }
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes)
    }
  } catch (error) {
    // 任一文件写入失败都回滚，避免留下半安装的技能目录。
    await rm(target, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  return { name }
}
