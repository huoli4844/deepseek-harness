/** 会议室模块的展示辅助：北京时间、时间轴与状态标签。 */
import type { BookingDraft, MeetingRoom, RoomBooking, RoomDraft } from './meeting-model.ts'

const beijingDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** 返回北京时间的今天，格式 yyyy-MM-dd，与后台日期字段一致。 */
export function beijingToday(): string {
  return beijingDate.format(new Date())
}

/** 时间轴展示的小时区间（含起点、不含终点），覆盖常见办公时段。 */
export const timelineStart = 8
export const timelineEnd = 20

/** 把后台 "HH:mm:ss" 时间规整为 "HH:mm"。 */
export function shortTime(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value
}

function minutes(value: string): number | undefined {
  const text = shortTime(value)
  const match = /^(\d{2}):(\d{2})$/.exec(text)
  if (match === null) return undefined
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return undefined
  return hour * 60 + minute
}

/** 预约在时间轴上的占用区间（分钟数），无法解析时返回空。 */
function bookingRange(booking: RoomBooking): { readonly start: number; readonly end: number } | undefined {
  const start = minutes(booking.startTime)
  const end = minutes(booking.endTime)
  if (start === undefined || end === undefined || end <= start) return undefined
  return { start, end }
}

/** 判断某小时格是否被 booked 预约覆盖。 */
export function hourOccupied(bookings: readonly RoomBooking[], hour: number): boolean {
  const from = hour * 60
  const to = from + 60
  return bookings.some((booking) => {
    if (booking.status !== 'booked') return false
    const range = bookingRange(booking)
    return range !== undefined && range.start < to && range.end > from
  })
}

/** 统计指定日期的 booked 预约数，用于卡片上的“今日 N 场”。 */
export function bookedCount(bookings: readonly RoomBooking[], roomId: number): number {
  return bookings.filter(booking => booking.roomId === roomId && booking.status === 'booked').length
}

/** 状态标签使用的语义色。 */
export function roomTone(status: string): 'success' | 'neutral' {
  return status === 'available' ? 'success' : 'neutral'
}

/** 新建与编辑共用的会议室空草稿。 */
export function roomDraft(record: MeetingRoom | undefined): RoomDraft {
  return {
    name: record?.name ?? '', location: record?.location ?? '',
    capacity: record === undefined ? '' : String(record.capacity),
    equipment: record?.equipment ?? '', remark: record?.remark ?? '',
  }
}

/** 以指定会议室与日期为默认值的预约草稿。 */
export function bookingDraft(roomId: number | undefined, date: string): BookingDraft {
  return { roomId, title: '', meetingDate: date, startTime: '09:00', endTime: '10:00', attendeeCount: '' }
}

/** 校验会议室草稿：名称必填、容量为正整数。 */
export function roomDraftValid(draft: RoomDraft): boolean {
  return draft.name.trim() !== '' && /^\d+$/.test(draft.capacity.trim()) && Number(draft.capacity) > 0
}

/** 校验预约草稿：主题、日期与 HH:mm 时间格式，结束晚于开始。 */
export function bookingDraftValid(draft: BookingDraft): boolean {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  if (draft.roomId === undefined || draft.title.trim() === '' || !time.test(draft.startTime) || !time.test(draft.endTime)) {
    return false
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.meetingDate)) return false
  if (draft.attendeeCount.trim() !== '' && !/^\d+$/.test(draft.attendeeCount.trim())) return false
  const start = minutes(draft.startTime)
  const end = minutes(draft.endTime)
  return start !== undefined && end !== undefined && end > start
}
