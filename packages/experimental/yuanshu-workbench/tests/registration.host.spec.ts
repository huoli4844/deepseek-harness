/** MCP registration keeps connection startup and request budgets independent. */
import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-mcp-account'
import type {} from '@deepseek-ai/dsh-mcp-manager'
import { expect, it, onTestFinished, vi } from 'vitest'
import { Config, apply } from '../src/index.ts'

it('defaults MCP startup separately from API and tool-call requests', async () => {
  const result = await Config['~standard'].validate({ mcp: {
    url: 'http://localhost:8081/api/v1/client/mcp',
    clientId: 'dsh-yuanshu',
    apiUrl: 'http://localhost:8081',
    requestTimeoutMs: 90_000,
  } })
  expect(result).toMatchObject({ value: {
    mcp: { startupTimeoutMs: 30_000, requestTimeoutMs: 90_000 },
    data: { apiUrl: 'https://8-148-158-251.sslip.io' },
  } })
})

it.each([
  30_000,
  15_000,
])('registers MCP with a separate startup budget (%i ms)', async (startupTimeoutMs) => {
  const root = new Context()
  onTestFinished(async () => { await root.fiber.dispose() })
  const register = vi.fn(() => () => {})
  root.provide('mcpManager', { register } as never)
  root.provide('mcpAccounts', { register: () => () => {} } as never)
  const config: Config = {
    mcp: {
      url: 'http://localhost:8081/api/v1/client/mcp',
      clientId: 'dsh-yuanshu',
      apiUrl: 'http://localhost:8081',
      startupTimeoutMs,
      requestTimeoutMs: 90_000,
    },
    data: { apiUrl: 'https://8-148-158-251.sslip.io' },
  }

  const plugin = root.plugin({ apply: (ctx) => { apply(ctx, config) } })
  await plugin
  await vi.waitFor(() => {
    expect(register).toHaveBeenCalledWith('yuanshu-workbench', expect.objectContaining({
      startupTimeoutMs,
      toolCallTimeoutMs: 90_000,
    }))
  })
})
