/** 使用真实会话仓库和查询引擎验证企业账号归属，不以浏览器传入用户标识为授权依据。 */
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionQueryEngine from '@deepseek-ai/dsh-session-query'
import { afterEach, expect, it, vi } from 'vitest'
import { createMessage, createToolResultMessage, createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { bindOwner, readDailyEvidence } from '../src/plugins/yuanshu-work-evidence/index.ts'

class QueryFixture extends SessionQueryEngine {
  override searchSessions(): Promise<never> { return Promise.reject(new Error('此测试不允许全局搜索')) }
  override searchEvents(): Promise<never> { return Promise.reject(new Error('此测试不允许全局搜索')) }
}
const contexts: Context[] = []
afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

it('空白会话持久化账号归属，同账号可恢复，其他用户和租户均不可认领', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(QueryFixture)
  const session = ctx.sessions.create(SessionId('new-daily-session'))
  const identity = { tenant: 7, user: 8, canWrite: true }
  await bindOwner(ctx, session, identity)
  await bindOwner(ctx, session, identity)
  const saved = await ctx.sessionQuery.readSession(session.id)
  expect(saved.events.filter(event => event.type.startsWith('plugin:yuanshu-workbench/account-owner'))).toHaveLength(1)
  await expect(bindOwner(ctx, session, { ...identity, user: 9 })).rejects.toThrow('ownership mismatch')
  await expect(bindOwner(ctx, session, { ...identity, tenant: 9 })).rejects.toThrow('ownership mismatch')
})

it('不能自动把存在工作历史但无归属的旧会话分配给当前登录人', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(QueryFixture)
  const session = ctx.sessions.create(SessionId('legacy-unowned-session'))
  session.append('turn/start', { turn: 1 })
  await expect(bindOwner(ctx, session, { tenant: 7, user: 8, canWrite: true })).rejects.toThrow('Unowned nonblank session')
})

it('工作依据直接读取本地会话日志，读取过程不发起网络或 MCP 查询', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(QueryFixture)
  const session = ctx.sessions.create(SessionId('local-work-evidence'))
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({ source: { kind: 'user' },
    content: [{ type: 'text', text: '今天已完成接口联调，明天计划整理说明' }] }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  const calls = [
    { id: ToolCallId('write-report'), name: 'write', text: '已写入联调说明.md', isError: false },
    { id: ToolCallId('run-tests'), name: 'bash', text: '测试失败', isError: true },
    { id: ToolCallId('previous-daily'), name: 'work_evidence_today', text: '旧日报整理结果', isError: false },
  ]
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createMessage({
    role: 'assistant', source: { kind: 'model', provider: 'mock', model: 'mock' },
    content: calls.map(call => ({ type: 'tool-call', id: call.id, name: call.name, arguments: '{}' })),
  }) }, { surfaceOp: 'append' })
  for (const call of calls) {
    session.append('tool/call', { turn: 1, step: 1, callId: call.id, name: call.name, arguments: '{}' })
    session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({
      callId: call.id, content: [{ type: 'text', text: call.text }], isError: call.isError,
    }) }, { surfaceOp: 'append' })
  }
  const network = vi.fn(() => { throw new Error('本地工作依据禁止请求网络') })
  vi.stubGlobal('fetch', network)
  const evidence = await readDailyEvidence(ctx, [session], new AbortController().signal)
  expect(evidence.evidence).toHaveLength(3)
  expect(evidence.evidence[0]).toMatchObject({ session_id: session.id, kind: 'user/message', outcome: 'unverified',
    text: '今天已完成接口联调，明天计划整理说明' })
  expect(evidence.evidence).toContainEqual(expect.objectContaining({ tool: 'write', outcome: 'success', text: '已写入联调说明.md' }))
  expect(evidence.evidence).toContainEqual(expect.objectContaining({ tool: 'bash', outcome: 'error', text: '测试失败' }))
  expect(network).not.toHaveBeenCalled()
})

it('最近两小时按实际时间跨北京时间午夜，默认当天仍以零点为界', async () => {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(QueryFixture)
  const now = Date.parse('2026-11-26T00:13:00+08:00')
  const session = ctx.sessions.create(SessionId('daily-cross-midnight'))
  for (const [minutesAgo, text] of [[121, '范围外'], [60, '午夜前'], [1, '午夜后']] as const) {
    vi.setSystemTime(now - minutesAgo * 60_000)
    session.append('user/message', createUserMessage({ source: { kind: 'user' },
      content: [{ type: 'text', text }] }), { surfaceOp: 'append' })
  }
  const signal = new AbortController().signal
  const recent = await readDailyEvidence(ctx, [session], signal, 120, now)
  expect(recent.work_date).toBe('2026-11-26')
  expect(recent.evidence.map(item => item.text)).toEqual(['午夜前', '午夜后'])
  const today = await readDailyEvidence(ctx, [session], signal, undefined, now)
  expect(today.evidence.map(item => item.text)).toEqual(['午夜后'])
  await expect(readDailyEvidence(ctx, [session], signal, 0, now)).rejects.toThrow(RangeError)
})
