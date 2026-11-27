/** 业务登记宿主：只为已绑定会话打开预填表单，不提供模型写入能力。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { BusinessForms } from '../yuanshu-business-forms/index.ts'
import { registerBusinessCreationSkills } from './capability-skill.ts'
import { createSwaggerLookup } from './swagger-create-catalog.ts'
import type { EmployeeAccessStore } from '../../employee-access.ts'
import { createDynamicRegistry } from './dynamic-registry.ts'
import { checkActionAccess, createAccessError } from './action-access.ts'
import { registerSwaggerLogin } from './swagger-login-route.ts'

/** 注册从云端目录发现的业务登记表单；客户端不得替另一会话读取或关闭。 */
export function registerEquipmentIntake(ctx: Context, forms: BusinessForms, skills: {
  readonly create: string
  readonly capabilities: string
}, api: string, access?: EmployeeAccessStore) {
  const lifetime = new AbortController()
  const previewEnabled = process.env.DSH_YUANSHU_FORM_PREVIEW === '1'
  const lookup = createSwaggerLookup(api, lifetime.signal, previewEnabled)
  ctx.effect(() => () => { lifetime.abort() }, 'yuanshu: close Swagger create discovery')
  registerSwaggerLogin(ctx, lookup)
  const dynamic = createDynamicRegistry(forms, lookup, api, lifetime.signal, access, previewEnabled)
  registerBusinessCreationSkills(ctx, skills)
  ctx.tools.register(defineTool({
    name: 'business_find_create_target',
    description: '根据业务对象名称或已核实的表名，查询新增表单是否就绪，或后台是否有新增契约。请传入对象名称，省略新建等动词。此工具只查询能力。',
    parameters: { target: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent || agent.session.header.origin === 'subagent' || forms.require(agent.id).session !== agent.session) {
        throw new Error('需要已绑定企业账号的工作台会话')
      }
      const target = args.target.trim()
      if (!target || target.length > 128) return JSON.stringify({ state: 'unknown' })
      const lease = forms.require(agent.id)
      if (previewEnabled) {
        const previews = await lookup.previewTargets(target)
        forms.browser(agent.id, lease.credential)
        if (previews && previews.length > 1) return JSON.stringify({ state: 'ambiguous', candidates: previews.map(item => item.title) })
        const [preview] = previews ?? []
        if (preview) return JSON.stringify({ state: 'preview_ready', object: preview.title, open_form: 'business_open_dynamic_create',
          operation_id: preview.operationId, fields: preview.fields.map(item => item.key),
          required: preview.fields.filter(item => item.required).map(item => item.key), field_guide: preview.fields })
        const discovered = await lookup.findCreate(target)
        forms.browser(agent.id, lease.credential)
        return JSON.stringify(discovered)
      }
      const actions = await lookup.dynamicTargets(target)
      forms.browser(agent.id, lease.credential)
      if (actions && actions.length > 1) return JSON.stringify({ state: 'ambiguous', candidates: actions.map(action => action.title) })
      const [action] = actions ?? []
      if (action) {
        const result = await checkActionAccess(forms, lease, access, action.permission)
        if (result !== 'permission_granted') return JSON.stringify({ state: result, object: action.title })
        return JSON.stringify({ state: 'form_ready', object: action.title, open_form: 'business_open_dynamic_create',
          operation_id: action.operationId, fields: action.fields.map(item => item.key),
          required: action.fields.filter(item => item.required).map(item => item.key), field_guide: action.fields })
      }
      const discovered = await lookup.findCreate(target)
      forms.browser(agent.id, lease.credential)
      return JSON.stringify(discovered)
    },
  }))
  ctx.tools.register(defineTool({
    name: 'business_find_service_operations',
    description: '按业务关键词或 HTTP 方法查询云端服务目录，例如“项目 POST”。结果为接口文档，实际办理能力与员工权限需要分别核实。',
    parameters: { query: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent || agent.session.header.origin === 'subagent' || forms.require(agent.id).session !== agent.session) {
        throw new Error('需要已绑定企业账号的工作台会话')
      }
      const query = args.query.trim()
      if (!query || query.length > 128) throw new Error('请提供具体业务关键词')
      const lease = forms.require(agent.id)
      const result = await lookup.search(query)
      forms.browser(agent.id, lease.credential)
      if (!result.operations) return JSON.stringify(result)
      const operations = await Promise.all(result.operations.map(async ({ permission, ...summary }) => {
        return { ...summary, permission_state: await checkActionAccess(forms, lease, access, permission) }
      }))
      return JSON.stringify({ ...result, operations })
    },
  }))
  ctx.tools.register(defineTool({
    name: 'business_open_dynamic_create',
    description: '用能力查询返回的 operation_id 和字段打开新增复核表单。只预填，不执行保存。',
    parameters: { operation_id: { type: 'string', required: true },
      content: { type: 'object', required: true, additionalProperties: true } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const agent = exec.agent
      if (!agent || agent.session.header.origin === 'subagent') throw new Error('需要已绑定企业账号的工作台会话')
      const lease = forms.require(agent.id)
      if (lease.session !== agent.session) throw new Error('需要已绑定企业账号的工作台会话')
      if (previewEnabled) {
        const preview = await lookup.previewOperation(args.operation_id)
        forms.browser(agent.id, lease.credential)
        if (!preview) throw new Error('此接口未提供可预览的表单字段')
        if (dynamic.pending(agent.id)) return '当前会话已有一张待核对表单。'
        dynamic.openPreview(agent.id, preview, args.content)
        return '已打开联调预览，确认只模拟保存，不会写入后台。'
      }
      const action = await lookup.dynamicOperation(args.operation_id)
      const result = await checkActionAccess(forms, lease, access, action?.permission)
      if (result !== 'permission_granted') throw createAccessError(result)
      if (!action) throw new Error('登记动作暂不可用')
      if (dynamic.pending(agent.id)) return '当前会话已有一张待核对表单。'
      dynamic.open(agent.id, action, args.content)
      return '已打开业务复核表单，等待本人核对和保存。'
    },
  }))
  return dynamic
}
