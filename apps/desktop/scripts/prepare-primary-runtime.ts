/** 桌面资源位置，以及共享运行时构建器的、感知签名的校验。 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DesktopAutoUpdateTarget } from '@deepseek-ai/dsh-desktop-publisher/desktop-auto-update-environment.mjs'
import {
  expectedPrimaryRuntimeDigest,
  preparePrimaryRuntime as preparePayload,
  smokePrimaryRuntime as smokePayload,
} from '../../../scripts/primary-runtime/prepare.ts'
import {
  parsePrimaryRuntime,
  workspaceDependencyPaths,
  type PrimaryRuntimeManifest,
} from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { desktopTargetPlatform, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths } from './desktop-build-paths.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'

/**
 * 判断已有产物能否直接复用：摘要、版本、目标平台与关键解释器文件同时匹配才算命中。
 * 只读少量元数据，不遍历产物目录，因此命中的代价可以忽略。
 * @param root - 已装配的 primary-runtime 目录。
 * @param target - 当前构建目标。
 * @param version - 桌面包版本，随产物元数据一起比对。
 * @returns 命中时返回 true；调用方可以跳过装配，但仍应执行校验。
 */
function reusablePrimaryRuntime(root: string, target: DesktopAutoUpdateTarget, version: string): boolean {
  let manifest: PrimaryRuntimeManifest
  try {
    manifest = parsePrimaryRuntime(JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')))
  } catch (error) {
    // 元数据缺失或损坏都按“不可复用”处理，交给完整装配重建。
    console.log(`primary runtime: reuse disabled for ${root}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
  const expected = desktopTargetPlatform(target)
  if (manifest.platform !== expected.platform || manifest.arch !== expected.arch) return false
  if (manifest.desktopVersion !== version) return false
  if (manifest.payloadDigest !== expectedPrimaryRuntimeDigest(target)) return false
  if (Object.keys(manifest.pythonPackages).length === 0) return false
  const entries = workspaceDependencyPaths(root, manifest)
  return existsSync(entries.python)
    && existsSync(entries.pythonPackages)
    && entries.node !== undefined && existsSync(entries.node)
    && entries.pnpm !== undefined && existsSync(entries.pnpm)
}

/**
 * 为所选打包目标准备桌面资源。
 * `reuse` 只用于开发启动：产物未变时跳过重装与重拷（每次约 339 MB），校验照常执行；
 * 打包与签名流程不传该选项，始终从锁文件重新装配。
 * @param options - 签名打包可延迟执行校验；开发启动可复用未变更的产物。
 * @returns 装配（或被跳过的复用）与原生目标执行校验完成后 resolve。
 */
export async function preparePrimaryRuntime(options: { deferSmoke?: boolean; reuse?: boolean } = {}): Promise<void> {
  const paths = resolveDesktopTargetBuildPaths()
  const target = resolveDesktopBuildTarget()
  const root = join(paths.runtime, 'primary-runtime')
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  if (options.reuse === true && reusablePrimaryRuntime(root, target, version)) {
    console.log('primary runtime: unchanged payload reused; skipped preparation')
  } else {
    await preparePayload({ target, output: paths.runtime, cache: paths.downloads, version })
  }
  if (!options.deferSmoke) smokePrimaryRuntime(root)
}

/**
 * 装配或签名完成后校验桌面完整载荷。
 * @param root - 最终载荷目录，包含平台签名。
 */
export function smokePrimaryRuntime(root: string): void {
  const manifest = parsePrimaryRuntime(JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')))
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) return
  if (Object.keys(manifest.pythonPackages).length === 0) throw new Error('primary runtime: missing Python distribution versions; prepare the payload before running its smoke checks.')
  const entries = workspaceDependencyPaths(root, manifest)
  if (entries.node === undefined || entries.pnpm === undefined) throw new Error('primary runtime: the Desktop payload must declare node and pnpm components.')
  smokePayload(root, scrubWindowsSigningEnvironment(process.env))
}

if (import.meta.main) await preparePrimaryRuntime()
