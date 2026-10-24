/**
 * JSON-RPC methods and notifications for out-of-process harness SDKs.
 * The surrounding context owns plugins, persistence, and configured adapters.
 *
 * @module @deepseek-ai/dsh-sdk-jsonrpc-server/server
 */

import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { SdkUserQuestionBridge } from './user-questions.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { admitEncodedImages, type EncodedImageAttachment, type ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { createUserMessage, ReasoningEffortId, type ContentBlock, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import { carrierKeyOf, type Scoped } from '@deepseek-ai/dsh-scope'
import type { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-working-directory'
import type {} from '@deepseek-ai/dsh-user-approval'

import type {} from '@deepseek-ai/dsh-schedule'
import type SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { SubagentRunEndInfo } from '@deepseek-ai/dsh-subagent'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'
import type {
  ApprovalRequestParams,
  InitializeParams,
  InitializeResult,
  JsonRpcTransportPeer,
  SessionEventNotification,
  SessionPromptParams,
  SessionPromptResult,
  SessionCancelParams,
  SessionDisposeParams,
  SessionReplayParams,
  SessionReplayResult,
  SessionResult,
  SessionResultParams,
  SessionResumeParams,
  SessionWaitParams,
  SessionWorkingDirectoryParams,
  SessionWorkingDirectorySetParams,
  SessionWorkingDirectoryResult,
  SdkEncodedImageBlock,
  SubagentFinishedNotification,
  SubagentStartedNotification,
} from '@deepseek-ai/dsh-sdk-protocol'

interface SessionRecord {
  handle: AgentHandle
  runId: string | undefined
  /** Latest live failure not superseded by a subsequently committed terminal. */
  failure: { readonly error: unknown; readonly atOffset: SessionLogOffset } | undefined
  inputs: Map<string, { hash: string; receipt: Promise<SessionPromptResult> }>
}

const MAX_REPLAY_EVENTS = 4096
const DEFAULT_REPLAY_LIMIT = 512

function encodedImage(block: SessionPromptParams['contentBlocks'][number]): block is SdkEncodedImageBlock {
  return block.type === 'image' && 'data' in block
}

async function durablePromptContent(ctx: Context, blocks: SessionPromptParams['contentBlocks']): Promise<ContentBlock[]> {
  const images = blocks.filter(encodedImage)
  if (images.length === 0) return blocks as ContentBlock[]
  const attachments = ctx.get('attachments')
  if (attachments === undefined) throw new Error('SDK image prompt requires an attachment store')
  const refs = await admitEncodedImages(attachments, images.map((image): EncodedImageAttachment => ({
    data: image.data,
    mediaType: image.mimeType,
  })))
  let next = 0
  return blocks.map(block => encodedImage(block)
    ? { type: 'image', attachment: refs[next++] as ImageAttachmentRef }
    : block)
}

/** Recover the delegating parent from the service-owned scoped carrier. */
function subagentParentOf(carrier: Scoped<SubagentRuntime>): Agent {
  return carrierKeyOf(carrier) as Agent
}

/** Deployment-specific status mapping for SDK turn and subagent outcomes. */
export interface HarnessSdkJsonRpcServerOptions {
  /** Report max-token termination as an accepted result instead of an infrastructure error. */
  maxTokensAsSuccess?: boolean
}

function successStatus(reason: string, options: HarnessSdkJsonRpcServerOptions): 'ok' | 'error' {
  if (reason === 'completed') return 'ok'
  return reason === 'max-tokens' && options.maxTokensAsSuccess === true ? 'ok' : 'error'
}

/**
 * SDK server over one booted harness context and transport peer. Construction
 * subscribes to session, agent, and subagent lifecycle events until shutdown;
 * reinitialization is unsupported.
 */
export class HarnessSdkJsonRpcServer {
  private cwd = process.cwd()
  private provider = 'deepseek-official'
  private model = 'deepseek-official'
  private reasoningEffort: ReturnType<typeof ReasoningEffortId> | undefined
  private maxTokens: number | undefined
  private llmFiber: { dispose(): Promise<void> } | undefined
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly eventHistory = new Map<string, SessionEventNotification[]>()
  private readonly sessionCreations = new Map<string, Promise<SessionRecord>>()
  private readonly disposers: (() => void)[] = []
  private shutdownTask: Promise<Record<string, never>> | undefined
  private shuttingDown = false
  private initialized = false
  private approvalRequests = false
  private readonly lifetime = new AbortController()
  private readonly userQuestions: SdkUserQuestionBridge
  private readonly initialization = Promise.withResolvers<void>()
  /** Restored by a reminder and available for the client's first resume. */
  private readonly scheduledSessions = new Map<string, Promise<SessionRecord>>()

  constructor(
    private readonly ctx: Context,
    private readonly transport: JsonRpcTransportPeer,
    private readonly options: HarnessSdkJsonRpcServerOptions = {},
  ) {
    this.disposers.push(ctx.on('approval/request', async (request, next) => {
      if (!this.approvalRequests || !this.ownsAgent(request.agent)) return next()
      const params: ApprovalRequestParams = {
        sessionId: request.agent.session.id,
        toolName: request.toolName,
        ...(request.callId === undefined ? {} : { callId: request.callId }),
        ...(request.reason === undefined ? {} : { reason: request.reason }),
      }
      const signal = request.signal === undefined
        ? this.lifetime.signal
        : AbortSignal.any([request.signal, this.lifetime.signal])
      const result = await this.transport.request('approval/request', params, signal)
      if (result === null || typeof result !== 'object' || !('outcome' in result)
        || (result.outcome !== 'allowed-once' && result.outcome !== 'rejected' && result.outcome !== 'cancelled')) {
        throw new TypeError('approval/request response requires an allowed-once, rejected, or cancelled outcome')
      }
      return result.outcome
    }))
    const serverOptions = this.options
    this.userQuestions = new SdkUserQuestionBridge(ctx, transport, agent =>
      this.sessions.get(agent.session.id)?.handle.agent === agent)
    this.disposers.push(ctx.on('schedule/resolve-agent', async (sessionId) => {
      // Startup delivery must wait for the SDK model route and output limit.
      await this.initialization.promise
      if (this.shuttingDown) throw new Error('SDK server is shutting down')
      const existing = this.sessions.get(sessionId)
      const pending = this.sessionCreations.get(sessionId)
      if (existing !== undefined) {
        this.assertLiveAgent(existing, sessionId)
        return existing.handle.agent
      }
      if (pending !== undefined) return (await pending).handle.agent
      const restoration = this.openSession(sessionId, true)
      this.scheduledSessions.set(sessionId, restoration)
      try {
        return (await restoration).handle.agent
      } catch (error) {
        this.scheduledSessions.delete(sessionId)
        throw error
      }
    }))
    this.disposers.push(ctx.on('session/event', (session, event) => {
      const record = this.sessions.get(session.id)
      if (event.type === 'turn/end' && record?.handle.agent.session === session
        && record.failure !== undefined && event.seq >= record.failure.atOffset) {
        record.failure = undefined
      }
      const payload: SessionEventNotification = { sessionId: String(session.id), event }
      if (this.sessions.has(String(session.id))) {
        const history = this.eventHistory.get(String(session.id)) ?? []
        history.push(payload)
        if (history.length > MAX_REPLAY_EVENTS) history.splice(0, history.length - MAX_REPLAY_EVENTS)
        this.eventHistory.set(String(session.id), history)
      }
      this.transport.notify('session.event', payload)
    }))
    this.disposers.push(ctx.on('agent/error', ({ agent, error }) => {
      const record = this.sessions.get(agent.session.id)
      if (record?.handle.agent !== agent) return
      record.failure = { error, atOffset: agent.session.seq }
    }))
    this.disposers.push(ctx.on('agent/status', ({ agent, status }) => {
      this.transport.notify('session.status', { sessionId: String(agent.session.id), status })
    }))
    this.disposers.push(ctx.on('session/created', (session) => {
      const parentSession = session.header.parentSession
      if (session.header.origin !== 'subagent' || parentSession === undefined) return
      const payload: SubagentStartedNotification = {
        parentSessionId: String(parentSession),
        childSessionId: String(session.id),
      }
      this.transport.notify('subagent.started', payload)
    }))
    this.disposers.push(ctx.on('subagent/end', function (this: Scoped<SubagentRuntime>, info: SubagentRunEndInfo) {
      const parent = subagentParentOf(this)
      // This protocol reports only in-process child sessions. The service
      // snapshots the provider name and local flag through child disposal;
      // matching ids or parent lineage alone never establishes locality.
      if (!info.local) return
      const payload: SubagentFinishedNotification = {
        provider: info.provider,
        agentId: String(info.id),
        parentSessionId: String(parent.session.id),
        childSessionId: String(info.id),
        status: successStatus(info.stopReason, serverOptions),
        stopReason: info.stopReason,
        ...(info.lastAssistantMessage === undefined
          ? {}
          : { lastAssistantMessage: [...info.lastAssistantMessage] }),
      }
      transport.notify('subagent.finished', payload)
    }))
  }

  /**
   * Validate and configure the SDK route, mounting the DeepSeek fallback only when unowned.
   * @param params - SDK handshake parameters.
   * @returns server identity for the handshake.
   */
  async initialize(params: InitializeParams): Promise<InitializeResult> {
    if (params.approvalRequests !== undefined && typeof params.approvalRequests !== 'boolean') {
      throw new TypeError('initialize approvalRequests must be a boolean')
    }
    if (params.reasoningEffort !== undefined
      && (typeof params.reasoningEffort !== 'string' || params.reasoningEffort.length === 0)) {
      throw new TypeError('initialize reasoningEffort must be a non-empty string')
    }
    if (params.maxTokens !== undefined
      && (!Number.isSafeInteger(params.maxTokens) || params.maxTokens <= 0)) {
      throw new TypeError('initialize maxTokens must be a positive safe integer')
    }
    const cwd = resolve(params.cwd)
    const provider = params.provider
    const model = params.model
    const reasoningEffort = params.reasoningEffort === undefined
      ? undefined
      : ReasoningEffortId(params.reasoningEffort)
    if (!this.hasAdapterFor(provider)) {
      if (provider !== 'deepseek-official') throw new Error(`no adapter registered for provider "${provider}"`)
      this.llmFiber = await this.ctx.plugin(LlmDeepSeek)
    }
    // Adapter presence was read from this service above; a successful fallback mount also requires it.
    const llm = this.ctx.get('llm') as LlmRuntime
    await llm.resolveCallConfig({
      provider,
      model,
      ...reasoningEffort === undefined ? {} : { reasoningEffort },
      ...params.maxTokens === undefined ? {} : { maxTokens: params.maxTokens },
    })
    this.cwd = cwd
    this.provider = provider
    this.model = model
    this.reasoningEffort = reasoningEffort
    this.maxTokens = params.maxTokens
    this.approvalRequests = params.approvalRequests === true
    this.userQuestions.enabled = params.capabilities?.userQuestions === true
    this.initialized = true
    this.initialization.resolve()
    return { serverInfo: { name: 'deepseek-harness-sdk-runtime', version: '0.0.1' } }
  }

  /**
   * Queue one identified prompt without assigning later activity to it.
   * @param params - target session and user content.
   * @returns the durable message identity.
   */
  async prompt(params: SessionPromptParams): Promise<SessionPromptResult> {
    if (!this.initialized) throw new Error('SDK server is not initialized')
    if (params.runId !== undefined && (typeof params.runId !== 'string' || params.runId.trim() === '')) {
      throw new TypeError('session/prompt runId must be a non-empty string')
    }
    const rec = await this.getOrCreateSession(params.sessionId)
    if (rec.runId !== undefined && params.runId !== undefined && rec.runId !== params.runId) {
      throw new Error(`SDK session is already bound to another run: ${params.sessionId}`)
    }
    rec.runId ??= params.runId
    const idempotencyKey = params.idempotencyKey
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '')) {
      throw new TypeError('session/prompt idempotencyKey must be a non-empty string')
    }
    const inputHash = createHash('sha256').update(JSON.stringify(params.contentBlocks)).digest('hex')
    if (idempotencyKey !== undefined) {
      const previous = rec.inputs.get(idempotencyKey)
      if (previous !== undefined) {
        if (previous.hash !== inputHash) throw new Error('idempotency key was already used with different prompt content')
        return previous.receipt
      }
      const receipt = this.enqueuePrompt(rec, params)
      rec.inputs.set(idempotencyKey, { hash: inputHash, receipt })
      try {
        return await receipt
      } catch (error) {
        if (rec.inputs.get(idempotencyKey)?.receipt === receipt) rec.inputs.delete(idempotencyKey)
        throw error
      }
    }
    return this.enqueuePrompt(rec, params)
  }

  private async enqueuePrompt(rec: SessionRecord, params: SessionPromptParams): Promise<SessionPromptResult> {
    // An agent-loop-only reload disposes the loop's agents while this record
    // survives; a retained agent accepts followup() silently, so validate the
    // record against the live registry before delivery.
    this.assertLiveAgent(rec, params.sessionId)
    const content = await durablePromptContent(this.ctx, params.contentBlocks)
    // Attachment admission crosses an async boundary where shutdown or an
    // agent-loop reload may detach the retained handle.
    this.assertLiveAgent(rec, params.sessionId)
    const message = createUserMessage({
      content,
      source: { kind: 'user' },
    })
    rec.handle.agent.followup(message)
    return { messageId: message.id }
  }

  /**
   * Restore a persisted session and repair its interrupted final turn without sending input.
   * Uses the initialized model route while preserving the stored session identity and directory.
   * Rejects missing, unreadable, or already owned sessions; never creates a replacement.
   * @param params - persisted session identity in the configured persistence store.
   * @returns an empty result after the Agent is ready for prompts.
   */
  async resume(params: SessionResumeParams): Promise<Record<string, never>> {
    if (!this.initialized) throw new Error('SDK server is not initialized')
    if (this.shuttingDown) throw new Error('SDK server is shutting down')
    const sessionId = params.sessionId
    const restoration = this.scheduledSessions.get(sessionId)
    if (restoration !== undefined) {
      this.scheduledSessions.delete(sessionId)
      const record = await restoration
      this.assertLiveAgent(record, sessionId)
      return {}
    }
    if (this.sessions.has(sessionId) || this.sessionCreations.has(sessionId)) {
      throw new Error(`SDK session is already open or opening: ${sessionId}`)
    }
    await this.openSession(sessionId, true)
    return {}
  }

  /**
   * Wait for an existing owned Agent and its managed descendants to finish.
   * The response follows all Session notifications emitted during the wait.
   * Rejects a live Agent failure that has no subsequent durable terminal.
   * @param params - the SDK-owned session to observe without creating one.
   * @returns an empty result after the root stays idle across the descendant check.
   */
  async wait(params: SessionWaitParams): Promise<Record<string, never>> {
    if (!this.initialized) throw new Error('SDK server is not initialized')
    const rec = this.sessions.get(params.sessionId)
    if (rec === undefined) throw new Error(`unknown SDK session: ${params.sessionId}`)
    const agent = rec.handle.agent
    const subagents = this.ctx.get('subagents')
    while (true) {
      this.assertLiveAgent(rec, params.sessionId)
      await agent.whenIdle()
      const idleSeq = agent.session.seq
      const children = await subagents?.waitForChildren(agent)
      this.assertLiveAgent(rec, params.sessionId)
      if (!children && agent.status === 'idle' && agent.session.seq === idleSeq) {
        if (rec.failure !== undefined) throw rec.failure.error
        return {}
      }
    }
  }

  async cancel(params: SessionCancelParams): Promise<Record<string, never>> {
    const rec = this.sessions.get(params.sessionId)
    if (rec === undefined) throw new Error(`unknown SDK session: ${params.sessionId}`)
    this.assertLiveAgent(rec, params.sessionId)
    rec.handle.agent.cancel({ kind: 'user' })
    await rec.handle.agent.whenIdle()
    await this.ctx.get('subagents')?.drainDescendants([rec.handle.agent])
    this.assertLiveAgent(rec, params.sessionId)
    return {}
  }

  async dispose(params: SessionDisposeParams): Promise<Record<string, never>> {
    const rec = this.sessions.get(params.sessionId)
    if (rec === undefined) return {}
    if (rec.handle.agent.status === 'running') {
      rec.handle.agent.cancel({ kind: 'user' })
      await rec.handle.agent.whenIdle()
    }
    await this.ctx.get('subagents')?.drainDescendants([rec.handle.agent])
    if (this.sessions.get(params.sessionId) === rec) this.sessions.delete(params.sessionId)
    await rec.handle.dispose()
    this.eventHistory.delete(params.sessionId)
    return {}
  }

  replay(params: SessionReplayParams): SessionReplayResult {
    if (!Number.isSafeInteger(params.afterSeq) || params.afterSeq < -1) {
      throw new TypeError('session/replay afterSeq must be an integer greater than or equal to -1')
    }
    const limit = params.limit ?? DEFAULT_REPLAY_LIMIT
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_REPLAY_EVENTS) {
      throw new TypeError(`session/replay limit must be between 1 and ${MAX_REPLAY_EVENTS}`)
    }
    if (!this.sessions.has(params.sessionId)) throw new Error(`unknown SDK session: ${params.sessionId}`)
    const history = this.eventHistory.get(params.sessionId) ?? []
    const oldestSeq = history[0]?.event.seq
    const latestSeq = history.at(-1)?.event.seq ?? 0
    const truncated = oldestSeq !== undefined && params.afterSeq < oldestSeq - 1
    return {
      events: history.filter(item => item.event.seq > params.afterSeq).slice(0, limit),
      ...(oldestSeq === undefined ? {} : { oldestSeq }),
      latestSeq,
      truncated,
    }
  }

  result(params: SessionResultParams): SessionResult {
    if (!this.sessions.has(params.sessionId)) throw new Error(`unknown SDK session: ${params.sessionId}`)
    const history = this.eventHistory.get(params.sessionId) ?? []
    const end = [...history].reverse().find(item => item.event.type === 'turn/end')
    if (end === undefined) throw new Error(`session has no completed turn: ${params.sessionId}`)
    const turnEnd = end.event
    if (turnEnd.type !== 'turn/end') throw new Error('invalid projected turn end')
    const assistant = [...history].reverse().find(item => item.event.type === 'assistant/message'
      && item.event.data.turn === turnEnd.data.turn)
    const answer = assistant?.event.type === 'assistant/message' ? [...assistant.event.data.message.content] : []
    const stopReason = turnEnd.data.reason.kind
    const status = successStatus(stopReason, this.options)
    const usage = assistant?.event.type === 'assistant/message' ? assistant.event.data.usage : undefined
    return {
      status,
      stopReason,
      answer,
      ...(usage === undefined ? {} : { usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } }),
    }
  }

  private ownsAgent(agent: Agent): boolean {
    const agents = this.ctx.agents
    if (agents.get(agent.id) !== agent) return false
    const liveAgents = agents.list()
    const ancestors = new Set([agent])
    for (const current of ancestors) {
      if (this.sessions.get(current.session.id)?.handle.agent === current) return true
      for (const parent of liveAgents) {
        if (agents.isOwnedBy(current.id, parent)) ancestors.add(parent)
      }
    }
    return false
  }

  private assertLiveAgent(rec: SessionRecord, sessionId: string): void {
    if (this.ctx.agents.get(rec.handle.agent.id) !== rec.handle.agent) {
      throw new Error(`session agent was disposed outside the server: ${sessionId}`)
    }
  }

  /**
   * Read a Session's effective directory, recovering a missing directory to its origin.
   * @param params - target Session; an unknown id creates it.
   * @returns the absolute effective directory.
   */
  async getWorkingDirectory(params: SessionWorkingDirectoryParams): Promise<SessionWorkingDirectoryResult> {
    const agent = await this.workingDirectoryAgent(params.sessionId)
    return { cwd: await this.ctx.workingDirectory.ensure(agent) }
  }

  /**
   * Change a Session's directory and queue its model-visible transition.
   * @param params - target Session and absolute or current-directory-relative path.
   * @returns the validated absolute directory; origin and permissions are unchanged.
   */
  async setWorkingDirectory(params: SessionWorkingDirectorySetParams): Promise<SessionWorkingDirectoryResult> {
    const agent = await this.workingDirectoryAgent(params.sessionId)
    return { cwd: await this.ctx.workingDirectory.set(agent, params.path) }
  }

  private async workingDirectoryAgent(sessionId: string): Promise<Agent> {
    if (!this.initialized) throw new Error('SDK server is not initialized')
    const rec = await this.getOrCreateSession(sessionId)
    this.assertLiveAgent(rec, sessionId)
    return rec.handle.agent
  }

  /**
   * Dispose server-owned agents, adapter, and subscriptions to quiescence.
   * Managed descendants drain before the root Agent handles and adapter are released.
   * The surrounding context remains running.
   * @returns empty JSON-RPC result.
   */
  shutdown(): Promise<Record<string, never>> {
    this.shutdownTask ??= this.performShutdown()
    return this.shutdownTask
  }

  private async performShutdown(): Promise<Record<string, never>> {
    this.shuttingDown = true
    this.lifetime.abort(new Error('SDK server is shutting down'))
    this.userQuestions.close()
    this.initialization.resolve()
    const pendingCreations = [...this.sessionCreations.values()]
    await Promise.allSettled(pendingCreations)
    this.sessionCreations.clear()
    this.scheduledSessions.clear()
    const records = [...this.sessions.values()]
    this.sessions.clear()
    this.eventHistory.clear()
    const failures: unknown[] = []
    while (this.disposers.length > 0) {
      try {
        this.disposers.pop()?.()
      } catch (error) {
        failures.push(error)
      }
    }
    try {
      await this.ctx.get('subagents')?.drainDescendants(records.map(rec => rec.handle.agent))
    } catch (error: unknown) {
      failures.push(error)
    }
    const teardownResults = await Promise.allSettled([
      ...records.map(rec => Promise.resolve().then(() => rec.handle.dispose())),
      ...(this.llmFiber === undefined ? [] : [Promise.resolve().then(() => this.llmFiber?.dispose())]),
    ])
    this.llmFiber = undefined
    failures.push(...teardownResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map(result => result.reason as unknown))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'SDK server teardown failed')
    return {}
  }

  /**
   * Dispatch one incoming JSON-RPC request to its typed handler. Throws (→ a
   * JSON-RPC error response) on an unknown method.
   * @param method - the JSON-RPC method name.
   * @param params - the raw params object from the wire.
   * @returns the handler's result, to be serialized as the response.
   */
  async handleRequest(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return this.initialize(params as unknown as InitializeParams)
      case 'session/prompt':
        return this.prompt(params as unknown as SessionPromptParams)
      case 'session/resume': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          throw new TypeError('session/resume requires a non-empty sessionId string')
        }
        return this.resume({ sessionId })
      }
      case 'session/wait': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string') throw new TypeError('session/wait requires a sessionId string')
        return this.wait({ sessionId })
      }
      case 'session/cancel': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) throw new TypeError('session/cancel requires a non-empty sessionId string')
        const reason = params?.reason
        return this.cancel({ sessionId, ...(typeof reason === 'string' ? { reason } : {}) })
      }
      case 'session/dispose': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) throw new TypeError('session/dispose requires a non-empty sessionId string')
        return this.dispose({ sessionId })
      }
      case 'session/replay': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) throw new TypeError('session/replay requires a non-empty sessionId string')
        const afterSeq = params?.afterSeq
        const limit = params?.limit
        return this.replay({ sessionId, afterSeq: afterSeq as number, ...(limit === undefined ? {} : { limit: limit as number }) })
      }
      case 'session/result': {
        const sessionId = params?.sessionId
        if (typeof sessionId !== 'string' || sessionId.length === 0) throw new TypeError('session/result requires a non-empty sessionId string')
        return this.result({ sessionId })
      }
      case 'session/working-directory/get':
      case 'session/working-directory/set': {
        if (typeof params?.sessionId !== 'string' || params.sessionId.length === 0) {
          throw new TypeError('working-directory requests require a non-empty sessionId')
        }
        if (method === 'session/working-directory/get') {
          return this.getWorkingDirectory({ sessionId: params.sessionId })
        }
        if (typeof params.path !== 'string') throw new TypeError('working-directory set requires a path string')
        return this.setWorkingDirectory({ sessionId: params.sessionId, path: params.path })
      }
      case 'shutdown':
        return this.shutdown()
      default:
        throw new Error(`unknown DeepSeek Harness SDK runtime method: ${method}`)
    }
  }

  private async getOrCreateSession(sessionId: string): Promise<SessionRecord> {
    if (this.shuttingDown) throw new Error('SDK server is shutting down')
    this.scheduledSessions.delete(sessionId)
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const pending = this.sessionCreations.get(sessionId)
    if (pending) return pending
    return this.openSession(sessionId, false)
  }

  private openSession(sessionId: string, resume: boolean): Promise<SessionRecord> {
    const creation = this.createSession(sessionId, resume)
    this.sessionCreations.set(sessionId, creation)
    void creation.then(
      () => { this.sessionCreations.delete(sessionId) },
      () => { this.sessionCreations.delete(sessionId) },
    )
    return creation
  }

  private async createSession(sessionId: string, resume: boolean): Promise<SessionRecord> {
    // No preset composition: this server's compositions keep the model-facing
    // rows in the host plane, so this agent reads them from the global layer. A
    // deployment that configures a roster has to join one here first
    // (@deepseek-ai/dsh-agent-preset-registry README, "Composing a child agent").
    const agentOptions = {
      provider: this.provider,
      model: this.model,
      ...this.reasoningEffort === undefined ? {} : { reasoningEffort: this.reasoningEffort },
      ...this.maxTokens === undefined ? {} : { maxTokens: this.maxTokens },
    }
    const handle = await (resume ? this.ctx.agents.resume({
      resumeSessionId: brandString<SessionId>(sessionId),
      agentOptions,
      // The initialized route replaces the restored Session's model selection.
      setup: (_agentCtx, agent) => {
        const previous = agent.model.current()
        const selection = { ...agentOptions }
        if (selection.reasoningEffort === undefined && previous !== undefined
          && previous.provider === selection.provider && previous.model === selection.model
          && previous.reasoningEffort !== undefined) {
          selection.reasoningEffort = previous.reasoningEffort
        }
        agent.model.select(selection)
      },
    }) : this.ctx.agents.create({
      sessionId: brandString<SessionId>(sessionId),
      meta: { cwd: this.cwd },
      agentOptions,
    }))
    const rec: SessionRecord = { handle, runId: undefined, failure: undefined, inputs: new Map() }
    this.sessions.set(sessionId, rec)
    return rec
  }

  private hasAdapterFor(provider: string): boolean {
    return this.ctx.get('llm')?.listProviders().some(entry => entry.id === provider) ?? false
  }
}
