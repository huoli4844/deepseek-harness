import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { YuanShuExecuteRequest } from '@deepseek-ai/dsh-yuanshu-client'

export const name = 'yuanshu-tool'
export const inject = ['tools']

export interface Config {
  readonly baseURL: string
  readonly token?: string
  readonly defaultWorkerType?: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string().required(),
  token: z.string(),
  defaultWorkerType: z.string().default('general_assistant'),
})

export function apply(ctx: Context, config: Config): void {
  const client = new YuanShuClient({
    baseURL: config.baseURL,
    ...(config.token === undefined ? {} : { token: config.token }),
  })

  const tool = defineTool({
    name: 'yuanshu_agent',
    description: 'Forward a question to YuanShu platform agent (智能问数Agent, 知识库问答Agent, etc.) and get the answer. Use this when you need to query data or get knowledge-based answers from the YuanShu platform.',
    parameters: {
      task: { type: 'string' as const, required: true as const, description: 'The question or task to send to YuanShu agent' },
      worker_type: { type: 'string' as const, description: 'The worker type to use (default: general_assistant)' },
      session_id: { type: 'string' as const, description: 'Session ID for multi-turn conversation' },
    },
    output: {
      schema: { type: 'string' as const },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: async (args) => {
      const workerType = args.worker_type ?? config.defaultWorkerType ?? 'general_assistant'
      const request: YuanShuExecuteRequest = {
        task: args.task,
        worker_type: workerType,
        ...(args.session_id === undefined ? {} : { session_id: args.session_id }),
      }

      try {
        const result = await client.executeWorker(request)
        return JSON.stringify(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`YuanShu agent execution failed: ${message}`)
      }
    },
  })

  ctx.effect(() => {
    ctx.tools.register(tool)
    return () => {}
  }, 'yuanshu-tool: register')
}
