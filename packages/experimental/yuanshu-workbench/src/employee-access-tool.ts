/** 会话只读工具仅返回当前员工在当前租户的授权信息。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { EmployeeAccessStore } from './employee-access.ts'
import type { BusinessForms } from './plugins/yuanshu-business-forms/index.ts'

/** 从已验证的会话绑定读取权限，模型不能指定查询对象或租户。 */
export function registerEmployeeAccessTool(ctx: Context, forms: BusinessForms, store: EmployeeAccessStore): void {
  ctx.tools.register(defineTool({
    name: 'business_current_employee_access',
    description: '读取当前会话绑定员工在所选租户下的角色和有效权限编码。权限字段为 null 时表示无法确认。业务操作仍须由后台鉴权。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      const agent = exec.agent
      if (!agent || agent.session.header.origin === 'subagent') throw new Error('需要已绑定企业账号的工作台会话')
      const lease = forms.require(agent.id)
      if (lease.session !== agent.session) throw new Error('需要已绑定企业账号的工作台会话')
      const { authorization, tenant } = lease.credential
      const access = await store.read(authorization, tenant)
      const current = forms.browser(agent.id, lease.credential)
      if (access.userId !== current.identity.user || access.tenantId !== String(current.identity.tenant)) {
        throw new Error('无法核实当前会话的权限归属')
      }
      return JSON.stringify({ roles: access.roles, permissions: access.permissions })
    },
  }))
}
