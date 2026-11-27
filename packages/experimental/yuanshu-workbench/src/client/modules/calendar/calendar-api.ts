/**
 * 工程日历的数据层：同源代理 fetch、响应校验与降级。
 *
 * 走 `/yuanshu-workbench/personal/*` 同源代理（host 侧转发到元枢
 * `/api/v1/personal/*`），浏览器不直连后台。接口字段缺失时返回空列表，
 * 由页面自行降级为本地事项；写接口失败时抛出携带后台消息的错误，
 * 由页面决定是否降级为本地保存。
 */

/** 后台日程原始行（宽松视图）。 */
interface RawEvent {
  readonly id: number
  readonly title: string
  /** 开始时刻（ISO 或 yyyy-MM-ddTHH:mm:ss）。 */
  readonly startAt: string | undefined
}

/** 同源代理的日历事件路径。 */
const EVENTS_PATH = '/yuanshu-workbench/personal/calendar-events'
/** 同源代理的日历列表路径。 */
const CALENDARS_PATH = '/yuanshu-workbench/personal/calendars'

/** 判断值是否为非空对象。 */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** 只接受字符串，且过滤空白。 */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 浏览器同源请求所需的鉴权头。 */
function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${localStorage.getItem('workbench-client-token') ?? ''}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  }
}

/** 从多种响应形态中取出数组。 */
function listOf(body: unknown): readonly unknown[] {
  const data = record(record(body)?.data)
  if (data === undefined) return []
  for (const key of ['list', 'items', 'records'] as const) {
    if (Array.isArray(data[key])) return data[key] as readonly unknown[]
  }
  return []
}

/** 解析单个时刻字段：ISO、`yyyy-MM-ddTHH:mm:ss` 或整型 epoch 均可。 */
function parseMoment(value: unknown): Date | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  const raw = text(value)
  if (raw === undefined) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/** 宽松解析日程行；缺标题或开始时刻的记录直接忽略。 */
export function parseCalendarEvents(body: unknown): readonly RawEvent[] {
  const result: RawEvent[] = []
  for (const entry of listOf(body)) {
    const row = record(entry)
    if (row === undefined) continue
    const id = row.id
    const title = text(row.title) ?? text(row.name)
    const start = parseMoment(row.start_at) ?? parseMoment(row.start) ?? parseMoment(row.begin_at)
    if (typeof id !== 'number' || title === undefined || start === undefined) continue
    result.push({ id, title, startAt: start.toISOString() })
  }
  return result
}

/** 拉取后台日程列表；任何失败返回空数组（页面降级为本地事项）。 */
export async function fetchCalendarEvents(signal: AbortSignal): Promise<readonly RawEvent[]> {
  const response = await fetch(EVENTS_PATH, { headers: headers(), signal })
  if (!response.ok) return []
  return parseCalendarEvents(await response.json() as unknown)
}

/** 取默认日历 id（`is_default` 优先，否则取第一个）；失败返回 undefined。 */
export async function fetchDefaultCalendarId(signal: AbortSignal): Promise<number | undefined> {
  const response = await fetch(CALENDARS_PATH, { headers: headers(), signal })
  if (!response.ok) return undefined
  const calendars = listOf(await response.json() as unknown)
  let first: number | undefined
  for (const entry of calendars) {
    const row = record(entry)
    const id = row?.id
    if (typeof id !== 'number') continue
    if (row?.is_default === true) return id
    first ??= id
  }
  return first
}

/** 写接口的响应体（失败时携带后台 message）。 */
interface WriteResult {
  readonly ok: boolean
  readonly message: string | undefined
  readonly status: number
}

/** 统一的写请求：透传状态码并提取后台消息。 */
async function write(method: 'POST' | 'PUT' | 'DELETE', path: string, payload: unknown, signal: AbortSignal): Promise<WriteResult> {
  const response = await fetch(path, {
    method,
    headers: { ...headers(), 'content-type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    signal,
  })
  const body = record(await response.json().catch(() => undefined))
  const message = text(body?.message)
  return { ok: response.ok, message, status: response.status }
}

/** 新建日程的载荷：时刻使用无时区后缀的本地时间（后台按固定布局解析）。 */
export interface NewEventInput {
  readonly calendarId: number
  readonly title: string
  /** 本地时刻 yyyy-MM-ddTHH:mm:ss。 */
  readonly startAt: string
}

/**
 * 在后台创建日程。
 * 注：后台 CreateEvent 的标题校验疑似存在缺陷（任何标题值都报
 * 「日程标题不能为空」），调用方需准备好失败降级为本地保存。
 */
export async function createCalendarEvent(input: NewEventInput, signal: AbortSignal): Promise<WriteResult> {
  return write('POST', EVENTS_PATH, {
    calendar_id: input.calendarId,
    title: input.title,
    start_at: input.startAt,
    status: 'planned',
  }, signal)
}

/** 更新后台日程。 */
export async function updateCalendarEvent(
  id: number,
  title: string,
  startAt: string,
  done: boolean,
  signal: AbortSignal,
): Promise<WriteResult> {
  return write('PUT', `${EVENTS_PATH}/${id}`, {
    title,
    start_at: startAt,
    status: done ? 'done' : 'planned',
  }, signal)
}

/** 删除后台日程。 */
export async function deleteCalendarEvent(id: number, signal: AbortSignal): Promise<WriteResult> {
  return write('DELETE', `${EVENTS_PATH}/${id}`, undefined, signal)
}
