/** 使用临时目录验证真实归档、事件回放和身份隔离。 */
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import { expect, it, vi } from 'vitest'
import { bindOwner } from '../src/plugins/yuanshu-work-evidence/index.ts'
import { WorkJournal } from '../src/plugins/yuanshu-work-journal/index.ts'
import { JournalProjection } from '../src/plugins/yuanshu-work-journal/entries.ts'

const owner = { tenant: 7, user: 8, canWrite: true }
const before = Date.parse('2026-11-26T11:59:59.999+08:00')
const noon = before + 1
const midnight = Date.parse('2026-11-27T00:00:00+08:00')

function message(session: Session, time: number) {
  vi.setSystemTime(time)
  session.append('user/message', createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: '不应写入归档的对话正文' }],
  }), { surfaceOp: 'append' })
}

it('实时读取未刷盘事件，按北京时间分档，恢复时去重且不读取其他账号历史', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-journal-'))
  const ctx = new Context()
  const signal = new AbortController().signal
  const start = midnight - 86_400_000
  try {
    vi.setSystemTime(start)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SessionQueryEngine, [])
    const native = ctx.sessions.create(SessionId('native'))
    const floating = ctx.sessions.create(SessionId('floating'))
    const other = ctx.sessions.create(SessionId('other'))
    const legacy = ctx.sessions.create(SessionId('legacy'))
    for (const [session, identity] of [[native, owner], [floating, owner], [other, { ...owner, user: 9 }]] as const) {
      await bindOwner(ctx, session, identity)
    }
    message(floating, before)
    message(other, before)
    message(legacy, before)
    const journal = new WorkJournal(ctx, root)
    journal.install()
    await journal.follow(native, owner)
    message(native, noon)
    message(native, midnight)
    const rows = await journal.read(owner, start, midnight, signal)
    expect(rows.map(row => row.session_id)).toEqual(['floating', 'native', 'native'])
    expect((await readdir(join(root, '7/8'))).sort()).toEqual(['2026-11-26-AM.jsonl', '2026-11-26-PM.jsonl', '2026-11-27-AM.jsonl'])
    const file = join(root, '7/8/2026-11-26-PM.jsonl')
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readFile(file, 'utf8')).not.toContain('不应写入归档的对话正文')
    const restarted = new WorkJournal(ctx, root)
    await restarted.follow(native, owner)
    expect(await restarted.read(owner, start,midnight, signal)).toEqual(rows)
    await expect(restarted.follow(other, owner)).rejects.toThrow('Invalid journal owner')
    expect(await restarted.read({ ...owner, user: 9 }, start, midnight, signal)).toEqual([])
    expect(await restarted.read({ ...owner, tenant: 9 }, start, midnight, signal)).toEqual([])
  } finally {
    vi.useRealTimers()
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

it('只收录宿主交付事件的工作区路径与工具状态，省略参数和正文', () => {
  const projection = new JournalProjection('native', '/workspace')
  const callId = ToolCallId('run')
  const event = (seq: number, type: string, data: object) =>
    ({ seq, type, time: noon, data }) as SessionEvent
  projection.event(event(1, 'tool/call', { callId, name: 'build', arguments: 'password=private' }))
  const failed = projection.event(event(2, 'tool/result', { message: createToolResultMessage({
    callId, isError: true, content: [{ type: 'text', text: 'private output' }],
  }) }))
  expect(failed).toMatchObject({ tool: 'build', outcome: 'error' })
  expect(JSON.stringify(failed)).not.toContain('private')
  const delivered = projection.event(event(3, 'deliverables/presented', { files: [
    { path: 'reports/说明.md', description: 'private description' },
    { path: '/workspace/reports/说明.md' }, { path: '/workspace-other/secret' }, { path: '../another/secret' },
  ] }))
  expect(delivered).toMatchObject({ kind: 'deliverable', paths: ['reports/说明.md'] })
  expect(JSON.stringify(delivered)).not.toContain('private')
})
