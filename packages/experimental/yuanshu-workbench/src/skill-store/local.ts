/** 本机技能打包：把本地技能目录压成可直接上传的 zip。 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { SkillInstallError } from './install.ts'

/** 单个文件上限。 */
const MAX_ENTRY_BYTES = 5 * 1024 * 1024
/** 文件数量上限。 */
const MAX_ENTRIES = 500
/** 打包后总大小上限。 */
const MAX_TOTAL_BYTES = 40 * 1024 * 1024

/**
 * 递归读取技能目录并打包为 zip；跳过符号链接，忽略隐藏的系统文件。
 * @param dir - 技能目录绝对路径。
 * @returns zip 压缩包字节。
 */
export async function packageSkillDirectory(dir: string): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  let total = 0

  const walk = async (current: string, prefix: string): Promise<void> => {
    const items = await readdir(current, { withFileTypes: true })
    for (const item of items) {
      // 不跟随符号链接，避免把目录外的内容打进包里。
      if (item.isSymbolicLink()) continue
      const absolute = join(current, item.name)
      const key = prefix === '' ? item.name : `${prefix}/${item.name}`
      if (item.isDirectory()) {
        await walk(absolute, key)
        continue
      }
      if (!item.isFile()) continue
      const info = await stat(absolute)
      if (info.size > MAX_ENTRY_BYTES) throw new SkillInstallError(413, `${key} 超过 5MB，无法上传`)
      total += info.size
      if (total > MAX_TOTAL_BYTES) throw new SkillInstallError(413, '技能目录超过 40MB，无法上传')
      if (Object.keys(files).length >= MAX_ENTRIES) throw new SkillInstallError(413, '技能目录文件数超过 500 个')
      files[key] = new Uint8Array(await readFile(absolute))
    }
  }

  await walk(dir, '')
  if (files['SKILL.md'] === undefined) throw new SkillInstallError(400, '技能目录缺少 SKILL.md，无法上传')
  return zipSync(files)
}
