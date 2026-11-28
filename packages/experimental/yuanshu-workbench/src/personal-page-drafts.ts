/** 将对话中的创建意图送到本人会话，发布仍由员工确认。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import type { BusinessForms } from './plugins/yuanshu-business-forms/index.ts'

/** 会话内待复核请求，不持久化。 */
export class PersonalPageDrafts {
  private readonly requests = new WeakMap<ReturnType<BusinessForms['require']>['session'], {
    readonly id: string
    readonly name: string
    readonly widgets?: readonly unknown[]
    readonly expiresAt: number
  }>()

  /** 读取尚未取消或过期的请求。 */
  pending(session: ReturnType<BusinessForms['require']>['session']) {
    const draft = this.requests.get(session)
    if (draft && draft.expiresAt > Date.now()) {
      return { id: draft.id, name: draft.name, ...(draft.widgets === undefined ? {} : { widgets: draft.widgets }) }
    }
    this.requests.delete(session)
    return null
  }

  /** 消费指定请求，避免迟到的关闭事件影响下一份草稿。 */
  dismiss(session: ReturnType<BusinessForms['require']>['session'], id: unknown): void {
    if (this.requests.get(session)?.id === id) this.requests.delete(session)
  }

  /** 对话工具打开编辑预览；widgets 可预填任意目录数据卡片，由员工预览确认。 */
  register(ctx: Context, forms: BusinessForms): void {
    ctx.tools.register(defineTool({
      name: 'personal_pages_open_draft',
      description: '用户要求新建个人动态页面时，打开待本人复核的草稿。仅名称时默认生成一张本人本月项目工时卡；'
        + '也可通过 widgets 自由组装卡片：固定卡片（labor-month 本人项目工时 / member-labor 成员工时 / headcount 人员概览）'
        + '或 data-query 数据卡（path 必须来自 yuanshu_api_search 检索到的只读 GET 接口）。打开草稿不代表已发布。',
      parameters: {
        name: { type: 'string', description: '用户明确给出的页面名称，最多 10 个字符。' },
        widgets: {
          type: 'array',
          description: '要预填的卡片列表，每项含 type 与对应配置；不传则默认一张本月工时卡。',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              type: { type: 'string', description: 'labor-month | member-labor | headcount | data-query' },
              period: { type: 'string', description: '工时卡的日期范围：week 或 month，仅工时卡使用。' },
              memberId: { type: 'number', description: 'member-labor 卡的目标员工 ID。' },
              memberName: { type: 'string', description: 'member-labor 卡的员工姓名，用于展示。' },
              path: { type: 'string', description: 'data-query 卡的只读接口路径（/api/v1/ 开头，来自数据目录检索）。' },
              params: { type: 'object', additionalProperties: true, description: 'data-query 卡的查询参数键值对，只用目录声明的参数名。' },
              title: { type: 'string', description: 'data-query 卡的中文展示标题，按业务含义命名。' },
              view: { type: 'string', description: 'data-query 卡的展示形式：table=明细表格（默认）、stats=数字统计卡、bar=条形图对比排名。' },
              aggregate: { type: 'string', description: 'stats 卡的聚合方式：sum=求和（默认）、avg=平均、max=最大、min=最小、count=记录总数。' },
              columns: { type: 'array', description: 'data-query 卡优先展示的字段名列表，最多 8 个。' },
              labels: { type: 'object', additionalProperties: true,
                description: 'data-query 卡的字段中文标签映射（字段名→中文），如 {"progress_percent":"进度","risk_level":"风险等级"}。' },
            },
          },
        },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: (args, { agent }) => {
        if (!agent || agent.session.header.origin === 'subagent') throw new Error('请在已登录的工作台对话中创建个人页面')
        const lease = forms.require(agent.id)
        if (lease.session !== agent.session) throw new Error('请在已绑定的工作台对话中创建个人页面')
        if (this.pending(lease.session)) return Promise.resolve('此对话已有待复核的个人页面。请先完成或取消。')
        const name = typeof args.name === 'string' ? args.name : ''
        const widgets = Array.isArray(args.widgets) && args.widgets.length > 0
          ? args.widgets.slice(0, 10)
            .filter(item => typeof item === 'object').map(item => Object.fromEntries(Object.entries(item)))
          // 未传卡片时预填一张默认工时卡，保证弹窗里预览按钮立即可用。
          : [{ id: randomUUID(), type: 'labor-month', period: 'month' }]
        this.requests.set(lease.session, {
          id: randomUUID(), name: name.trim().slice(0, 10), widgets, expiresAt: Date.now() + 30 * 60_000,
        })
        // 汇总类诉求若全部是明细表格，提示模型补统计卡；否则仅提示发布。
        const allTable = widgets.every(widget => (widget as { view?: unknown }).view === undefined
          || (widget as { view?: unknown }).view === 'table')
        const hint = allTable && Array.isArray(args.widgets)
          ? '提示：员工要求数字汇总/综合统计时，卡片要用 view:"stats" + aggregate（sum/avg/max/min/count），'
            + '对比排名用 view:"bar"，明细清单才用 table；当前卡片全部是明细表格，请补充统计卡后重新打开草稿。'
          : ''
        return Promise.resolve(Array.isArray(args.widgets) && args.widgets.length > 0
          ? `已按 widgets 预填 ${String(widgets.length)} 张卡片。请员工在对话弹窗中核对各卡片数据、预览并发布。${hint}`
          : '已准备默认草稿（预填一张本人本月工时卡）。若员工想展示工时以外的业务数据（如项目执行情况、进度、风险），'
            + '请再次调用本工具：先用 yuanshu_api_search 检索只读接口，再通过 widgets 参数传 data-query 卡（path/params/title）。'
            + '员工要求数字汇总时用 view:"stats" + aggregate，对比排名用 view:"bar"。')
      },
    }))
  }
}
