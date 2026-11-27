/** 对话工具：把整理好的待办写入本机清单，供「我的任务」页展示与提醒。 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { normalizeTodoDueAt, normalizeTodoNote, normalizeTodoTitle } from './model.ts'
import type { TodoStore } from './store.ts'

/**
 * 注册待办工具；模型只在员工确认后调用。
 * @param ctx - 插件上下文。
 * @param store - 本地待办存储。
 */
export function registerTodoTools(ctx: Context, store: TodoStore): void {
  ctx.tools.register(defineTool({
    name: 'yuanshu_todo_list',
    description: '读取本机待办清单。整理待办前先调用一次，避免重复添加已有事项。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(_args, exec) {
      assertMainSession(exec.agent)
      const items = await store.list()
      return JSON.stringify(items.filter(item => !item.done).map(toWire))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuanshu_todo_add',
    description: '向本机待办清单新增一条待办。仅在员工确认整理结果后调用；同一标题与时间重复调用会复用已有条目。',
    parameters: {
      title: { type: 'string', description: '待办内容，一句话，最多 120 个字符。' },
      dueAt: { type: 'string', description: '时间节点，ISO 8601 且带 +08:00 偏移，例如 2026-11-28T15:00:00+08:00；没有时间节点时省略。' },
      note: { type: 'string', description: '补充说明或来源，最多 500 个字符；没有时省略。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      assertMainSession(exec.agent)
      const item = await store.add({
        title: normalizeTodoTitle(args.title),
        dueAt: normalizeTodoDueAt(args.dueAt),
        note: normalizeTodoNote(args.note),
      })
      return JSON.stringify(toWire(item))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuanshu_todo_complete',
    description: '把一条待办标记为已完成。员工说“做完了/完成了”且能确定是哪一条时调用。',
    parameters: {
      id: { type: 'string', description: '待办标识，来自 yuanshu_todo_list 的结果。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      assertMainSession(exec.agent)
      const updated = await store.update(args.id ?? '', { done: true })
      if (updated === undefined) throw new Error('没有找到这条待办，请先读取待办清单')
      return JSON.stringify(toWire(updated))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuanshu_todo_update',
    description: '修改一条待办的内容、时间节点或说明。只传需要修改的字段。',
    parameters: {
      id: { type: 'string', description: '待办标识，来自 yuanshu_todo_list 的结果。' },
      title: { type: 'string', description: '新的待办内容，最多 120 个字符。' },
      dueAt: { type: 'string', description: '新的时间节点，ISO 8601 且带 +08:00 偏移；传空字符串表示清除。' },
      note: { type: 'string', description: '新的补充说明；传空字符串表示清除。' },
      done: { type: 'string', enum: ['true', 'false'], description: '是否已完成。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      assertMainSession(exec.agent)
      const updated = await store.update(args.id ?? '', {
        ...(args.title === undefined ? {} : { title: args.title }),
        ...(args.dueAt === undefined ? {} : { dueAt: args.dueAt }),
        ...(args.note === undefined ? {} : { note: args.note }),
        ...(args.done === undefined ? {} : { done: args.done === 'true' }),
      })
      if (updated === undefined) throw new Error('没有找到这条待办，请先读取待办清单')
      return JSON.stringify(toWire(updated))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'yuanshu_todo_remove',
    description: '删除一条待办。员工明确要求删除时调用。',
    parameters: {
      id: { type: 'string', description: '待办标识，来自 yuanshu_todo_list 的结果。' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      assertMainSession(exec.agent)
      if (!await store.remove(args.id ?? '')) throw new Error('没有找到这条待办')
      return '已删除'
    },
  }))
}

/**
 * 只允许主会话调用；子代理没有员工确认上下文。
 * @param agent - 当前执行会话。
 */
function assertMainSession(agent: Agent | undefined): void {
  if (!agent || agent.session.header.origin === 'subagent') throw new Error('请在员工对话中使用待办工具')
}

/**
 * 工具输出用的精简结构。
 * @param item - 存储条目。
 * @returns 模型可读的字段集合。
 */
function toWire(item: {
  readonly id: string
  readonly title: string
  readonly dueAt: string | null
  readonly note: string | null
  readonly done: boolean
}): object {
  return { id: item.id, title: item.title, dueAt: item.dueAt, note: item.note, done: item.done }
}
