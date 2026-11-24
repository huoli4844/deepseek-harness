/** Real SDK connect lifecycle, failed connect recovery, and subprocess quiescence. */
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { InMemoryTransport, type Transport } from '@modelcontextprotocol/client'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { startConnection, resolveReconnectPolicy } from '../src/connection.ts'
import { McpStatusCell } from '../src/status.ts'
import { Config } from '../src/index.ts'
import type * as TransportModule from '../src/transport.ts'

const { mockTransport } = vi.hoisted(() => ({ mockTransport: vi.fn<() => Transport>() }))
/* Pass-through mock: real transports (with their close-event guarantees) are
 * created through the real factory; the mock exists only to count creations. */
const realCreateTransport = await vi.importActual<typeof TransportModule>('../src/transport.ts')
vi.mock('../src/transport.ts', () => ({ createTransport: mockTransport }))

const config = Config({
  transport: 'stdio', serverName: 'fixture', command: 'fixture', args: [], env: {}, cwd: '',
  toolCallTimeoutMs: 60_000, startupTimeoutMs: 30_000, failOnStartupError: false,
})
const httpConfig = (url: string): Config => Config({
  transport: 'streamable-http', serverName: 'fixture', url, headers: {},
  toolCallTimeoutMs: 60_000, startupTimeoutMs: 30_000, failOnStartupError: false,
})
const stdioConfig = (command: string, args: string[]): Config => Config({
  transport: 'stdio', serverName: 'fixture', command, args, env: {}, cwd: '',
  toolCallTimeoutMs: 60_000, startupTimeoutMs: 30_000, failOnStartupError: false,
})
const fixture = fileURLToPath(new URL('./fixtures/negotiation-lifecycle.mjs', import.meta.url))

async function connection(source: Config | (() => Transport), retry: boolean, fixtureConfig = config) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  const errors: string[] = []
  const warns: string[] = []
  ctx.logger.error = (message: unknown) => { errors.push(String(message)) }
  ctx.logger.warn = (message: unknown) => { warns.push(String(message)) }
  const transports: Transport[] = []
  mockTransport.mockImplementation(() => {
    const transport = typeof source === 'function' ? source() : realCreateTransport.createTransport(source)
    transports.push(transport)
    return transport
  })
  const status = new McpStatusCell(() => {})
  const handle = startConnection(ctx, typeof source === 'function' ? fixtureConfig : source, resolveReconnectPolicy({
    enabled: retry, initialDelayMs: 1, maxDelayMs: 1, maxAttempts: 3,
  }, 'fixture'), status)
  onTestFinished(async () => {
    await handle.dispose()
  })
  return { ...handle, errors, warns, transports, status }
}

async function stdioFixture(command?: string) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-negotiation-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const eventsPath = join(root, 'events.jsonl')
  await writeFile(eventsPath, '')
  const events = async (): Promise<{ event: string; pid: number; previousAlive?: boolean }[]> => (await readFile(eventsPath, 'utf8'))
    .split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string; pid: number; previousAlive?: boolean })
  const handle = await connection(command === undefined
    ? stdioConfig(process.execPath, [fixture, eventsPath])
    : stdioConfig(command, []), false)
  return { handle, events }
}

describe('SDK negotiation lifecycle', () => {
  it('serves initial tools while the modern list-change subscription is pending', async () => {
    const server = new McpServer({ name: 'fixture', version: '1' })
    server.registerTool('first', { inputSchema: z.object({}) }, async () => ({ content: [] }))
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const serving = serveStdio(() => server, { transport: serverTransport })
    onTestFinished(() => serving.close())
    const listen = Promise.withResolvers<() => Promise<void>>()
    const send = clientTransport.send.bind(clientTransport)
    clientTransport.send = (message, options) => {
      if ('method' in message && message.method === 'subscriptions/listen') {
        listen.resolve(() => send(message, options))
        return Promise.resolve()
      }
      return send(message, options)
    }
    const handle = await connection(() => clientTransport, false, httpConfig('http://127.0.0.1/mcp'))
    const startSubscription = await listen.promise

    await vi.waitFor(() => { expect(handle.status.current()).toMatchObject({ state: 'connected', toolCount: 1 }) })
    expect(await handle.ready).toEqual({})
    const read = handle.projectionReader()
    await expect(read('first', new AbortController().signal)).resolves.toMatchObject({ content: [] })

    server.registerTool('second', { inputSchema: z.object({}) }, async () => ({ content: [] }))
    await startSubscription()
    await vi.waitFor(() => { expect(handle.status.current()).toMatchObject({ state: 'connected', toolCount: 2 }) })

    server.registerTool('third', { inputSchema: z.object({}) }, async () => ({ content: [] }))
    await vi.waitFor(() => { expect(handle.status.current()).toMatchObject({ state: 'connected', toolCount: 3 }) })
  })

  it('starts the serving child once and reaps it on disposal', async () => {
    const { handle, events } = await stdioFixture()
    expect(await handle.ready).toEqual({})
    const starts = (await events()).filter(item => item.event === 'start')
    expect(starts).toHaveLength(1)
    await handle.dispose()
    for (const item of starts) expect(() => process.kill(item.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
  })

  it('reaps the serving child when disposal interrupts a pending start', async () => {
    const { handle, events } = await stdioFixture()
    await vi.waitFor(async () => {
      expect((await events()).some(item => item.event === 'start')).toBe(true)
    }, { timeout: 15_000 })
    await handle.dispose()
    const starts = (await events()).filter(item => item.event === 'start')
    expect(starts).toHaveLength(1)
    for (const item of starts) expect(() => process.kill(item.pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }))
    expect(handle.errors).toEqual([])
  })

  it('retries failed HTTP connects without waiting for a Client close event', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests += 1
      response.writeHead(503)
      response.end('temporary failure')
    })
    onTestFinished(async () => {
      server.closeAllConnections()
      const closed: PromiseWithResolvers<void> = Promise.withResolvers()
      server.close((error) => {
        if (error) closed.reject(error)
        else closed.resolve()
      })
      await closed.promise
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('HTTP fixture did not bind a TCP address')
    const handle = await connection(httpConfig(`http://127.0.0.1:${address.port}/mcp`), true)
    expect((await handle.ready).error).toBeDefined()
    expect(handle.errors).toEqual([])
    await vi.waitFor(() => { expect(handle.errors.some(line => line.includes('giving up after 3'))).toBe(true) }, { timeout: 15_000 })
    expect(requests).toBe(4)
    expect(handle.warns.filter(line => line.includes('connection failed; retrying'))).toHaveLength(3)
  })

  it('retries failed stdio connects when no child could be spawned', async () => {
    const handle = await connection(stdioConfig(join(fixture, 'missing-command'), []), true)
    expect((await handle.ready).error).toBeDefined()
    expect(handle.errors).toEqual([])
    await vi.waitFor(() => { expect(handle.errors.some(line => line.includes('giving up after 3'))).toBe(true) }, { timeout: 15_000 })
    expect(handle.transports).toHaveLength(4)
    expect(handle.warns.filter(line => line.includes('connection failed; retrying'))).toHaveLength(3)
  })

  it('stops retries when a failed connect cannot confirm transport cleanup', async () => {
    vi.useFakeTimers()
    try {
      const close = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('SDK shutdown failed'))
      const handle = await connection(() => ({
        start: () => Promise.reject(new Error('probe failed')),
        send: () => Promise.resolve(),
        close,
      }), true)
      await vi.advanceTimersByTimeAsync(config.closeTimeoutMs)
      expect((await handle.ready).error).toBeDefined()
      expect(handle.status.current()).toEqual({
        state: 'failed', reason: 'unclosed-generation', lastError: 'Error: SDK shutdown failed',
      })
      expect(handle.status.closure()).toEqual({ closeConfirmed: false, cleanupError: 'Error: SDK shutdown failed' })
      expect(handle.warns.some(line => line.includes('connection failed; retrying'))).toBe(false)
      expect(handle.transports).toHaveLength(1)
      expect(close).toHaveBeenCalledTimes(1)
      await handle.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
