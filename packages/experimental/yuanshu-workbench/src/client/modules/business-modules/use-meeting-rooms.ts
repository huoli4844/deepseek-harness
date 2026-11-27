/** 编排会议室列表、当日预约与预约/维护写入，不渲染页面。 */
import { useEffect, useRef, useState } from 'react'
import { cancelBooking, createBooking, createMeetingRoom, disableMeetingRoom, fetchBookingPage, fetchMeetingRooms, updateMeetingRoom } from './meeting-api.ts'
import type { BookingDraft, BookingPage, MeetingRoom, RoomBooking, RoomDraft, RoomFilters } from './meeting-model.ts'
import { bookingDraft, roomDraftValid, bookingDraftValid, beijingToday, roomDraft } from './meeting-viewmodel.ts'

type RequestError = 'login' | 'denied' | 'failure'

/** 会议室模块写入失败时展示的文案键。 */
export type MeetingWriteError =
  | 'meeting.login' | 'meeting.writeUnauthorized' | 'meeting.denied' | 'meeting.roomConflict'
  | 'meeting.bookingConflict' | 'meeting.roomInvalid' | 'meeting.bookingInvalid'
  | 'meeting.roomUpdateError' | 'meeting.roomDeleteError' | 'meeting.bookingError' | 'meeting.cancelError'

function statusOf(error: unknown): unknown {
  return error instanceof Error && 'status' in error ? error.status : undefined
}

function requestError(error: unknown): RequestError {
  switch (statusOf(error)) {
    case 401: return 'login'
    case 403: return 'denied'
    default: return 'failure'
  }
}

/** 把预约相关写入错误映射为文案键，409 区分会议室与时段冲突。 */
function writeError(error: unknown, fallback: MeetingWriteError): MeetingWriteError {
  if (error instanceof Error && 'kind' in error && error.kind === 'missingToken') return 'meeting.login'
  switch (statusOf(error)) {
    case 401: return 'meeting.writeUnauthorized'
    case 403: return 'meeting.denied'
    case 409: return fallback === 'meeting.bookingError' ? 'meeting.bookingConflict' : fallback
    case 400: return fallback === 'meeting.bookingError' ? 'meeting.bookingInvalid' : 'meeting.roomInvalid'
    default: return fallback
  }
}

/** 加载会议室列表；列表自带管理员标志，用于维护按钮显隐。 */
export function useMeetingRooms() {
  const [filters, setFilters] = useState<RoomFilters>({ keyword: '', status: '' })
  const [applied, setApplied] = useState<RoomFilters>({ keyword: '', status: '' })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{ readonly items: readonly MeetingRoom[]; readonly admin: boolean }>()
  const [error, setError] = useState<RequestError>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchMeetingRooms(applied, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setResult(data)
      setLoading(false)
    }).catch((fetchError: unknown) => {
      if (controller.signal.aborted) return
      setError(requestError(fetchError))
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [applied, retry])

  return {
    filters, result, error, loading,
    change: (patch: Partial<RoomFilters>) => { setFilters(previous => ({ ...previous, ...patch })) },
    search: () => { setApplied(filters) },
    retry: () => { setRetry(value => value + 1) },
    refresh: () => { setRetry(value => value + 1) },
  }
}

/** 加载某日期全部预约，用于卡片计数与详情时间轴。 */
export function useDayBookings(date: string) {
  const [retry, setRetry] = useState(0)
  const [items, setItems] = useState<readonly RoomBooking[]>()
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    void fetchBookingPage({ page: 1, pageSize: 200, date }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setItems(data.items)
      setError(false)
    }).catch(() => {
      if (controller.signal.aborted) return
      setItems([])
      setError(true)
    })
    return () => { controller.abort() }
  }, [date, retry])

  return { items, error, refresh: () => { setRetry(value => value + 1) } }
}

/** 我的预约分页列表，供取消操作后刷新。 */
export function useMyBookings() {
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<BookingPage>()
  const [error, setError] = useState<RequestError>()
  const [loading, setLoading] = useState(true)
  const pageSize = 20

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchBookingPage({ page, pageSize, mine: true }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setResult(data)
      setLoading(false)
    }).catch((fetchError: unknown) => {
      if (controller.signal.aborted) return
      setError(requestError(fetchError))
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [page, retry])

  const total = result?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return {
    page, result, error, loading, pageCount,
    goToPage: (next: number) => { if (next >= 1 && next <= pageCount) setPage(next) },
    refresh: () => { setRetry(value => value + 1) },
  }
}

/** 控制会议室维护与预约写入弹窗的提交状态。 */
export function useMeetingWrite(onDone: (outcome: 'roomCreated' | 'roomUpdated' | 'roomDisabled' | 'booked' | 'cancelled') => void) {
  const today = beijingToday()
  const [roomEditing, setRoomEditing] = useState<{ readonly id?: number; readonly draft: RoomDraft }>()
  const [roomDisabling, setRoomDisabling] = useState<MeetingRoom>()
  const [booking, setBooking] = useState<BookingDraft>()
  const [cancelling, setCancelling] = useState<RoomBooking>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<MeetingWriteError>()
  const active = useRef<AbortController>()

  useEffect(() => () => { active.current?.abort() }, [])

  const run = (task: (signal: AbortSignal) => Promise<void>, fallback: MeetingWriteError,
    outcome: 'roomCreated' | 'roomUpdated' | 'roomDisabled' | 'booked' | 'cancelled') => {
    if (active.current !== undefined) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setError(undefined)
    void task(controller.signal).then(() => {
      if (controller.signal.aborted) return
      setRoomEditing(undefined)
      setRoomDisabling(undefined)
      setBooking(undefined)
      setCancelling(undefined)
      onDone(outcome)
    }).catch((requestFailure: unknown) => {
      if (!controller.signal.aborted) setError(writeError(requestFailure, fallback))
    }).finally(() => {
      if (controller.signal.aborted) return
      active.current = undefined
      setPending(false)
    })
  }

  return {
    today, roomEditing, roomDisabling, booking, cancelling, pending, error,
    startCreate: () => { setError(undefined); setRoomEditing({ draft: roomDraft(undefined) }) },
    startEdit: (room: MeetingRoom) => { setError(undefined); setRoomEditing({ id: room.id, draft: roomDraft(room) }) },
    closeRoom: () => { if (active.current === undefined) setRoomEditing(undefined) },
    changeRoom: (patch: Partial<RoomDraft>) => {
      setRoomEditing(previous => previous === undefined ? previous : { ...previous, draft: { ...previous.draft, ...patch } })
    },
    saveRoom: () => {
      if (roomEditing === undefined) return
      const { draft, id } = roomEditing
      if (!roomDraftValid(draft)) { setError('meeting.roomInvalid'); return }
      run(signal => id === undefined ? createMeetingRoom(draft, signal) : updateMeetingRoom(id, draft, signal),
        'meeting.roomUpdateError', id === undefined ? 'roomCreated' : 'roomUpdated')
    },
    askDisable: (room: MeetingRoom) => { setError(undefined); setRoomDisabling(room) },
    closeDisable: () => { if (active.current === undefined) setRoomDisabling(undefined) },
    confirmDisable: () => {
      if (roomDisabling === undefined) return
      run(signal => disableMeetingRoom(roomDisabling.id, signal), 'meeting.roomDeleteError', 'roomDisabled')
    },
    startBooking: (roomId: number | undefined, date = today) => {
      setError(undefined)
      setBooking(bookingDraft(roomId, date))
    },
    closeBooking: () => { if (active.current === undefined) setBooking(undefined) },
    changeBooking: (patch: Partial<BookingDraft>) => {
      setBooking(previous => previous === undefined ? previous : { ...previous, ...patch })
    },
    saveBooking: () => {
      if (booking === undefined) return
      if (!bookingDraftValid(booking)) { setError('meeting.bookingInvalid'); return }
      run(signal => createBooking(booking, signal), 'meeting.bookingError', 'booked')
    },
    askCancel: (record: RoomBooking) => { setError(undefined); setCancelling(record) },
    closeCancel: () => { if (active.current === undefined) setCancelling(undefined) },
    confirmCancel: () => {
      if (cancelling === undefined) return
      run(signal => cancelBooking(cancelling.id, '', signal), 'meeting.cancelError', 'cancelled')
    },
  }
}
