// Package repository 将会议室用例映射到 PostgreSQL 会议室表。
package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/domain"
)

// Postgres 使用参数化租户条件访问会议室与预约数据。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定会议室域的数据库连接池。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

const roomColumns = `id, name, location, capacity, equipment, status, remark, created_by, created_at, updated_at`

// ListRooms 返回当前租户全部会议室，可按关键词和状态过滤。
func (p *Postgres) ListRooms(ctx context.Context, tenant int64, query domain.RoomListQuery) (domain.RoomPage, error) {
	if !query.Valid() {
		return domain.RoomPage{}, domain.ErrInvalid
	}
	page := domain.RoomPage{}
	err := p.pool.QueryRow(ctx, `
		SELECT coalesce(jsonb_agg(to_jsonb(room) ORDER BY room.name, room.id), '[]'::jsonb) FROM (
			SELECT `+roomColumns+` FROM public.mtg_meeting_rooms
			WHERE business_tenant_id = $1
			  AND ($2 = '' OR strpos(lower(name), lower($2)) > 0
			    OR strpos(lower(coalesce(location, '')), lower($2)) > 0)
			  AND ($3 = '' OR status = $3)
		) room`, tenant, query.Keyword, query.Status).Scan(&page.Items)
	return page, err
}

// CreateRoom 登记新会议室，名称在租户内唯一。
func (p *Postgres) CreateRoom(ctx context.Context, tenant, userID int64, draft domain.RoomDraft) (json.RawMessage, error) {
	return p.scanRoom(p.pool.QueryRow(ctx, `WITH changed AS (
		INSERT INTO public.mtg_meeting_rooms
			(business_tenant_id, name, location, capacity, equipment, remark, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+roomColumns+`
	) SELECT to_jsonb(changed) FROM changed`,
		tenant, draft.Name, draft.Location, draft.Capacity, draft.Equipment, draft.Remark, userID))
}

// UpdateRoom 替换会议室的可编辑业务字段。
func (p *Postgres) UpdateRoom(ctx context.Context, tenant, id int64, draft domain.RoomDraft) (json.RawMessage, error) {
	return p.scanRoom(p.pool.QueryRow(ctx, `WITH changed AS (
		UPDATE public.mtg_meeting_rooms
		SET name = $3, location = $4, capacity = $5, equipment = $6, remark = $7, updated_at = now()
		WHERE business_tenant_id = $1 AND id = $2
		RETURNING `+roomColumns+`
	) SELECT to_jsonb(changed) FROM changed`,
		tenant, id, draft.Name, draft.Location, draft.Capacity, draft.Equipment, draft.Remark))
}

// DisableRoom 停用会议室，保留历史预约记录。
func (p *Postgres) DisableRoom(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return p.scanRoom(p.pool.QueryRow(ctx, `WITH changed AS (
		UPDATE public.mtg_meeting_rooms SET status = 'disabled', updated_at = now()
		WHERE business_tenant_id = $1 AND id = $2 RETURNING `+roomColumns+`
	) SELECT to_jsonb(changed) FROM changed`, tenant, id))
}

// scanRoom 把单行会议室查询结果转为 JSON，并映射无记录与唯一约束冲突错误。
func (p *Postgres) scanRoom(row pgx.Row) (json.RawMessage, error) {
	var data json.RawMessage
	err := row.Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, domain.ErrConflict
	}
	return data, err
}
