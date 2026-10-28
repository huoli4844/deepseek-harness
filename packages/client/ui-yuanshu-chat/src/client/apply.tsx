import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { AskKnowledgeQuestionRequest, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ChatPanel } from './ChatPanel.tsx'
import { NS, en, zh, type YuanShuChatKey } from './locales.ts'
import type { YuanShuChatInjected } from './ChatPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'yuanshu-chat': YuanShuChatKey
  }
}

export const inject = ['slots', 'locale']

async function* askQuestionStream(
  request: AskKnowledgeQuestionRequest,
  token: string | undefined,
  signal?: AbortSignal,
): AsyncIterable<YuanShuSseEvent> {
  const response = await fetch('/yuanshu-api/qa/ask/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(request),
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`YuanShu Q&A request failed with HTTP ${String(response.status)}`)
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
  const token = window.localStorage.getItem('yuanshu-token') ?? undefined

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yuanshu-chat: dictionaries')

  const t = ctx.locale.bind(NS)
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'yuanshu-chat',
    order: 100,
    label: () => t('viewTab'),
    locale: NS,
    inject: (): YuanShuChatInjected => ({
      askQuestionStream: (request, signal) => askQuestionStream(request, token, signal),
    }),
  }, ChatPanel))
}
