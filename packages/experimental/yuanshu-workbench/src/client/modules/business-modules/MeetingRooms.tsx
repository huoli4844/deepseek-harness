/**
 * 渲染会议室主屏：卡片网格、当日时间轴详情、预约表单与我的预约列表。
 * 组件只展示状态并调用 hook 回调，不直接访问网络。
 */
import { useState } from 'react'
import {
  Button, IconEditOutlineRegular, IconSearchOutlineRegular, IconTrashOutlineRegular,
  Input, Modal, SegmentedTabs, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import type { BookingDraft, MeetingRoom, MeetingTab, RoomBooking, RoomDraft } from './meeting-model.ts'
import { bookedCount, hourOccupied, roomTone, shortTime, timelineEnd, timelineStart } from './meeting-viewmodel.ts'
import type { MeetingWriteError } from './use-meeting-rooms.ts'
import { useDayBookings, useMeetingRooms, useMeetingWrite, useMyBookings } from './use-meeting-rooms.ts'
import { beijingToday } from './meeting-viewmodel.ts'
import css from './meeting-rooms.module.css'
import businessCss from './business-modules.module.css'

const noticeKeys = {
  roomCreated: 'meeting.roomCreated', roomUpdated: 'meeting.roomSaved', roomDisabled: 'meeting.roomDisabled',
  booked: 'meeting.booked', cancelled: 'meeting.cancelled',
} as const

type NoticeOutcome = keyof typeof noticeKeys

/** 渲染会议室主屏，页签在会议室网格与我的预约之间切换。 */
export function MeetingRoomsScreen({ t }: { readonly t: WorkbenchT }) {
  const [tab, setTab] = useState<MeetingTab>('rooms')
  const [notice, setNotice] = useState<NoticeOutcome>()
  const rooms = useMeetingRooms()
  const day = useDayBookings(beijingToday())
  const mine = useMyBookings()
  const write = useMeetingWrite((outcome) => {
    setNotice(outcome)
    rooms.refresh()
    day.refresh()
    mine.refresh()
  })
  return <div className={css.screen}>
    <h2 className={css.screenTitle}>{t('meeting.title')}</h2>
    {notice !== undefined && <p role="status" className={css.recordStatus}>{t(noticeKeys[notice])}</p>}
    <SegmentedTabs label={t('meeting.title')} size="sm" value={tab}
      onChange={(value) => { setTab(value) }}
      items={[
        { id: 'meeting-tab-rooms', value: 'rooms', label: t('meeting.tabRooms'), panelId: 'meeting-panel' },
        { id: 'meeting-tab-mine', value: 'mine', label: t('meeting.tabMine'), panelId: 'meeting-panel' },
      ]} />
    <div id="meeting-panel" className={css.panel} role="tabpanel">
      {tab === 'rooms'
        ? <RoomBoard t={t} rooms={rooms} day={day} write={write} />
        : <MyBookings t={t} mine={mine} write={write} />}
    </div>
    {write.roomEditing !== undefined && <RoomDialog id={write.roomEditing.id} draft={write.roomEditing.draft}
      error={write.error} pending={write.pending} t={t} onChange={write.changeRoom} onSave={write.saveRoom}
      onClose={write.closeRoom} />}
    {write.booking !== undefined && <BookingDialog rooms={rooms.result?.items ?? []} draft={write.booking}
      error={write.error} pending={write.pending} t={t} onChange={write.changeBooking} onSave={write.saveBooking}
      onClose={write.closeBooking} />}
    {write.roomDisabling !== undefined && <ConfirmDialog title={t('meeting.disable')} body={t('meeting.confirmDisable')}
      detail={write.roomDisabling.name} error={write.error} pending={write.pending}
      confirmLabel={t('meeting.disable')} t={t} onConfirm={write.confirmDisable} onClose={write.closeDisable} />}
    {write.cancelling !== undefined && <ConfirmDialog title={t('meeting.cancelBooking')} body={t('meeting.confirmCancel')}
      detail={`${write.cancelling.roomName} ${write.cancelling.meetingDate} ${shortTime(write.cancelling.startTime)}`}
      error={write.error} pending={write.pending} confirmLabel={t('meeting.cancelBooking')}
      t={t} onConfirm={write.confirmCancel} onClose={write.closeCancel} />}
  </div>
}

type RoomsState = ReturnType<typeof useMeetingRooms>
type DayState = ReturnType<typeof useDayBookings>
type MineState = ReturnType<typeof useMyBookings>
type WriteState = ReturnType<typeof useMeetingWrite>

function RoomBoard({ t, rooms, day, write }: {
  readonly t: WorkbenchT
  readonly rooms: RoomsState
  readonly day: DayState
  readonly write: WriteState
}) {
  return <div className={css.board}>
    <form className={css.filters} onSubmit={(event) => { event.preventDefault(); rooms.search() }}>
      <label>{t('meeting.keyword')}<Input value={rooms.filters.keyword} maxLength={100}
        onChange={(event) => { rooms.change({ keyword: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.status')}
        <select value={rooms.filters.status} onChange={(event) => { rooms.change({ status: event.currentTarget.value as never }) }}>
          <option value="">{t('meeting.statusAll')}</option>
          <option value="available">{t('meeting.statusAvailable')}</option>
          <option value="disabled">{t('meeting.statusDisabled')}</option>
        </select></label>
      <Button type="submit" variant="outline" aria-label={t('meeting.search')} icon={<IconSearchOutlineRegular />} />
      {rooms.result?.admin === true && <div className={css.filterActions}>
        <Button type="button" variant="primary" onClick={write.startCreate}>{t('meeting.create')}</Button>
      </div>}
    </form>
    <RoomGrid t={t} rooms={rooms} day={day} write={write} />
  </div>
}

function RoomGrid({ t, rooms, day, write }: {
  readonly t: WorkbenchT
  readonly rooms: RoomsState
  readonly day: DayState
  readonly write: WriteState
}) {
  const [selectedId, setSelectedId] = useState<number>()
  const items = rooms.result?.items ?? []
  const selected = items.find(room => room.id === selectedId)
  if (rooms.loading) return <p role="status" className={css.recordStatus}>{t('meeting.loading')}</p>
  if (rooms.error !== undefined) return <div role="alert" className={css.recordStatus}>
    <p>{rooms.error === 'login' ? t('meeting.login') : rooms.error === 'denied' ? t('meeting.denied') : t('meeting.listError')}</p>
    <Button variant="outline" onClick={rooms.retry}>{t('meeting.retry')}</Button>
  </div>
  if (items.length === 0) return <p className={css.recordStatus}>{t('meeting.empty')}</p>
  return <div className={css.gridArea}>
    <div className={css.grid} role="list">
      {items.map(room => <RoomCard key={room.id} room={room} count={bookedCount(day.items ?? [], room.id)}
        selected={room.id === selectedId} t={t} onSelect={() => { setSelectedId(room.id) }} />)}
    </div>
    {selected !== undefined && <RoomDetail room={selected} day={day} admin={rooms.result?.admin === true}
      write={write} t={t} />}
  </div>
}

function RoomCard({ room, count, selected, t, onSelect }: {
  readonly room: MeetingRoom
  readonly count: number
  readonly selected: boolean
  readonly t: WorkbenchT
  readonly onSelect: () => void
}) {
  return <button type="button" role="listitem" className={room.status === 'available' ? css.card : `${css.card} ${css.cardDisabled}`}
    aria-pressed={selected} onClick={onSelect}>
    <span className={css.cardHead}>
      <strong className={css.cardName}>{room.name}</strong>
      <Tag tone={roomTone(room.status)}>{t(room.status === 'available' ? 'meeting.statusAvailable' : 'meeting.statusDisabled')}</Tag>
    </span>
    <span className={css.cardMeta}>{room.location ?? t('meeting.noLocation')}</span>
    <span className={css.cardMeta}>{t('meeting.capacity')} {room.capacity}</span>
    <span className={css.cardMeta}>{t('meeting.todayCount', { count: String(count) })}</span>
  </button>
}

function RoomDetail({ room, day, admin, write, t }: {
  readonly room: MeetingRoom
  readonly day: DayState
  readonly admin: boolean
  readonly write: WriteState
  readonly t: WorkbenchT
}) {
  const bookings = (day.items ?? []).filter(booking => booking.roomId === room.id)
  const hours = Array.from({ length: timelineEnd - timelineStart }, (_, index) => timelineStart + index)
  return <aside className={css.detail}>
    <div className={css.detailHead}>
      <strong>{room.name}</strong>
      <Tag tone={roomTone(room.status)}>{t(room.status === 'available' ? 'meeting.statusAvailable' : 'meeting.statusDisabled')}</Tag>
    </div>
    <p className={css.detailMeta}>{room.location ?? t('meeting.noLocation')} · {t('meeting.capacity')} {room.capacity}</p>
    {room.equipment !== undefined && <p className={css.detailMeta}>{room.equipment}</p>}
    <div className={css.timeline} aria-label={t('meeting.timeline')}>
      {hours.map(hour => <div key={hour}
        className={hourOccupied(bookings, hour) ? `${css.hour} ${css.hourBusy}` : css.hour}
        title={occupiedLabel(bookings, hour)}>{hour}</div>)}
    </div>
    <p className={css.timelineCaption}>{t('meeting.timelineCaption', {
      start: `${timelineStart}:00`, end: `${timelineEnd}:00`,
    })}</p>
    <div className={css.detailActions}>
      <Button variant="primary" disabled={room.status !== 'available' || write.pending}
        onClick={() => { write.startBooking(room.id) }}>{t('meeting.book')}</Button>
      {admin && <>
        <Button variant="outline" aria-label={t('meeting.edit')} disabled={write.pending}
          icon={<IconEditOutlineRegular />} onClick={() => { write.startEdit(room) }} />
        <Button variant="outline" aria-label={t('meeting.disable')} disabled={write.pending}
          icon={<IconTrashOutlineRegular />} onClick={() => { write.askDisable(room) }} />
      </>}
    </div>
  </aside>
}

function occupiedLabel(bookings: readonly RoomBooking[], hour: number): string {
  const busy = bookings.find(booking => booking.status === 'booked' && overlaps(booking, hour))
  return busy === undefined ? '' : `${busy.title} ${shortTime(busy.startTime)}-${shortTime(busy.endTime)}`
}

function overlaps(booking: RoomBooking, hour: number): boolean {
  const start = Number(shortTime(booking.startTime).slice(0, 2)) + Number(shortTime(booking.startTime).slice(3, 5)) / 60
  const end = Number(shortTime(booking.endTime).slice(0, 2)) + Number(shortTime(booking.endTime).slice(3, 5)) / 60
  return Number.isFinite(start) && Number.isFinite(end) && start < hour + 1 && end > hour
}

function MyBookings({ t, mine, write }: {
  readonly t: WorkbenchT
  readonly mine: MineState
  readonly write: WriteState
}) {
  const items = mine.result?.items ?? []
  return <div className={css.mineList}>
    {mine.loading && <p role="status" className={css.recordStatus}>{t('meeting.loading')}</p>}
    {mine.error !== undefined && <div role="alert" className={css.recordStatus}>
      <p>{mine.error === 'login' ? t('meeting.login') : t('meeting.listError')}</p>
      <Button variant="outline" onClick={mine.refresh}>{t('meeting.retry')}</Button>
    </div>}
    {!mine.loading && mine.error === undefined && items.length === 0 && <p className={css.recordStatus}>{t('meeting.noBookings')}</p>}
    <ul className={css.mineItems}>
      {items.map(booking => <li key={booking.id} className={css.mineItem}>
        <span className={css.mineTitle}>{booking.roomName} · {booking.title}</span>
        <span className={css.mineMeta}>
          {booking.meetingDate} {shortTime(booking.startTime)}-{shortTime(booking.endTime)}
        </span>
        <Tag tone={booking.status === 'booked' ? 'success' : 'neutral'}>
          {t(booking.status === 'booked' ? 'meeting.statusBooked' : booking.status === 'cancelled' ? 'meeting.statusCancelled' : 'meeting.statusCompleted')}
        </Tag>
        {booking.status === 'booked' && <Button variant="outline" disabled={write.pending}
          onClick={() => { write.askCancel(booking) }}>{t('meeting.cancelBooking')}</Button>}
      </li>)}
    </ul>
    {!mine.loading && mine.pageCount > 1 && <div className={css.pagination}>
      <Button variant="outline" disabled={mine.page <= 1} onClick={() => { mine.goToPage(mine.page - 1) }}>{t('meeting.previousPage')}</Button>
      <span>{t('meeting.pageStatus', { page: String(mine.page), pages: String(mine.pageCount) })}</span>
      <Button variant="outline" disabled={mine.page >= mine.pageCount} onClick={() => { mine.goToPage(mine.page + 1) }}>{t('meeting.nextPage')}</Button>
    </div>}
  </div>
}

function RoomDialog({ id, draft, error, pending, t, onChange, onSave, onClose }: {
  readonly id: number | undefined
  readonly draft: RoomDraft
  readonly error: MeetingWriteError | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onChange: (patch: Partial<RoomDraft>) => void
  readonly onSave: () => void
  readonly onClose: () => void
}) {
  return <Modal open title={t(id === undefined ? 'meeting.createTitle' : 'meeting.editTitle')}
    closeLabel={t('meeting.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onSave}>{t('meeting.save')}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('meeting.cancel')}</Button>
    </div>}>
    <div className={css.recordForm}>
      <label>{t('meeting.roomName')}<Input value={draft.name} disabled={pending} maxLength={100}
        onChange={(event) => { onChange({ name: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.roomLocation')}<Input value={draft.location} disabled={pending} maxLength={200}
        onChange={(event) => { onChange({ location: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.roomCapacity')}<Input type="number" min="1" step="1" value={draft.capacity} disabled={pending}
        onChange={(event) => { onChange({ capacity: event.currentTarget.value }) }} /></label>
      <label className={css.recordFormWide}>{t('meeting.roomEquipment')}<Input value={draft.equipment} disabled={pending} maxLength={500}
        onChange={(event) => { onChange({ equipment: event.currentTarget.value }) }} /></label>
      <label className={css.recordFormWide}>{t('meeting.roomRemark')}<Input value={draft.remark} disabled={pending} maxLength={2000}
        onChange={(event) => { onChange({ remark: event.currentTarget.value }) }} /></label>
      {error !== undefined && <p className={`${businessCss.businessModuleFormError} ${css.recordFormWide}`} role="alert">{t(error)}</p>}
    </div>
  </Modal>
}

function BookingDialog({ rooms, draft, error, pending, t, onChange, onSave, onClose }: {
  readonly rooms: readonly MeetingRoom[]
  readonly draft: BookingDraft
  readonly error: MeetingWriteError | undefined
  readonly pending: boolean
  readonly t: WorkbenchT
  readonly onChange: (patch: Partial<BookingDraft>) => void
  readonly onSave: () => void
  readonly onClose: () => void
}) {
  const selectable = rooms.filter(room => room.status === 'available')
  return <Modal open title={t('meeting.bookTitle')} closeLabel={t('meeting.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onSave}>{t('meeting.book')}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('meeting.cancel')}</Button>
    </div>}>
    <div className={css.recordForm}>
      <label>{t('meeting.roomName')}
        <select value={draft.roomId ?? ''} disabled={pending}
          onChange={(event) => { onChange({ roomId: Number(event.currentTarget.value) || undefined }) }}>
          <option value="" disabled>{t('meeting.pickRoom')}</option>
          {selectable.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>
      <label>{t('meeting.bookingTitle')}<Input value={draft.title} disabled={pending} maxLength={200}
        onChange={(event) => { onChange({ title: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.bookingDate')}<Input type="date" value={draft.meetingDate} disabled={pending}
        onChange={(event) => { onChange({ meetingDate: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.bookingStart')}<Input type="time" value={draft.startTime} disabled={pending}
        onChange={(event) => { onChange({ startTime: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.bookingEnd')}<Input type="time" value={draft.endTime} disabled={pending}
        onChange={(event) => { onChange({ endTime: event.currentTarget.value }) }} /></label>
      <label>{t('meeting.attendees')}<Input type="number" min="1" step="1" value={draft.attendeeCount} disabled={pending}
        onChange={(event) => { onChange({ attendeeCount: event.currentTarget.value }) }} /></label>
      {error !== undefined && <p className={`${businessCss.businessModuleFormError} ${css.recordFormWide}`} role="alert">{t(error)}</p>}
    </div>
  </Modal>
}

function ConfirmDialog({ title, body, detail, error, pending, confirmLabel, t, onConfirm, onClose }: {
  readonly title: string
  readonly body: string
  readonly detail: string
  readonly error: MeetingWriteError | undefined
  readonly pending: boolean
  readonly confirmLabel: string
  readonly t: WorkbenchT
  readonly onConfirm: () => void
  readonly onClose: () => void
}) {
  return <Modal open title={title} closeLabel={t('meeting.cancel')} onClose={onClose}
    footer={<div className={businessCss.businessModuleActions}>
      <Button variant="primary" disabled={pending} onClick={onConfirm}>{confirmLabel}</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>{t('meeting.cancel')}</Button>
    </div>}>
    <p>{body}</p>
    <p>{detail}</p>
    {error !== undefined && <p className={businessCss.businessModuleFormError} role="alert">{t(error)}</p>}
  </Modal>
}
