/** 待办卡片：挂在「我的任务」页，展示本地待办并支持完成与删除。 */
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useWorkbenchPage } from '../../app/page-api.ts'
import css from './todos.module.css'
import { deleteTodo, fetchTodos, patchTodo } from './todos-source.ts'
import type { TodoItem } from './todos-model.ts'
import { dueText, isOverdue, sectionTodos } from './todos-viewmodel.ts'

/** 系统通知是否可用且已授权。 */
function notificationsGranted(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted'
}

/** 渲染待办卡片。 */
export function TodosCard() {
  const { t } = useWorkbenchPage()
  const [items, setItems] = useState<readonly TodoItem[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [notify, setNotify] = useState(notificationsGranted)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setItems(await fetchTodos(signal))
      setState('ready')
    } catch (error) {
      if (signal?.aborted === true) return
      setState('failed')
      console.warn('[yuanshu-todos] load failed', error)
    }
  }, [])

  useEffect(() => {
    const lifetime = new AbortController()
    void load(lifetime.signal)
    return () => { lifetime.abort() }
  }, [load])

  const toggle = async (item: TodoItem): Promise<void> => {
    const updated = await patchTodo(item.id, { done: !item.done, reminded: !item.done })
    if (updated) setItems(current => current.map(entry => entry.id === updated.id ? updated : entry))
  }

  const remove = async (item: TodoItem): Promise<void> => {
    if (await deleteTodo(item.id)) setItems(current => current.filter(entry => entry.id !== item.id))
  }

  const enableNotify = async (): Promise<void> => {
    if (typeof Notification === 'undefined') return
    setNotify(await Notification.requestPermission() === 'granted')
  }

  const sections = sectionTodos(items)
  const now = Date.now()
  const row = (item: TodoItem) => (
    <li key={item.id} className={css.row} data-done={item.done}>
      <Button className={css.check} size="sm" variant="ghost"
        aria-label={item.done ? t('todos.reopen') : t('todos.markDone')}
        aria-pressed={item.done} onClick={() => { void toggle(item) }}>
        {item.done ? '✓' : ''}
      </Button>
      <span className={css.main}>
        <strong>{item.title}</strong>
        {item.note !== null && <small>{item.note}</small>}
      </span>
      <span className={css.due} data-overdue={isOverdue(item, now)}>{dueText(item, now, t)}</span>
      <Button className={css.remove} size="sm" variant="ghost" aria-label={t('todos.remove')}
        onClick={() => { void remove(item) }}>×</Button>
    </li>
  )

  return (
    <section className={css.card}>
      <header className={css.header}>
        <h2>{t('todos.title')}</h2>
        <span className={css.count}>{t('todos.count', { count: sections.open.length })}</span>
        <span className={css.spacer} />
        {notify
          ? <span className={css.notifyOn}>{t('todos.notifyOn')}</span>
          : typeof Notification === 'undefined' ? null : (
            <Button size="sm" variant="outline" onClick={() => { void enableNotify() }}>{t('todos.enableNotify')}</Button>
          )}
        <Button size="sm" variant="ghost" onClick={() => { setState('loading'); void load() }}>{t('todos.refresh')}</Button>
      </header>
      {state === 'failed' && <p className={css.error}>{t('todos.loadFailed')}</p>}
      {state === 'loading' && <p className={css.empty}>{t('todos.loading')}</p>}
      {state === 'ready' && (
        <ul className={css.list}>
          {sections.open.map(row)}
          {sections.open.length === 0 && <li className={css.empty}>{t('todos.empty')}</li>}
        </ul>
      )}
    </section>
  )
}
