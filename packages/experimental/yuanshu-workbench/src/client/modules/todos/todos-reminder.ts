/** 桌面提醒：按分钟检查到点的未完成待办，弹系统通知并标记已提醒。 */
import { fetchTodos, patchTodo } from './todos-source.ts'
import { formatDueTime } from './todos-viewmodel.ts'
import type { TodoItem } from './todos-model.ts'

/** 单次提醒最多弹出的条数，避免积压时刷屏。 */
const MAX_PER_TICK = 3

/** 检查间隔。 */
const INTERVAL_MS = 60_000

/** 提醒文案函数。 */
type RemindCopy = (
  key: 'todos.reminderTitle' | 'todos.reminderDue' | 'todos.reminderNoDue',
  vars?: { readonly time: string },
) => string

/**
 * 启动提醒轮询；应用关闭即停止。
 * @param t - 已绑定的工作台文案。
 * @returns 停止函数。
 */
export function startTodoReminders(t: RemindCopy): () => void {
  let running = false
  const tick = async (): Promise<void> => {
    if (running || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    running = true
    try {
      const now = Date.now()
      const due = (await fetchTodos()).filter(item =>
        !item.done && item.remindedAt === null && item.dueAt !== null && Date.parse(item.dueAt) <= now)
      for (const item of due.slice(0, MAX_PER_TICK)) notify(item, t)
      await Promise.all(due.slice(0, MAX_PER_TICK).map(item => patchTodo(item.id, { reminded: true })))
    } catch {
      // 未登录或后台不可达时静默跳过，下一分钟再试。
    } finally {
      running = false
    }
  }
  void tick()
  const timer = setInterval(() => { void tick() }, INTERVAL_MS)
  return () => { clearInterval(timer) }
}

/**
 * 弹出一条系统通知。
 * @param item - 到点待办。
 * @param t - 文案函数。
 */
function notify(item: TodoItem, t: RemindCopy): void {
  const body = item.dueAt === null ? t('todos.reminderNoDue') : t('todos.reminderDue', { time: formatDueTime(item.dueAt) })
  const notification = new Notification(t('todos.reminderTitle'), { body: `${item.title}\n${body}`, tag: item.id })
  notification.onclick = () => { window.focus() }
}
