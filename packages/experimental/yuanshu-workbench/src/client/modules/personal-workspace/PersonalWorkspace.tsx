/** Personal calendar and task views backed by YuanShu's authenticated REST API. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import css from '../../app/Workbench.module.css'

type PersonalTask = {
  readonly id: number
  readonly title: string
  readonly description: string
  readonly status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  readonly priority: 'low' | 'medium' | 'high' | 'urgent'
  readonly due_at?: string
  readonly version: number
}

type PersonalCalendar = {
  readonly id: number
  readonly name: string
  readonly color: string
  readonly is_default: boolean
}

type CalendarEvent = {
  readonly id: number
  readonly calendar_id: number
  readonly title: string
  readonly description: string
  readonly location: string
  readonly start_at?: string
  readonly end_at?: string
  readonly all_day: boolean
}

type PersonalSection = 'tasks' | 'calendar'
type ViewState = { kind: 'loading' | 'login' | 'denied' | 'failure' } | { kind: 'ready' }
type TaskForm = { title: string; description: string; priority: PersonalTask['priority']; dueAt: string }
type EventForm = { title: string; calendarId: number | undefined; startAt: string; endAt: string; location: string; description: string }

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  return typeof value === 'string' ? value : ''
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0
}

function responseData(value: unknown): Record<string, unknown> {
  const body = record(value)
  const data = record(body?.data)
  if (body?.code !== 200 || data === undefined) throw new Error('Invalid YuanShu response')
  return data
}

function taskFromWire(value: unknown): PersonalTask {
  const row = record(value)
  if (row === undefined || numberField(row, 'id') <= 0 || stringField(row, 'title') === '') throw new Error('Invalid YuanShu task')
  const status = stringField(row, 'status')
  const priority = stringField(row, 'priority')
  if (!['todo', 'in_progress', 'done', 'cancelled'].includes(status) || !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    throw new Error('Invalid YuanShu task status')
  }
  return {
    id: numberField(row, 'id'),
    title: stringField(row, 'title'),
    description: stringField(row, 'description'),
    status: status as PersonalTask['status'],
    priority: priority as PersonalTask['priority'],
    ...(typeof row.due_at === 'string' ? { due_at: row.due_at } : {}),
    version: Math.max(1, numberField(row, 'version')),
  }
}

function calendarFromWire(value: unknown): PersonalCalendar {
  const row = record(value)
  if (row === undefined || numberField(row, 'id') <= 0 || stringField(row, 'name') === '') throw new Error('Invalid YuanShu calendar')
  return { id: numberField(row, 'id'), name: stringField(row, 'name'), color: stringField(row, 'color') || '#2563eb', is_default: row.is_default === true }
}

function eventFromWire(value: unknown): CalendarEvent {
  const row = record(value)
  if (row === undefined || numberField(row, 'id') <= 0 || numberField(row, 'calendar_id') <= 0 || stringField(row, 'title') === '') throw new Error('Invalid YuanShu calendar event')
  return {
    id: numberField(row, 'id'),
    calendar_id: numberField(row, 'calendar_id'),
    title: stringField(row, 'title'),
    description: stringField(row, 'description'),
    location: stringField(row, 'location'),
    ...(typeof row.start_at === 'string' ? { start_at: row.start_at } : {}),
    ...(typeof row.end_at === 'string' ? { end_at: row.end_at } : {}),
    all_day: row.all_day === true,
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' })
  const headers = new Headers(init?.headers)
  headers.set('authorization', `Bearer ${token}`)
  headers.set('X-Active-Tenant', localStorage.getItem('yuanshu-active-tenant') ?? '')
  if (init?.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/personal/${path}`, { ...init, headers })
  if (response.status === 401) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' })
  if (response.status === 403) throw Object.assign(new Error('YuanShu access denied'), { kind: 'denied' })
  if (!response.ok) throw new Error(`YuanShu request failed: ${response.status}`)
  if (response.status === 204) return undefined
  return response.json()
}

function listFromWire(value: unknown): unknown[] {
  const data = responseData(value).list
  if (!Array.isArray(data)) throw new Error('Invalid YuanShu list')
  return data
}

function initialTask(): TaskForm {
  return { title: '', description: '', priority: 'medium', dueAt: '' }
}

function initialEvent(calendarId?: number): EventForm {
  return { title: '', calendarId, startAt: '', endAt: '', location: '', description: '' }
}

function localDateTime(value: string | undefined): string {
  if (value === undefined) return ''
  return value.slice(0, 16)
}

function formatDate(value: string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

/** Render personal tasks and calendar events through the Host API proxy. */
export function PersonalWorkspace({ t, section }: PropsLocale<'yuanshu.workbench'> & {
  readonly section: PersonalSection
}) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [calendars, setCalendars] = useState<PersonalCalendar[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [taskForm, setTaskForm] = useState<TaskForm>(initialTask)
  const [eventForm, setEventForm] = useState<EventForm>(initialEvent)
  const [editingTask, setEditingTask] = useState<PersonalTask>()
  const [editingEvent, setEditingEvent] = useState<CalendarEvent>()
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [showCalendarForm, setShowCalendarForm] = useState(false)
  const [calendarName, setCalendarName] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const report = (error: unknown) => {
    const kind = record(error)?.kind
    setView({ kind: kind === 'login' || kind === 'denied' ? kind : 'failure' })
  }

  const loadTasks = async () => {
    const rows = listFromWire(await request('tasks'))
    setTasks(rows.map(taskFromWire))
  }

  const loadCalendar = async () => {
    const [calendarBody, eventBody] = await Promise.all([request('calendars'), request('calendar-events')])
    setCalendars(listFromWire(calendarBody).map(calendarFromWire))
    setEvents(listFromWire(eventBody).map(eventFromWire))
  }

  useEffect(() => {
    let disposed = false
    setView({ kind: 'loading' })
    void (async () => {
      try {
        if (section === 'tasks') await loadTasks()
        else await loadCalendar()
        if (!disposed) setView({ kind: 'ready' })
      } catch (error) {
        if (!disposed) report(error)
      }
    })()
    return () => { disposed = true }
  }, [attempt, section])

  const saveTask = async () => {
    if (!taskForm.title.trim()) return
    setBusy(true)
    try {
      const body = { title: taskForm.title.trim(), description: taskForm.description, priority: taskForm.priority, due_at: taskForm.dueAt ? new Date(taskForm.dueAt).toISOString() : null, status: editingTask?.status ?? 'todo', version: editingTask?.version }
      await request(editingTask === undefined ? 'tasks' : `tasks/${editingTask.id}`, { method: editingTask === undefined ? 'POST' : 'PUT', body: JSON.stringify(body) })
      setShowTaskForm(false)
      await loadTasks()
    } catch (error) { report(error) } finally { setBusy(false) }
  }

  const toggleTask = async (task: PersonalTask) => {
    try {
      await request(`tasks/${task.id}`, { method: 'PUT', body: JSON.stringify({ ...task, status: task.status === 'done' ? 'todo' : 'done', version: task.version }) })
      await loadTasks()
    } catch (error) { report(error) }
  }

  const removeTask = async (task: PersonalTask) => {
    try {
      await request(`tasks/${task.id}`, { method: 'DELETE' })
      await loadTasks()
    } catch (error) { report(error) }
  }

  const saveCalendar = async () => {
    if (!calendarName.trim()) return
    setBusy(true)
    try {
      await request('calendars', { method: 'POST', body: JSON.stringify({ name: calendarName.trim(), is_default: calendars.length === 0 }) })
      setCalendarName('')
      setShowCalendarForm(false)
      await loadCalendar()
    } catch (error) { report(error) } finally { setBusy(false) }
  }

  const saveEvent = async () => {
    if (!eventForm.title.trim() || eventForm.calendarId === undefined || !eventForm.startAt || !eventForm.endAt) return
    setBusy(true)
    try {
      const body = {
        title: eventForm.title.trim(), calendar_id: eventForm.calendarId,
        start_at: new Date(eventForm.startAt).toISOString(), end_at: new Date(eventForm.endAt).toISOString(),
        location: eventForm.location, description: eventForm.description, all_day: false,
      }
      await request(editingEvent === undefined ? 'calendar-events' : `calendar-events/${editingEvent.id}`, { method: editingEvent === undefined ? 'POST' : 'PUT', body: JSON.stringify(body) })
      setShowEventForm(false)
      await loadCalendar()
    } catch (error) { report(error) } finally { setBusy(false) }
  }

  const removeEvent = async (event: CalendarEvent) => {
    try {
      await request(`calendar-events/${event.id}`, { method: 'DELETE' })
      await loadCalendar()
    } catch (error) { report(error) }
  }

  if (view.kind !== 'ready') return <section className={css.card}>
    {view.kind === 'loading' && <p role="status">{t('live.loading')}</p>}
    {view.kind === 'login' && <p role="alert">{t('live.login')}</p>}
    {view.kind === 'denied' && <p role="alert">{t('live.denied')}</p>}
    {view.kind === 'failure' && <p role="alert">{t('live.failure')}</p>}
    {view.kind !== 'loading' && <Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>{t('live.retry')}</Button>}
  </section>

  if (section === 'tasks') return <section className={css.card}>
    {/* 空态时标题行收紧，避免按钮与提示文案之间出现大片空白。 */}
    <div className={tasks.length === 0 ? `${css.sectionHeading} ${css.headingTight}` : css.sectionHeading}><Button variant="primary" onClick={() => { setEditingTask(undefined); setTaskForm(initialTask()); setShowTaskForm(true) }}>{t('personal.newTask')}</Button></div>
    {showTaskForm && <div className={css.personalForm}>
      <Input aria-label={t('personal.taskTitle')} placeholder={t('personal.taskTitle')} value={taskForm.title} onChange={(event) => { setTaskForm({ ...taskForm, title: event.target.value }) }} />
      <Input aria-label={t('personal.taskDescription')} placeholder={t('personal.taskDescription')} value={taskForm.description} onChange={(event) => { setTaskForm({ ...taskForm, description: event.target.value }) }} />
      <label>{t('personal.priority')}<select value={taskForm.priority} onChange={(event) => { setTaskForm({ ...taskForm, priority: event.target.value as PersonalTask['priority'] }) }}><option value="low">{t('personal.priority.low')}</option><option value="medium">{t('personal.priority.medium')}</option><option value="high">{t('personal.priority.high')}</option><option value="urgent">{t('personal.priority.urgent')}</option></select></label>
      <label>{t('personal.dueAt')}<input type="datetime-local" value={taskForm.dueAt} onChange={(event) => { setTaskForm({ ...taskForm, dueAt: event.target.value }) }} /></label>
      <div className={css.personalActions}><Button variant="primary" disabled={busy || !taskForm.title.trim()} onClick={() => { void saveTask() }}>{t('personal.save')}</Button><Button variant="outline" onClick={() => { setShowTaskForm(false) }}>{t('cancel')}</Button></div>
    </div>}
    {tasks.length === 0 && <p className={css.emptyCompact}>{t('personal.noTasks')}</p>}
    <div className={css.personalList}>{tasks.map(task => <article className={`${css.personalRow} ${task.status === 'done' ? css.personalCompleted : ''}`} key={task.id}>
      <input type="checkbox" checked={task.status === 'done'} aria-label={task.title} onChange={() => { void toggleTask(task) }} />
      <div><h2>{task.title}</h2>{task.description && <p>{task.description}</p>}<small>{t(`personal.priority.${task.priority}`)}{task.due_at ? ` · ${formatDate(task.due_at)}` : ''}</small></div>
      <Button size="sm" variant="outline" onClick={() => { setEditingTask(task); setTaskForm({ title: task.title, description: task.description, priority: task.priority, dueAt: localDateTime(task.due_at) }); setShowTaskForm(true) }}>{t('personal.edit')}</Button>
      <Button size="sm" variant="outline" onClick={() => { void removeTask(task) }}>{t('personal.delete')}</Button>
    </article>)}</div>
  </section>

  return <section className={css.card}>
    <div className={css.sectionHeading}><div className={css.personalActions}><Button variant="primary" onClick={() => { setEditingEvent(undefined); setEventForm(initialEvent(calendars.find(item => item.is_default)?.id ?? calendars[0]?.id)); setShowEventForm(true) }}>{t('personal.newEvent')}</Button><Button variant="outline" onClick={() => { setShowCalendarForm(value => !value) }}>{t('personal.newCalendar')}</Button></div></div>
    {showCalendarForm && <div className={css.personalForm}><Input aria-label={t('personal.calendarName')} placeholder={t('personal.calendarName')} value={calendarName} onChange={(event) => { setCalendarName(event.target.value) }} /><div className={css.personalActions}><Button variant="primary" disabled={busy || !calendarName.trim()} onClick={() => { void saveCalendar() }}>{t('personal.save')}</Button><Button variant="outline" onClick={() => { setShowCalendarForm(false) }}>{t('cancel')}</Button></div></div>}
    {showEventForm && <div className={css.personalForm}>
      <Input aria-label={t('personal.eventTitle')} placeholder={t('personal.eventTitle')} value={eventForm.title} onChange={(event) => { setEventForm({ ...eventForm, title: event.target.value }) }} />
      <label>{t('personal.calendar')}<select value={eventForm.calendarId ?? ''} onChange={(event) => { setEventForm({ ...eventForm, calendarId: Number(event.target.value) }) }}><option value="">{t('personal.chooseCalendar')}</option>{calendars.map(calendar => <option value={calendar.id} key={calendar.id}>{calendar.name}</option>)}</select></label>
      <label>{t('personal.startAt')}<input type="datetime-local" value={eventForm.startAt} onChange={(event) => { setEventForm({ ...eventForm, startAt: event.target.value }) }} /></label>
      <label>{t('personal.endAt')}<input type="datetime-local" value={eventForm.endAt} onChange={(event) => { setEventForm({ ...eventForm, endAt: event.target.value }) }} /></label>
      <Input aria-label={t('personal.location')} placeholder={t('personal.location')} value={eventForm.location} onChange={(event) => { setEventForm({ ...eventForm, location: event.target.value }) }} />
      <Input aria-label={t('personal.eventDescription')} placeholder={t('personal.eventDescription')} value={eventForm.description} onChange={(event) => { setEventForm({ ...eventForm, description: event.target.value }) }} />
      <div className={css.personalActions}><Button variant="primary" disabled={busy} onClick={() => { void saveEvent() }}>{t('personal.save')}</Button><Button variant="outline" onClick={() => { setShowEventForm(false) }}>{t('cancel')}</Button></div>
    </div>}
    <div className={css.personalCalendars}>
      {calendars.map(calendar => <span key={calendar.id}><i style={{ background: calendar.color }} />{calendar.name}</span>)}
    </div>
    {events.length === 0 && <p className={css.empty}>{t('personal.noEvents')}</p>}
    <div className={css.personalList}>{events.map(event => <article className={css.personalRow} key={event.id}><i className={css.personalDot} style={{ background: calendars.find(calendar => calendar.id === event.calendar_id)?.color ?? 'var(--work-accent)' }} /><div><h2>{event.title}</h2><small>{formatDate(event.start_at)}{event.location ? ` · ${event.location}` : ''}</small>{event.description && <p>{event.description}</p>}</div><Button size="sm" variant="outline" onClick={() => { setEditingEvent(event); setEventForm({ title: event.title, calendarId: event.calendar_id, startAt: localDateTime(event.start_at), endAt: localDateTime(event.end_at), location: event.location, description: event.description }); setShowEventForm(true) }}>{t('personal.edit')}</Button><Button size="sm" variant="outline" onClick={() => { void removeEvent(event) }}>{t('personal.delete')}</Button></article>)}</div>
  </section>
}
