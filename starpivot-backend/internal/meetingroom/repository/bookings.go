package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/domain"
)

const bookingColumns = `id, room_id, title, meeting_date, start_time, end_time,
	organizer_id, attendee_count, status, cancel_reason, created_by, created_at, updated_at`

// ListBookings 按日期、会议室或本人条件分页返回预约记录，附带会议室名称。
func (p *Postgres) ListBookings(ctx context.Context, tenant, userID int64, query domain.BookingListQuery) (domain.BookingPage, error) {
	if !query.Valid() {
		return domain.BookingPage{}, domain.ErrInvalid
	}
	page := domain.BookingPage{Page: query.Page, PageSize: query.PageSize}
	err := p.pool.QueryRow(ctx, `
		WITH visible AS (
			SELECT b.id, b.room_id, r.name AS room_name, b.title, b.meeting_date, b.start_time, b.end_time,
				b.organizer_id, b.attendee_count, b.status, b.cancel_reason, b.created_by, b.created_at, b.updated_at
			FROM public.mtg_room_bookings b
			JOIN public.mtg_meeting_rooms r ON r.id = b.room_id
			WHERE b.business_tenant_id = $1
			  AND ($2::date IS NULL OR b.meeting_date = $2::date)
			  AND ($3 = 0 OR b.room_id = $3)
			  AND (NOT $4 OR b.organizer_id = $5)
		), matched AS (SELECT * FROM visible ORDER BY meeting_date DESC, start_time, id)
		SELECT (SELECT count(*) FROM visible),
			(SELECT coalesce(jsonb_agg(to_jsonb(page)), '[]'::jsonb) FROM (
				SELECT * FROM matched LIMIT $6 OFFSET $7
			) page)`,
		tenant, nullableDate(query.Date), query.RoomID, query.Mine, userID,
		page.PageSize, int64(page.Page-1)*int64(page.PageSize)).
		Scan(&page.Total, &page.Items)
	return page, err
}

// CreateBooking 在事务内锁定会议室并校验时段冲突后写入预约。
func (p *Postgres) CreateBooking(ctx context.Context, tenant, userID int64, draft domain.BookingDraft) (json.RawMessage, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var status string
	err = tx.QueryRow(ctx, `SELECT status FROM public.mtg_meeting_rooms
		WHERE business_tenant_id = $1 AND id = $2 FOR UPDATE`, tenant, draft.RoomID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if status != "available" {
		return nil, domain.ErrRoomDisabled
	}
	var taken int
	err = tx.QueryRow(ctx, `SELECT count(*) FROM public.mtg_room_bookings
		WHERE business_tenant_id = $1 AND room_id = $2 AND meeting_date = $3::date
		  AND status = 'booked' AND (start_time, end_time) OVERLAPS ($4::time, $5::time)`,
		tenant, draft.RoomID, draft.MeetingDate, draft.StartTime, draft.EndTime).Scan(&taken)
	if err != nil {
		return nil, err
	}
	if taken > 0 {
		return nil, domain.ErrTimeConflict
	}
	data, err := p.scanRoom(tx.QueryRow(ctx, `WITH changed AS (
		INSERT INTO public.mtg_room_bookings
			(business_tenant_id, room_id, title, meeting_date, start_time, end_time, organizer_id, attendee_count, created_by)
		VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, $7)
		RETURNING id, room_id, title, meeting_date, start_time, end_time,
			organizer_id, attendee_count, status, cancel_reason, created_by, created_at, updated_at
	) SELECT jsonb_build_object(
		'id', id, 'room_id', room_id, 'room_name', (SELECT name FROM public.mtg_meeting_rooms WHERE id = room_id),
		'title', title, 'meeting_date', meeting_date, 'start_time', start_time, 'end_time', end_time,
		'organizer_id', organizer_id, 'attendee_count', attendee_count, 'status', status,
		'cancel_reason', cancel_reason, 'created_by', created_by, 'created_at', created_at, 'updated_at', updated_at
	) FROM changed`, tenant, draft.RoomID, draft.Title, draft.MeetingDate, draft.StartTime, draft.EndTime, userID, draft.AttendeeCount))
	if err != nil {
		return nil, err
	}
	return data, tx.Commit(ctx)
}

// CancelBooking 取消预约，仅预约人或管理员可执行，取消后记录保留原因。
func (p *Postgres) CancelBooking(ctx context.Context, tenant, id, userID int64, admin bool, reason string) (json.RawMessage, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var organizer int64
	var status string
	err = tx.QueryRow(ctx, `SELECT organizer_id, status FROM public.mtg_room_bookings
		WHERE business_tenant_id = $1 AND id = $2 FOR UPDATE`, tenant, id).Scan(&organizer, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if organizer != userID && !admin {
		return nil, domain.ErrForbidden
	}
	if status != "booked" {
		return nil, domain.ErrConflict
	}
	data, err := p.scanRoom(tx.QueryRow(ctx, `WITH changed AS (
		UPDATE public.mtg_room_bookings SET status = 'cancelled', cancel_reason = $3, updated_at = now()
		WHERE business_tenant_id = $1 AND id = $2
		RETURNING id, room_id, title, meeting_date, start_time, end_time,
			organizer_id, attendee_count, status, cancel_reason, created_by, created_at, updated_at
	) SELECT jsonb_build_object(
		'id', id, 'room_id', room_id, 'room_name', (SELECT name FROM public.mtg_meeting_rooms WHERE id = room_id),
		'title', title, 'meeting_date', meeting_date, 'start_time', start_time, 'end_time', end_time,
		'organizer_id', organizer_id, 'attendee_count', attendee_count, 'status', status,
		'cancel_reason', cancel_reason, 'created_by', created_by, 'created_at', created_at, 'updated_at', updated_at
	) FROM changed`, tenant, id, nullableReason(reason)))
	if err != nil {
		return nil, err
	}
	return data, tx.Commit(ctx)
}

// nullableDate 把空日期转为 SQL NULL，便于单一 SQL 同时覆盖有无日期过滤。
func nullableDate(date string) any {
	if date == "" {
		return nil
	}
	return date
}

// nullableReason 把空取消原因转为 SQL NULL。
func nullableReason(reason string) any {
	if reason == "" {
		return nil
	}
	return reason
}
