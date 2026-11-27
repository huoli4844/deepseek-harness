import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { testProfileResolution } from './profiles/headless/tests/profile-resolution.ts'

/**
 * Keyless source-launch and profile-resolution checks through the production
 * tsx ESM-only entry. The Node compatibility matrix runs this file without a
 * build; source tool execution with native/generated dependencies belongs to
 * the build-backed source-tool suite.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const dshSourceBin = 'apps/cli/src/bin.ts'

describe('dsh SOURCE launcher (node --import tsx/esm)', () => {
  testProfileResolution('src')

  it('launches the source CLI without building', async () => {
    const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      readonly scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.dsh).toBe('node --import tsx/esm apps/cli/src/bin.ts')
  })

  it('adds the workbench to an existing Web profile without saving it', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-source-web-'))
    try {
      const dir = join(home, 'profiles', 'web')
      const manifest = JSON.stringify({
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
      })
      const patch = '- id: yuanshu-workbench\n  disabled: true\n'
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'package.json'), manifest)
      await writeFile(join(dir, 'cordis.patch.yml'), patch)

      const { stdout } = await execa(process.execPath, ['--import', 'tsx/esm', dshSourceBin, 'web', '--dump-config'], {
        cwd: repoRoot,
        env: { DSH_HOME: home },
        timeout: 25_000,
      })
      expect(stdout).toMatch(/^- id: yuanshu-workbench\n  name: '@deepseek-ai\/dsh-yuanshu-workbench'\n(?:  .*\n)*?  disabled: true$/mu)
      expect(stdout).toMatch(/^- id: yuanshu-doclib\n  name: '@deepseek-ai\/dsh-yuanshu-doclib'$/mu)
      expect(stdout).toMatch(/^- id: yuanshu-skills\n  name: '@deepseek-ai\/dsh-yuanshu-skills'$/mu)
      expect(await readFile(join(dir, 'package.json'), 'utf8')).toBe(manifest)
      expect(await readFile(join(dir, 'cordis.patch.yml'), 'utf8')).toBe(patch)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  }, 30_000)

  it('boots the source entry and requires a profile', async () => {
    const result = await execa(process.execPath, ['--import', 'tsx/esm', dshSourceBin], {
      cwd: repoRoot,
      input: '',
      timeout: 25_000,
      killSignal: 'SIGKILL',
      reject: false,
    })
    if (result.timedOut) {
      throw new Error(`dsh source launch did not exit within 25s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
    }
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('--profile <name> is required')
    expect(result.stdout).toBe('')
  }, 30_000)
})
