import { YuanshuClient } from './client.js'
import type { YuanshuConfig } from './types.js'

export { YuanshuClient } from './client.js'
export type {
  YuanshuConfig,
  NLQueryRequest,
  NLQueryResponse,
  QARequest,
  QAStreamEvent,
  AgentExecuteRequest,
  AgentStreamEvent,
  MCPTool,
  Skill,
  Scenario
} from './types.js'

export interface YuanshuGatewayConfig extends YuanshuConfig {
  name?: string
}

export function apply(ctx: any, config: YuanshuGatewayConfig): void {
  const client = new YuanshuClient(config)
  const name = config.name ?? 'yuanshu'

  ctx.effect(() => {
    ctx.provide(name, client)
    return () => {
      ctx.remove(name)
    }
  }, `yuanshu-gateway: ${name}`)
}

export const name = 'yuanshu-gateway'
export const inject = ['webServer'] as const
export const Config = {
  baseUrl: { type: 'string' as const, required: true as const },
  apiKey: { type: 'string' as const, required: false as const },
  timeout: { type: 'number' as const, required: false as const, default: 30000 },
  name: { type: 'string' as const, required: false as const }
}
