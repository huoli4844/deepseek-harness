/** YuanShu enterprise tools opt into the shipped Web profile through a Loader insertion. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))

function config(patch?: string): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-yuanshu-composition-'))
  onTestFinished(() => { rmSync(home, { recursive: true, force: true }) })
  return execFileSync(process.execPath, [
    '--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'web',
    ...patch === undefined ? [] : ['--patch', patch], '--dump-config',
  ], { cwd: root, env: { ...process.env, DSH_HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

it('keeps enterprise model tools out of the general Web profile', () => {
  expect(config()).not.toContain('id: yuanshu-tool')
})

it('retains durable Session storage for enterprise workspaces and recovery', () => {
  const output = config('apps/cli/config/profiles/yuanshu/cordis.patch.yml')
  const persistence = output.split(/(?=^- id: )/mu).find(row => row.startsWith('- id: session-persistence-jsonl\n'))
  expect(persistence).toBeDefined()
  expect(persistence).not.toContain('disabled: true')
})

it.each([
  ['apps/cli/config/profiles/yuanshu/cordis.patch.yml', 'http://localhost:8081'],
  ['packages/yuanshu/yuanshu-client/tests/profile-acceptance.patch.yml', 'http://127.0.0.1:18091'],
])('inserts the enterprise tool once through %s', (patch, baseURL) => {
  const output = config(patch)
  expect(output.match(/^- id: yuanshu-tool$/gm)).toHaveLength(1)
  expect(output).toContain("name: '@deepseek-ai/dsh-yuanshu-tool'")
  expect(output).toContain(`baseURL: ${baseURL}`)
  expect(output).toContain('enterpriseTransport: mcp')
  expect(output.match(/^- id: yuanshu-gateway$/gm)).toHaveLength(1)
})
