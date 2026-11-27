/** 待办视图模型：纯函数，负责排序、逾期判断与时间文案。 */
import type { TodoItem } from './todos-model.ts'

/** 展示用分组：未完成按时间升序，已完成按更新时间倒序。 */
export interface TodoSections {
  readonly open: readonly TodoItem[]
  readonly done: readonly TodoItem[]
}

/**
 * 分区并排序待办。
 * @param items - 原始待办。
 * @returns 未完成与已完成两组。
 */
export function sectionTodos(items: readonly TodoItem[]): TodoSections {
  const open = items.filter(item => !item.done).sort(compareOpen)
  const done = items.filter(item => item.done).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return { open, done }
}

/**
 * 未完成排序：有时间节点的在前并按时间升序，无时间节点按创建时间。
 * @param left - 左条目。
 * @param right - 右条目。
 * @returns 排序值。
 */
function compareOpen(left: TodoItem, right: TodoItem): number {
  if (left.dueAt !== null && right.dueAt !== null) return left.dueAt.localeCompare(right.dueAt)
  if (left.dueAt !== null) return -1
  if (right.dueAt !== null) return 1
  return left.createdAt.localeCompare(right.createdAt)
}

/**
 * 是否已过时间节点。
 * @param item - 待办。
 * @param now - 当前毫秒时间。
 * @returns 未完成且时间已到。
 */
export function isOverdue(item: TodoItem, now: number): boolean {
  return !item.done && item.dueAt !== null && Date.parse(item.dueAt) <= now
}

/**
 * 以北京时间格式化时间节点。
 * @param dueAt - ISO 时间。
 * @returns `MM-DD HH:mm`。
 */
export function formatDueTime(dueAt: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(dueAt))
}

/**
 * 生成行内时间文案：逾期、今天或具体时间。
 * @param item - 待办。
 * @param now - 当前毫秒时间。
 * @param t - 文案函数。
 * @returns 展示文本。
 */
export function dueText(item: TodoItem, now: number, t: (key: 'todos.noDue' | 'todos.overdue' | 'todos.dueToday') => string): string {
  if (item.dueAt === null) return t('todos.noDue')
  if (isOverdue(item, now)) return `${t('todos.overdue')} · ${formatDueTime(item.dueAt)}`
  return formatDueTime(item.dueAt)
}
