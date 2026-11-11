import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { afterEach, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.YUANSHU_TOKEN
})

function fakeContext(): { ctx: Context; registered: ToolDefinition[] } {
  const registered: ToolDefinition[] = []
  const ctx = {
    tools: { register: (tool: ToolDefinition) => { registered.push(tool); return () => {} } },
    effect: (fn: () => () => void) => fn(),
  } as unknown as Context
  return { ctx, registered }
}

it('does not register the agent tool without an explicit token', () => {
  // 旧实现会回落到 YUANSHU_TOKEN 与 ~/.dsh/yuanshu-token，让工具以另一个
  // principal 执行。现在没有显式凭据就不注册，避免身份分离。
  process.env.YUANSHU_TOKEN = 'stale-file-token'
  const { ctx, registered } = fakeContext()

  apply(ctx, { baseURL: 'http://yuanshu.test' })

  expect(registered).toHaveLength(0)
})

it('executes with the per-instance token and no implicit credential', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify({ code: 0, data: { answer: 'ok' } }), { status: 200 })
  }))
  const { ctx, registered } = fakeContext()

  apply(ctx, { baseURL: 'http://yuanshu.test', token: 'instance-token' })

  expect(registered).toHaveLength(1)
  const tool = registered[0]
  const value = await tool?.execute(
    { task: 'hello', worker_type: 'general_assistant' },
    {} as never,
  )

  expect(value).toBe(JSON.stringify({ answer: 'ok' }))
  expect(calls).toHaveLength(1)
  expect(calls[0]?.url).toBe('http://yuanshu.test/api/v1/workers/general_assistant/execute')
  const headers = calls[0]?.init?.headers as Record<string, string>
  expect(headers.Authorization).toBe('Bearer instance-token')
})
