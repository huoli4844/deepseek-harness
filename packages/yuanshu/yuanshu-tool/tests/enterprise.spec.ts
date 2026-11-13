/** Session-scoped MCP selection over a real Loader and AgentLoop. Network fixtures are separate from business acceptance. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { YuanShuMcp } from '@deepseek-ai/dsh-yuanshu-client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryCredentials } from '../../../credentials/credentials/tests/memory.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as EnterprisePlugin from '../src/index.ts'

async function fixture(script: ConstructorParameters<typeof MockAdapter>[0] = [textResponse('ready'), textResponse('ready')], maxResourceResultBytes?: number) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(MemoryCredentials)
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader)
  ctx.loader.builtins.enterprise = EnterprisePlugin
  await ctx.loader.root.update([{ id: 'enterprise', name: 'cordis:enterprise', config: { baseURL: 'http://localhost:8081', enterpriseTransport: 'mcp', maxSelectedTools: 1, ...(maxResourceResultBytes === undefined ? {} : { maxResourceResultBytes }) } }])
  await ctx.loader.await()
  const harness = await mountAgentLoopTestHarness(ctx)
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  const a = await harness.create(SessionId('enterprise-a'), { provider: 'mock', model: 'mock' })
  const b = await harness.create(SessionId('enterprise-b'), { provider: 'mock', model: 'mock' })
  return { ctx, a, b }
}

async function seedBinding(ctx: Context, sessionId: SessionId): Promise<void> {
  const { createHash } = await import('node:crypto')
  const { credentialKey } = await import('@deepseek-ai/dsh-credentials')
  const key = credentialKey('yuanshu-enterprise', `session-${createHash('sha256').update(JSON.stringify(['http://localhost:8081', sessionId])).digest('hex')}`)
  await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { principal: JSON.stringify({ kind: 'owner' }), tenant: '1', grant: { accessToken: 'fixture-secret', refreshToken: 'fixture-refresh', expiresAt: Date.now() + 300_000, issuer: 'http://localhost:8081', resource: 'http://localhost:8081/api/v1/client/mcp', clientId: 'dsh-yuanshu' } } }))
}

describe('Session enterprise tools', () => {
  it('bounds the complete resource JSON by UTF-8 bytes and retains its URI in oversized-result diagnostics', async () => {
    const uri = 'yuanshu://skills/991004/17'
    const resource = { contents: [{ uri, mimeType: 'text/markdown', text: '采购规范' }] }
    const exact = Buffer.byteLength(JSON.stringify(resource), 'utf8')
    for (const limit of [1, exact - 1, exact, exact + 1]) {
      const f = await fixture(undefined, limit)
      vi.spyOn(YuanShuMcp.prototype, 'close').mockResolvedValue()
      vi.spyOn(YuanShuMcp.prototype, 'onCatalogChanged').mockReturnValue(() => {})
      vi.spyOn(YuanShuMcp.prototype, 'resource').mockResolvedValue(resource)
      try {
        await seedBinding(f.ctx, f.a.id)
        f.a.followup(createUserMessage({ content: [{ type: 'text', text: 'Read procurement instructions' }], source: { kind: 'user' } }))
        await f.a.whenIdle()
        const result = await executeToolFixture(f.a.ctx, { agent: f.a, name: 'enterprise_resource', arguments: { uri }, callId: ToolCallId('resource'), signal: new AbortController().signal })
        expect(result.isError).toBe(limit < exact)
        if (limit >= exact) expect(result.value).toBe(JSON.stringify(resource))
        else {
          expect(JSON.stringify(result.content)).toContain('context budget')
          expect(JSON.stringify(result.content)).toContain(uri)
          expect(JSON.stringify(result.content)).not.toContain('采购规范')
        }
      } finally { await f.ctx.fiber.dispose(); vi.restoreAllMocks() }
    }
  })
  it('records an actionable resource budget failure without resource content in the model transcript', async () => {
    const f = await fixture([
      toolCallResponse('read', 'enterprise_resource', { uri: 'yuanshu://skills/991004/17' }),
      textResponse('Request a smaller authorized resource before continuing.'),
    ], 16)
    vi.spyOn(YuanShuMcp.prototype, 'close').mockResolvedValue()
    vi.spyOn(YuanShuMcp.prototype, 'onCatalogChanged').mockReturnValue(() => {})
    vi.spyOn(YuanShuMcp.prototype, 'resource').mockResolvedValue({ contents: [{ uri: 'yuanshu://skills/991004/17', mimeType: 'text/markdown', text: '采购规范' }] })
    const recorded: unknown[] = []
    f.ctx.on('session/event', (session, event) => {
      if (session.id === f.a.id && event.type === 'tool/result') recorded.push(event.data.message.content)
    })
    try {
      await seedBinding(f.ctx, f.a.id)
      f.a.followup(createUserMessage({ content: [{ type: 'text', text: 'Read procurement instructions' }], source: { kind: 'user' } }))
      await f.a.whenIdle()
      expect(recorded).toHaveLength(1)
      expect(JSON.stringify(recorded)).not.toContain('采购规范')
      expect(recorded).toMatchSnapshot()
    } finally { await f.ctx.fiber.dispose(); vi.restoreAllMocks() }
  })
  it('keeps discovery, selected tools, invalidation and teardown inside their owning Session', async () => {
    const f = await fixture()
    const close = vi.spyOn(YuanShuMcp.prototype, 'close').mockResolvedValue()
    const tools = vi.spyOn(YuanShuMcp.prototype, 'tools').mockResolvedValue([
      { name: 'read_project', description: 'Read governed project data', inputSchema: { type: 'object', properties: {} } },
      { name: 'run_algorithm', inputSchema: { type: 'object', properties: {} } },
    ])
    vi.spyOn(YuanShuMcp.prototype, 'resources').mockResolvedValue([])
    vi.spyOn(YuanShuMcp.prototype, 'resourceTemplates').mockResolvedValue([])
    let invalidate: ((error: Error | null) => void) | undefined
    vi.spyOn(YuanShuMcp.prototype, 'onCatalogChanged').mockImplementation((callback) => { invalidate = callback; return () => {} })
    const call = vi.spyOn(YuanShuMcp.prototype, 'call').mockResolvedValue({ resultType: 'complete', content: [{ type: 'text', text: 'Original execution handle: run-1' }], structuredContent: { schema_version: '1', outcome: 'accepted', data: { run_id: 'run-1' } } })
    try {
      expect(f.ctx.loader.resolve('enterprise').fiber).toBeDefined()
      // Seed only the provider-managed grant to isolate tool lifecycle from the OAuth protocol test.
      await seedBinding(f.ctx, f.a.id)
      f.a.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect the project' }], source: { kind: 'user' } }))
      await f.a.whenIdle()
      const run = (agent: typeof f.a, name: string, args: Record<string, unknown>) => executeToolFixture(agent.ctx, {
        agent, name, arguments: args, callId: ToolCallId(name), signal: new AbortController().signal,
      })
      const selection = await run(f.a, 'enterprise_catalog', { query: 'project', names: ['read_project'] })
      expect(selection.isError).toBe(false)
      expect(f.ctx.tools.get('enterprise_read_project', f.a)).toBeDefined()
      expect(f.ctx.tools.get('enterprise_read_project', f.b)).toBeUndefined()
      const result = await run(f.a, 'enterprise_read_project', {})
      expect(result.isError).toBe(false)
      expect(JSON.stringify(result.value)).toContain('run-1')
      expect(call).toHaveBeenCalledWith('read_project', { session_id: f.a.id, conversation_id: f.a.id }, expect.any(AbortSignal))
      const denied = await run(f.b, 'enterprise_catalog', {})
      expect(denied.isError).toBe(true)
      const budget = await run(f.a, 'enterprise_catalog', { names: ['read_project', 'run_algorithm'] })
      expect(budget.isError).toBe(true)
      invalidate?.(null)
      expect(f.ctx.tools.get('enterprise_read_project', f.a)).toBeUndefined()
      expect(tools).toHaveBeenCalledTimes(2)
      const publicTranscript = [selection.content, result.content, denied.content, budget.content]
      expect(JSON.stringify(publicTranscript)).not.toContain('fixture-secret')
      expect(publicTranscript).toMatchSnapshot()
    } finally { await f.ctx.fiber.dispose(); vi.restoreAllMocks() }
    expect(close).toHaveBeenCalled()
  })
  it('records model-selected enterprise schemas and original Run results in the Session transcript', async () => {
    const f = await fixture([
      toolCallResponse('select', 'enterprise_catalog', { names: ['read_project'] }),
      toolCallResponse('query', 'enterprise_read_project', {}),
      textResponse('The platform accepted run-1; query that Run for its terminal outcome.'),
    ])
    vi.spyOn(YuanShuMcp.prototype, 'close').mockResolvedValue()
    vi.spyOn(YuanShuMcp.prototype, 'tools').mockResolvedValue([{ name: 'read_project', description: 'Read governed project data', inputSchema: { type: 'object', properties: {} } }])
    vi.spyOn(YuanShuMcp.prototype, 'resources').mockResolvedValue([])
    vi.spyOn(YuanShuMcp.prototype, 'resourceTemplates').mockResolvedValue([])
    vi.spyOn(YuanShuMcp.prototype, 'onCatalogChanged').mockReturnValue(() => {})
    vi.spyOn(YuanShuMcp.prototype, 'call').mockResolvedValue({ resultType: 'complete', content: [{ type: 'text', text: 'Accepted original run-1' }], structuredContent: { schema_version: '1', outcome: 'accepted', data: { run_id: 'run-1' } } })
    const recorded: unknown[] = []
    f.ctx.on('session/event', (session, event) => {
      if (session.id === f.a.id && event.type === 'tool/result') recorded.push(event.data.message.content)
    })
    try {
      await seedBinding(f.ctx, f.a.id)
      f.a.followup(createUserMessage({ content: [{ type: 'text', text: 'Inspect the project' }], source: { kind: 'user' } }))
      await f.a.whenIdle()
      expect(recorded).toHaveLength(2)
      expect(JSON.stringify(recorded)).toContain('run-1')
      expect(JSON.stringify(recorded)).not.toContain('fixture-secret')
      expect(recorded).toMatchSnapshot()
    } finally { await f.ctx.fiber.dispose(); vi.restoreAllMocks() }
  })

})
