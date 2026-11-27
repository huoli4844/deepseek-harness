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
    readonly expiresAt: number
  }>()

  /** 读取尚未取消或过期的请求。 */
  pending(session: ReturnType<BusinessForms['require']>['session']) {
    const draft = this.requests.get(session)
    if (draft && draft.expiresAt > Date.now()) return { id: draft.id, name: draft.name }
    this.requests.delete(session)
    return null
  }

  /** 消费指定请求，避免迟到的关闭事件影响下一份草稿。 */
  dismiss(session: ReturnType<BusinessForms['require']>['session'], id: unknown): void {
    if (this.requests.get(session)?.id === id) this.requests.delete(session)
  }

  /** 对话工具只打开编辑预览。 */
  register(ctx: Context, forms: BusinessForms): void {
    ctx.tools.register(defineTool({
      name: 'personal_pages_open_draft',
      description: '用户要求新建个人项目工时页时，打开待本人复核的草稿。仅需用户给出的页面名称，页面默认汇总本人全部项目的本月工时。打开草稿不代表已发布。',
      parameters: {
        name: { type: 'string', description: '用户明确给出的页面名称，最多 10 个字符。' },
      },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      execute: (args, { agent }) => {
        if (!agent || agent.session.header.origin === 'subagent') throw new Error('请在已登录的工作台对话中创建个人页面')
        const lease = forms.require(agent.id)
        if (lease.session !== agent.session) throw new Error('请在已绑定的工作台对话中创建个人页面')
        if (this.pending(lease.session)) return Promise.resolve('此对话已有待复核的个人页面。请先完成或取消。')
        this.requests.set(lease.session, {
          id: randomUUID(), name: (args.name ?? '').trim().slice(0, 10), expiresAt: Date.now() + 30 * 60_000,
        })
        return Promise.resolve('个人页面草稿已准备，请在对话弹窗中确认名称、预览并发布。')
      },
    }))
  }
}
