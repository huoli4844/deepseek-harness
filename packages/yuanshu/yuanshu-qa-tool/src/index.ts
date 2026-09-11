import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { AskKnowledgeQuestionRequest } from '@deepseek-ai/dsh-yuanshu-client'
import type { AskKnowledgeQuestionResponse } from '@deepseek-ai/dsh-yuanshu-client'

export const name = 'yuanshu-qa-tool'
export const inject = ['tools']

export interface Config {
  /** Base URL of the YuanShu platform API. */
  readonly baseURL: string
  /** Optional authentication token. */
  readonly token?: string
  /** Default worker type for the generic yuanshu_agent tool (not used here). */
  readonly defaultWorkerType?: string
  /** Whether to use streaming mode. When true, uses SSE stream instead of sync call. */
  readonly streaming?: boolean
}

export const Config: z<Config> = z.object({
  baseURL: z.string().required(),
  token: z.string(),
  defaultWorkerType: z.string(),
  streaming: z.boolean().optional(),
})

/**
 * Format a Q&A answer with citations for model consumption.
 *
 * Output is a single structured string containing:
 *   - The synthesized answer
 *   - A numbered list of citations with document title and evidence ID
 *
 * This format is model-friendly and can be rendered by the tool's
 * output renderer into a rich card with clickable citations.
 */
function formatAnswer(result: AskKnowledgeQuestionResponse): string {
  const lines: string[] = []
  lines.push('ANSWER:')
  lines.push(result.answer)
  lines.push('')

  if (result.citations && result.citations.length > 0) {
    lines.push('CITATIONS:')
    result.citations.forEach((cite, idx) => {
      const title = cite.title ?? `Document ${cite.document_id}`
      const preview = cite.content_preview ? ` — ${cite.content_preview.slice(0, 200)}` : ''
      lines.push(`${idx + 1}. [${title}] (evidence_id: ${cite.evidence_id}, document_id: ${cite.document_id}${preview})`)
    })
  }

  if (result.system_facts && Object.keys(result.system_facts).length > 0) {
    lines.push('')
    lines.push('SYSTEM FACTS:')
    lines.push(JSON.stringify(result.system_facts, null, 2))
  }

  if (result.diagnostics) {
    lines.push('')
    lines.push('DIAGNOSTICS:')
    lines.push(JSON.stringify(result.diagnostics, null, 2))
  }

  return lines.join('\n')
}

export function apply(ctx: Context, config: Config): void {
  const client = new YuanShuClient({
    baseURL: config.baseURL,
    ...(config.token === undefined ? {} : { token: config.token }),
  })

  // ── yuanshu_qa: Knowledge Q&A tool ────────────────────────────────────

  const qaTool = defineTool({
    name: 'yuanshu_qa',
    description:
      'Query the YuanShu knowledge base for intelligent Q&A. Supports multi-turn conversation via session_id, ' +
      'scoped retrieval via collection_ids, and configurable thinking depth. Returns answers with citations.',
    parameters: {
      question: {
        type: 'string' as const,
        required: true as const,
        description: 'The question or task to ask the knowledge base',
      },
      session_id: {
        type: 'string' as const,
        description:
          'Session ID for multi-turn conversation. Omit or provide empty string to start a new session.',
      },
      collection_ids: {
        type: 'array' as const,
        description:
          'Restrict retrieval to specific knowledge collections. Empty or omit for full-scope retrieval.',
      },
      application_id: {
        type: 'number' as const,
        description: 'Application ID to use for application-scoped strategy.',
      },
      thinking_mode: {
        type: 'string' as const,
        description:
          'Thinking depth: none (fast), light, medium (default), heavy, ultra (thorough). ' +
          'Affects evidence sufficiency checks and supplemental rounds.',
      },
    },
    output: {
      schema: { type: 'string' as const },
      render: (_args, value) => {
        const text = String(value)
        return [{ type: 'text', text }]
      },
    },
    execute: async (args) => {
      const request: AskKnowledgeQuestionRequest = {
        question: String(args.question ?? '').trim(),
        ...(args.session_id ? { session_id: String(args.session_id) } : {}),
        ...(args.collection_ids && Array.isArray(args.collection_ids) && args.collection_ids.length > 0
          ? { collection_ids: args.collection_ids as number[] }
          : {}),
        ...(args.application_id ? { application_id: args.application_id as number } : {}),
        ...(args.thinking_mode ? { thinking_mode: args.thinking_mode as AskKnowledgeQuestionRequest['thinking_mode'] } : {}),
      }

      if (!request.question) {
        throw new Error('yuanshu_qa: question is required and must be non-empty')
      }

      let result: AskKnowledgeQuestionResponse
      try {
        if (config.streaming) {
          // Streaming mode: collect all events and return final answer
          const events = []
          for await (const event of client.askQuestionStream(request)) {
            events.push(event)
          }
          // Find the "complete" event to extract the answer
          const completeEvent = events.find(e => e.event === 'complete')
          if (completeEvent && typeof completeEvent.data === 'object') {
            const data = completeEvent.data as AskKnowledgeQuestionResponse
            result = data
          } else {
            result = {
              session_id: '',
              turn_id: '',
              trace_id: '',
              execution_trace_id: '',
              answer_trace_id: '',
              agent_name: 'yuanshu_qa',
              agent_mode: 'streaming_fallback',
              answer: 'Streaming completed but no final answer found.',
              answer_mode: 'fallback',
              answer_artifact_reused: false,
              citations: [],
              created_at: new Date().toISOString(),
            }
          }
        } else {
          result = await client.askQuestion(request)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`YuanShu Q&A failed: ${message}`)
      }

      return formatAnswer(result)
    },
  })

  ctx.effect(() => {
    ctx.tools.register(qaTool)
    return () => {}
  }, 'yuanshu-qa-tool: register')
}
