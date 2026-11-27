/** 对话工具：在只读接口目录中检索，并以当前员工身份实时查询后台数据。 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { API_CATALOG } from './catalog.generated.ts'
import { DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT } from './model.ts'
import { ApiQueryError, queryApi } from './query.ts'
import { apiEntriesToWire, searchApiCatalog } from './search.ts'
import type { BusinessForms } from '../plugins/yuanshu-business-forms/index.ts'

/**
 * 注册只读查询工具；模型只能看到目录与裁剪后的结果，拿不到令牌。
 * @param ctx - 插件上下文。
 * @param forms - 已校验账号租约的表单运行时，用于取得当前员工凭证。
 * @param api - 后台业务服务地址。
 */
export function registerApiQueryTools(ctx: Context, forms: BusinessForms, api: string): void {
  ctx.tools.register(defineTool({
    name: 'yuanshu_api_search',
    description: '在公司只读接口目录中检索可查询的数据。先调用它找到准确接口，再用 yuanshu_api_query 查询。'
      + 'query 用员工说的业务词，例如「客户」「供应商」「项目质量异常」；没有命中就如实说明无法查询，不要编造数据。',
    parameters: {
      query: { type: 'string', required: true, description: '要查什么，用业务词描述，例如「客户」「供应商」「质量记录」。' },
      tag: { type: 'string', description: '模块名，用于按业务模块收窄；通常省略。' },
      limit: { type: 'number', description: '返回条目数，默认 8，最多 20。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute(args, exec) {
      assertMainSession(exec.agent)
      const entries = searchApiCatalog(API_CATALOG, args.query, {
        ...(args.tag === undefined ? {} : { tag: args.tag }),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      })
      const payload = entries.length === 0
        ? { count: 0, hits: [], hint: '目录中没有匹配的只读查询接口。请如实告知员工当前无法查询这类数据，不要猜测或编造结果。' }
        : { count: entries.length, hits: apiEntriesToWire(entries) }
      return Promise.resolve(JSON.stringify(payload))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuanshu_api_query',
    description: '按目录中的接口路径实时查询当前员工可见的数据，自动使用本人身份与当前租户。'
      + 'path 必须来自 yuanshu_api_search 的结果；参数只能用目录声明的名称。返回结果已按条数裁剪。',
    parameters: {
      path: { type: 'string', required: true, description: '接口路径，原样使用 yuanshu_api_search 返回的 path。' },
      params: {
        type: 'object',
        additionalProperties: true,
        description: '查询参数，键名来自目录中该接口的 params；路径参数和必填参数必须提供，没有参数时省略。',
      },
      limit: { type: 'number', description: '返回记录数，默认 20，最多 50。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const agent = assertMainSession(exec.agent)
      const entry = API_CATALOG.find(item => item.path === args.path)
      if (entry === undefined) throw new Error('该路径不在只读查询目录中，请先调用 yuanshu_api_search 找到准确路径')
      const lease = forms.require(agent.id)
      if (lease.session !== agent.session) throw new Error('需要已绑定企业账号的工作台会话')
      const limit = Math.min(Math.max(args.limit ?? DEFAULT_QUERY_LIMIT, 1), MAX_QUERY_LIMIT)
      const params = toParamRecord(args.params)
      const started = Date.now()
      try {
        const text = await queryApi({
          api,
          entry,
          params,
          limit,
          credential: { authorization: lease.credential.authorization, tenant: lease.credential.tenant },
          signal: exec.signal,
        })
        ctx.logger.info(`yuanshu: api query ${entry.path} ok ${Date.now() - started}ms`)
        return text
      } catch (error) {
        ctx.logger.warn(`yuanshu: api query ${entry.path} failed ${Date.now() - started}ms`)
        if (error instanceof ApiQueryError) throw new Error(error.message)
        throw new Error('查询失败，请稍后再试')
      }
    },
  }))
}

/**
 * 只允许主会话调用；子代理没有经过核实的员工账号租约。
 * @param agent - 当前执行会话。
 * @returns 当前会话。
 */
function assertMainSession(agent: Agent | undefined): Agent {
  if (!agent || agent.session.header.origin === 'subagent') throw new Error('请在员工对话中使用企业数据查询')
  return agent
}

/**
 * 把模型传来的参数对象转成字符串键值，数组用逗号分隔。
 * @param value - 模型提供的参数对象。
 * @returns 参数键值。
 */
function toParamRecord(value: unknown): Record<string, string> {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('params 必须是参数对象')
  const record: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') record[key] = raw
    else if (typeof raw === 'number' || typeof raw === 'boolean') record[key] = String(raw)
    else if (Array.isArray(raw) && raw.every(item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')) {
      record[key] = raw.map(item => String(item)).join(',')
    } else throw new Error(`参数 ${key} 的值需要是字符串、数字或布尔值`)
  }
  return record
}
