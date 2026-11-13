import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-yuanshu-tool/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { AskKnowledgeQuestionRequest, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ChatPanel } from './ChatPanel.tsx'
import { EnterpriseWorkbench, type EnterpriseWorkbenchInjected } from './EnterpriseWorkbench.tsx'
import { enterpriseResourceProvider } from './enterprise-resource.ts'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import { YuanShuIcon } from './YuanShuIcon.tsx'
import { NS, en, zh, type YuanShuChatKey } from './locales.ts'
import type { YuanShuChatInjected } from './ChatPanel.tsx'
import { readActiveTenant, readAuthToken } from './storage.ts'
import { WorkbenchRequestError, toCapabilityOptions } from './workbench.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'yuanshu-chat': YuanShuChatKey
  }
}

export const inject = ['slots', 'locale', 'remote', 'resources']

/** 读取当前请求的 Authorization。每次调用都重新读取，登录后无需刷新页面。 */
function authHeaders(): Record<string, string> {
  const token = readAuthToken()
  return token === undefined ? {} : { Authorization: `Bearer ${token}` }
}

/** 请求头：身份 + 用户在工作台选择的租户。租户必须逐请求携带，元枢才不会退回默认租户。 */
function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const tenant = readActiveTenant()
  return {
    ...extra,
    ...authHeaders(),
    ...(tenant === undefined ? {} : { 'X-Active-Tenant': tenant }),
  }
}

/** 解析网关错误体，保留元枢业务错误码。 */
function requestError(payload: unknown, status: number, fallback: string): WorkbenchRequestError {
  const record = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : undefined
  const message = typeof record?.error === 'string' && record.error.length > 0 ? record.error : fallback
  const code = typeof record?.code === 'number' || typeof record?.code === 'string' ? record.code : undefined
  return new WorkbenchRequestError(message, status, code)
}

/** 同源网关 JSON 请求。状态码必须保留给界面区分 401/403/404/429。 */
async function gatewayRequest<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = requestHeaders({ Accept: 'application/json' })
  const request: RequestInit = { method: init.method ?? 'GET', headers, ...init.signal === undefined ? {} : { signal: init.signal } }
  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    request.body = JSON.stringify(init.body)
  }
  const response = await fetch(`/yuanshu-api${path}`, request)
  const text = await response.text()
  let payload: unknown
  try {
    payload = text.length === 0 ? undefined : JSON.parse(text)
  } catch {
    payload = undefined
  }
  if (!response.ok) throw requestError(payload, response.status, text || response.statusText)
  return payload as T
}

/** 生成一次能力运行的幂等键；DAG 调用重复提交时复用首次运行。 */
function idempotencyKey(): string {
  return randomUUID()
}

async function* askQuestionStream(
  request: AskKnowledgeQuestionRequest,
  signal?: AbortSignal,
): AsyncIterable<YuanShuSseEvent> {
  const response = await fetch('/yuanshu-api/qa/ask/stream', {
    method: 'POST',
    headers: requestHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(request),
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) {
    let payload: unknown
    try {
      payload = JSON.parse(await response.text())
    } catch {
      payload = undefined
    }
    throw requestError(payload, response.status, `YuanShu Q&A request failed with HTTP ${String(response.status)}`)
  }
  if (response.body === null) throw new Error('YuanShu Q&A response has no event stream')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'
  let data: string[] = []
  const flush = (): YuanShuSseEvent | undefined => {
    if (data.length === 0) return undefined
    const raw = data.join('\n')
    let value: unknown = raw
    try { value = JSON.parse(raw) } catch { /* SSE data may be plain text. */ }
    const result = { event, data: value }
    event = 'message'
    data = []
    return result
  }

  let complete = false
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      const lines = buffer.split(/\r?\n/u)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line === '') {
          const value = flush()
          if (value !== undefined) yield value
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).trimStart())
        }
      }
      if (chunk.done) {
        complete = true
        break
      }
    }
    const value = flush()
    if (value !== undefined) yield value
  } finally {
    if (!complete) {
      try {
        await reader.cancel()
      } catch (_cancelledReader) {
        // The response stream may already have failed or been aborted.
      }
    }
    reader.releaseLock()
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yuanshu-chat: dictionaries')

  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.resources.register(enterpriseResourceProvider((path, signal) => gatewayRequest(path, { signal }))), 'yuanshu: enterprise resources')
  const capabilityActions: YuanShuChatInjected = {
    authorizeSession: async (sessionId) => {
      const consoleToken = readAuthToken(), tenant = readActiveTenant()
      if (consoleToken === undefined || tenant === undefined) throw new Error('Select the current platform user and tenant before authorization')
      const result = await ctx.remote.yuanshuEnterprise.authorize({ sessionId, consoleToken, tenant, scope: 'enterprise:read enterprise:execute' })
      if (!result.ok) throw new Error(result.error.message)
    },
    revokeSession: async (sessionId) => {
      const result = await ctx.remote.yuanshuEnterprise.revoke(sessionId)
      if (!result.ok) throw new Error(result.error.message)
    },
    askQuestionStream: (request, signal) => askQuestionStream(request, signal),
    listCapabilities: async () => toCapabilityOptions(await gatewayRequest<unknown>('/capabilities')),
    runSkill: (id, input) => gatewayRequest(`/skills/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      body: { input_data: input, idempotency_key: idempotencyKey() },
    }),
    runAlgorithm: (id, input) => gatewayRequest(`/algorithms/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      body: { input_data: input, draft: false, idempotency_key: idempotencyKey() },
    }),
    invokeDag: (id, input) => gatewayRequest(`/dag/definitions/${encodeURIComponent(id)}/invoke`, {
      method: 'POST',
      body: {
        ...(input === undefined ? {} : { input }),
        idempotency_key: idempotencyKey(),
      },
    }),
    listAlgorithmExecutions: id => gatewayRequest(
      `/algorithms/${encodeURIComponent(id)}/executions?page=1&page_size=20`,
    ),
    listDagHistory: (limit, dagDefinitionId) => {
      const query = new URLSearchParams({ page: '1', page_size: String(limit ?? 20) })
      if (dagDefinitionId !== undefined) query.set('dag_definition_id', dagDefinitionId)
      return gatewayRequest(`/dag/history?${query.toString()}`)
    },
    getDagHistoryDetail: id => gatewayRequest(`/dag/history/${encodeURIComponent(id)}`),
  }

  // 会话内入口保留为知识问答；工作台成为元枢的主入口。
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'yuanshu-chat',
    order: 100,
    label: () => t('qaTab'),
    locale: NS,
    inject: (): YuanShuChatInjected => capabilityActions,
  }, ChatPanel))

  // 主视图：左侧列出元枢后台可提供给 DSH 的能力分组。
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: 'yuanshu',
    locale: NS,
    inject: (): EnterpriseWorkbenchInjected => ({
      authorize: () => gatewayRequest('/mcp/authorize', { method: 'POST', body: { consent: 'approve', scope: 'enterprise:read enterprise:execute' } }),
      revoke: () => gatewayRequest('/mcp/revoke', { method: 'POST' }),
      call: (name, args, continuation) => gatewayRequest('/mcp/call', { method: 'POST', body: { name, arguments: args, ...continuation } }),
    }),
  }, EnterpriseWorkbench))

  // 侧栏入口：点击后由布局切到同 key 的 main 面板。
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: 'yuanshu',
    order: 30,
    label: () => t('workbenchLabel'),
    locale: NS,
  }, YuanShuIcon))
}
