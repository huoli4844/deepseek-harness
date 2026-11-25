/** 通过工作台同源代理读写会议室与预约，不依赖 React。 */
import type {
  BookingDraft, BookingPage, MeetingRoom, RoomBooking, RoomDraft, RoomFilters, RoomPage,
} from './meeting-model.ts'

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return Reflect.get(value, key) as unknown
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid YuanShu meeting list')
  return value
}

function parseRoom(value: unknown): MeetingRoom {
  const id = integer(field(value, 'id'))
  const name = text(field(value, 'name'))
  const capacity = integer(field(value, 'capacity'))
  const status = text(field(value, 'status'))
  if (id === undefined || name === undefined || capacity === undefined || status === undefined) {
    throw new Error('Invalid YuanShu meeting room record')
  }
  return {
    id, name, capacity, status,
    location: text(field(value, 'location')), equipment: text(field(value, 'equipment')),
    remark: text(field(value, 'remark')),
  }
}

function parseBooking(value: unknown): RoomBooking {
  const id = integer(field(value, 'id'))
  const roomId = integer(field(value, 'room_id'))
  const organizerId = integer(field(value, 'organizer_id'))
  if (id === undefined || roomId === undefined || organizerId === undefined) {
    throw new Error('Invalid YuanShu booking record')
  }
  const stringOf = (key: string, fallback: string): string => text(field(value, key)) ?? fallback
  const count = integer(field(value, 'attendee_count'))
  return {
    id, roomId, organizerId,
    roomName: stringOf('room_name', ''), title: stringOf('title', ''),
    meetingDate: stringOf('meeting_date', ''), startTime: stringOf('start_time', ''),
    endTime: stringOf('end_time', ''), status: stringOf('status', 'booked'),
    attendeeCount: count === undefined ? undefined : Math.min(count, 2_147_483_647),
    cancelReason: text(field(value, 'cancel_reason')),
  }
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { status: 401, kind: 'missingToken' })
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
  })
  if (init.body !== undefined) headers.set('content-type', 'application/json')
  const response = await fetch(`/yuanshu-workbench/${path}`, { ...init, headers })
  if (!response.ok) throw Object.assign(new Error('YuanShu meeting request failed'), { status: response.status })
  return field(await response.json(), 'data')
}

/** 把会议室草稿转换为后台写入契约，可空文本留空时发送 null。 */
function roomPayload(draft: RoomDraft): Readonly<Record<string, unknown>> {
  return {
    name: draft.name.trim(), location: draft.location.trim() || null,
    capacity: Number(draft.capacity), equipment: draft.equipment.trim() || null,
    remark: draft.remark.trim() || null,
  }
}

/** 获取当前租户全部会议室及当前用户的管理员身份。 */
export async function fetchMeetingRooms(filters: RoomFilters, signal: AbortSignal): Promise<RoomPage> {
  const params = new URLSearchParams()
  const keyword = filters.keyword.trim()
  if (keyword !== '') params.set('keyword', keyword)
  if (filters.status !== '') params.set('status', filters.status)
  const suffix = params.toString() === '' ? '' : `?${params}`
  const data = await request(`meeting-rooms${suffix}`, { signal })
  const admin = field(data, 'admin') === true
  return { items: list(field(data, 'items')).map(parseRoom), admin }
}

/** 新建会议室，仅管理员可调用。 */
export async function createMeetingRoom(draft: RoomDraft, signal: AbortSignal): Promise<void> {
  await request('meeting-rooms', { method: 'POST', signal, body: JSON.stringify(roomPayload(draft)) })
}

/** 编辑会议室可编辑字段，仅管理员可调用。 */
export async function updateMeetingRoom(id: number, draft: RoomDraft, signal: AbortSignal): Promise<void> {
  await request(`meeting-rooms/${id}`, { method: 'PUT', signal, body: JSON.stringify(roomPayload(draft)) })
}

/** 停用会议室，历史预约保留。 */
export async function disableMeetingRoom(id: number, signal: AbortSignal): Promise<void> {
  await request(`meeting-rooms/${id}`, { method: 'DELETE', signal })
}

/** 获取预约分页，可按日期、会议室或本人过滤。 */
export async function fetchBookingPage(query: {
  readonly page: number
  readonly pageSize: number
  readonly date?: string
  readonly roomId?: number
  readonly mine?: boolean
}, signal: AbortSignal): Promise<BookingPage> {
  const params = new URLSearchParams({ page: String(query.page), page_size: String(query.pageSize) })
  if (query.date !== undefined && query.date !== '') params.set('date', query.date)
  if (query.roomId !== undefined) params.set('room_id', String(query.roomId))
  if (query.mine === true) params.set('mine', '1')
  const data = await request(`meeting-room-bookings?${params}`, { signal })
  const total = integer(field(data, 'total')) ?? 0
  const page = integer(field(data, 'page')) ?? query.page
  const pageSize = integer(field(data, 'page_size')) ?? query.pageSize
  return { items: list(field(data, 'items')).map(parseBooking), total, page, pageSize }
}

/** 把预约草稿转换为后台写入契约，未填参会人数发送 null。 */
function bookingPayload(draft: BookingDraft): Readonly<Record<string, unknown>> {
  return {
    room_id: draft.roomId, title: draft.title.trim(), meeting_date: draft.meetingDate,
    start_time: draft.startTime.trim(), end_time: draft.endTime.trim(),
    attendee_count: /^\d+$/.test(draft.attendeeCount.trim()) ? Number(draft.attendeeCount.trim()) : null,
  }
}

/** 预约会议室；同一时段冲突时后台返回 409。 */
export async function createBooking(draft: BookingDraft, signal: AbortSignal): Promise<void> {
  await request('meeting-room-bookings', { method: 'POST', signal, body: JSON.stringify(bookingPayload(draft)) })
}

/** 取消预约，仅预约人或管理员可执行。 */
export async function cancelBooking(id: number, reason: string, signal: AbortSignal): Promise<void> {
  await request(`meeting-room-bookings/${id}/cancel`, {
    method: 'POST', signal, body: JSON.stringify({ cancel_reason: reason.trim() }),
  })
}
