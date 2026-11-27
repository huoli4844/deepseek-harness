/** 校验工作区路径防护、路由映射与本地文件操作，使用临时目录不触碰真实工作区。 */
import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { WorkspacePathError, assertName, relativeSegments } from '../src/workspace-paths.ts'
import { copyName, runWorkspaceCommand } from '../src/workspace-ops.ts'
import { workspaceRoute } from '../src/workspace-route.ts'

let root = ''

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'doclib-ws-')))
  await mkdir(join(root, 'docs'))
  await writeFile(join(root, 'a.txt'), 'a')
  await writeFile(join(root, 'docs', 'b.txt'), 'b')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

it('条目名与相对路径拒绝越界输入', () => {
  expect(assertName('正常名称.txt')).toBe('正常名称.txt')
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a\u0000b']) {
    expect(() => assertName(name)).toThrow(WorkspacePathError)
  }
  expect(relativeSegments('')).toEqual([])
  expect(relativeSegments('docs/b.txt')).toEqual(['docs', 'b.txt'])
  for (const path of ['/etc/passwd', '../secret', 'docs/../secret', 'docs//b.txt', 'docs\\b.txt']) {
    expect(() => relativeSegments(path)).toThrow(WorkspacePathError)
  }
})

it('新建、重命名、移动、复制与删除都限制在工作区内', async () => {
  expect(await runWorkspaceCommand(root, { action: 'mkdir', directory: '', name: '新建' })).toEqual({ changed: 1 })
  expect(await readdir(root)).toContain('新建')

  await runWorkspaceCommand(root, { action: 'rename', source: 'a.txt', name: 'c.txt' })
  expect(await readdir(root)).toContain('c.txt')

  await runWorkspaceCommand(root, { action: 'move', sources: ['c.txt'], target: 'docs' })
  expect(await readdir(join(root, 'docs'))).toContain('c.txt')

  await runWorkspaceCommand(root, { action: 'copy', sources: ['docs/c.txt'], target: '' })
  expect(await readdir(root)).toContain('c.txt')

  await runWorkspaceCommand(root, { action: 'delete', sources: ['c.txt', '新建'] })
  expect(await readdir(root)).not.toContain('新建')

  await expect(runWorkspaceCommand(root, { action: 'delete', sources: [''] })).rejects.toThrow(WorkspacePathError)
  await expect(runWorkspaceCommand(root, { action: 'rename', source: '../a.txt', name: 'x' }))
    .rejects.toThrow(WorkspacePathError)
  await expect(runWorkspaceCommand(root, { action: 'move', sources: ['docs'], target: 'docs' }))
    .rejects.toThrow(WorkspacePathError)
})

it('同目录复制自动使用副本命名，重复复制递增序号', () => {
  expect(copyName('报告.docx', 1)).toBe('报告 副本.docx')
  expect(copyName('报告.docx', 2)).toBe('报告 副本 2.docx')
  expect(copyName('README', 1)).toBe('README 副本')
})

it('工作区路由限定动作与 HTTP 方法', () => {
  expect(workspaceRoute('/yuanshu-doclib/workspace/mkdir', 'POST')).toEqual({
    type: 'call', action: 'mkdir', method: 'POST',
  })
  expect(workspaceRoute('/yuanshu-doclib/workspace/download', 'GET')).toEqual({
    type: 'call', action: 'download', method: 'GET',
  })
  expect(workspaceRoute('/yuanshu-doclib/workspace/delete', 'GET')).toEqual({ type: 'method', allow: 'POST' })
  expect(workspaceRoute('/yuanshu-doclib/collections', 'GET')).toBeUndefined()
})
