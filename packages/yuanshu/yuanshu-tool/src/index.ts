import { EnterpriseService } from './enterprise.ts'
export { EnterpriseService } from './enterprise.ts'
export type { EnterpriseAuthorization } from './types.ts'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { YuanShuClient } from '@deepseek-ai/dsh-yuanshu-client'
import type { YuanShuExecuteRequest } from '@deepseek-ai/dsh-yuanshu-client'

export const name = 'yuanshu-tool'
export const inject = ['tools', 'credentials', 'typert', 'agents']

/** YuanShu worker tool endpoint, credentials, and default worker choice. */
export interface Config {
  /** Base URL of the YuanShu platform API. */
  readonly baseURL: string
  /** Instance bearer credential accepted only in explicit legacy-http mode. */
  readonly token?: string
  /** Worker type used when the tool input omits `worker_type`. */
  readonly defaultWorkerType?: string
  /** Explicit migration mode; MCP never falls back after failure. */
  readonly enterpriseTransport?: 'mcp' | 'legacy-http'
  /** Expected authorization server issuer; defaults to the platform base URL. */
  readonly mcpIssuer?: string
  /** MCP resource audience; defaults to the platform client MCP endpoint. */
  readonly mcpResource?: string
  /** Pre-registered OAuth client identifier. */
  readonly mcpClientId?: string
  /** Registered callback URI used with PKCE authorization. */
  readonly mcpRedirectUri?: string
  /** Timeout in milliseconds for each ordinary MCP request. */
  readonly mcpTimeoutMs?: number
  /** Maximum pages accepted from an authorized capability catalog. */
  readonly maxCatalogPages?: number
  /** Maximum capabilities selected for one local task. */
  readonly maxSelectedTools?: number
  /** Maximum capability descriptions returned by one catalog selection. */
  readonly catalogResultLimit?: number
  /** Maximum UTF-8 bytes of a complete resource JSON returned to the model. */
  readonly maxResourceResultBytes?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string().required(),
  token: z.string(),
  defaultWorkerType: z.string().default('general_assistant'),
  enterpriseTransport: z.union(['mcp', 'legacy-http']).default('mcp'),
  mcpIssuer: z.string(), mcpResource: z.string(), mcpClientId: z.string(), mcpRedirectUri: z.string(),
  mcpTimeoutMs: z.number().min(1).default(30_000), maxCatalogPages: z.number().min(1).max(1024).default(64),
  maxSelectedTools: z.number().min(1).max(100).default(12), catalogResultLimit: z.number().min(1).max(200).default(30),
  maxResourceResultBytes: z.number().min(1).max(2_097_152).default(65_536),
})

export function apply(ctx: Context, config: Config): void {
  if ((config.enterpriseTransport ?? 'mcp') === 'mcp') {
    if (config.token !== undefined) throw new Error('MCP user mode forbids instance-level bearer credentials')
    ctx.plugin(EnterpriseService, config)
    return
  }
  // 身份唯一：工具不再读取 `~/.dsh/yuanshu-token` 或 `YUANSHU_TOKEN`。
  // 那两条回落会让界面（浏览器 token）与工具（文件/环境变量）使用两个
  // 不同的 principal，出现“界面能看到、工具却以管理员身份执行”的错配。
  // 没有显式凭据时不注册工具，避免 Agent 调用一个必然失败的入口。
  const token = config.token
  if (!token) return

  const client = new YuanShuClient({ baseURL: config.baseURL, token })

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
      render: (_args, value) => [{ type: 'text', text: value }],
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

  ctx.effect(() => ctx.tools.register(tool), 'yuanshu-tool: register')
}
