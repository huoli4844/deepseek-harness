// Package repository 将任职用例映射到 PostgreSQL 任职分配表，并联查岗位名称。
package repository

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/userposition/domain"
)

// Postgres 使用参数化租户条件访问任职分配数据。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定任职域的数据库连接池。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

// assignmentSelect 联查岗位主数据，输出线上 user-positions 语义的记录字段。
const assignmentSelect = `a.id, a.position_id, p.name AS position_name,
	p.level AS position_level, p.category AS position_category,
	a.user_id, a.project_id, a.role_in_project, a.start_date, a.end_date,
	a.is_primary, a.status, a.review_status, a.created_at`

// returningColumns 是写语句可 RETURNING 的本表列，联查字段由 changedJSON 补齐。
const returningColumns = `id, position_id, user_id, project_id, role_in_project,
	start_date, end_date, is_primary, status, review_status, created_at`

// changedJSON 把写操作结果与岗位主数据联查后组装成与列表一致的记录结构。
const changedJSON = `SELECT jsonb_build_object(
		'id', c.id, 'position_id', c.position_id,
		'position_name', p.name, 'position_level', p.level, 'position_category', p.category,
		'user_id', c.user_id, 'project_id', c.project_id,
		'role_in_project', c.role_in_project, 'start_date', c.start_date, 'end_date', c.end_date,
		'is_primary', c.is_primary, 'status', c.status, 'review_status', c.review_status,
		'created_at', c.created_at)
	FROM changed c JOIN public.pos_positions p ON p.id = c.position_id`

// List 返回当前租户的任职记录，可按用户或岗位过滤，按开始时间倒序。
func (p *Postgres) List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error) {
	if !query.Valid() {
		return domain.Page{}, domain.ErrInvalid
	}
	page := domain.Page{}
	err := p.pool.QueryRow(ctx, `
		SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.start_date DESC NULLS LAST, row.id), '[]'::jsonb) FROM (
			SELECT `+assignmentSelect+`
			FROM public.pos_position_assignments a
			JOIN public.pos_positions p ON p.id = a.position_id AND p.business_tenant_id = $1
			WHERE a.business_tenant_id = $1
			  AND ($2 = 0 OR a.user_id = $2)
			  AND ($3 = 0 OR a.position_id = $3)
		) row`, tenant, query.UserID, query.PositionID).Scan(&page.Items)
	return page, err
}

// Create 登记任职记录；来源追溯列由本服务登记，默认空值与未复核状态。
func (p *Postgres) Create(ctx context.Context, tenant int64, draft domain.Draft) (json.RawMessage, error) {
	return p.scanAssignment(p.pool.QueryRow(ctx, `WITH changed AS (
		INSERT INTO public.pos_position_assignments
			(business_tenant_id, position_id, user_id, project_id, role_in_project,
			 start_date, end_date, is_primary, status, source_bucket, source_object_key,
			 source_sheet, review_status)
		VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, '', '', '', 'unreviewed')
		RETURNING `+returningColumns+`
	) `+changedJSON,
		tenant, draft.PositionID, draft.UserID, draft.ProjectID, draft.RoleInProject,
		draft.StartDate, draft.EndDate, draft.IsPrimary, draft.Status))
}

// Update 替换任职记录的可编辑字段。
func (p *Postgres) Update(ctx context.Context, tenant, id int64, draft domain.Draft) (json.RawMessage, error) {
	return p.scanAssignment(p.pool.QueryRow(ctx, `WITH changed AS (
		UPDATE public.pos_position_assignments
		SET position_id = $3, user_id = $4, project_id = $5, role_in_project = $6,
			start_date = $7::date, end_date = $8::date, is_primary = $9, status = $10
		WHERE business_tenant_id = $1 AND id = $2
		RETURNING `+returningColumns+`
	) `+changedJSON,
		tenant, id, draft.PositionID, draft.UserID, draft.ProjectID, draft.RoleInProject,
		draft.StartDate, draft.EndDate, draft.IsPrimary, draft.Status))
}

// Delete 删除任职记录并返回删除前的内容。
func (p *Postgres) Delete(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return p.scanAssignment(p.pool.QueryRow(ctx, `WITH changed AS (
		DELETE FROM public.pos_position_assignments
		WHERE business_tenant_id = $1 AND id = $2
		RETURNING `+returningColumns+`
	) `+changedJSON, tenant, id))
}

// scanAssignment 把单行任职查询结果转为 JSON，并映射无记录与外键冲突错误。
func (p *Postgres) scanAssignment(row pgx.Row) (json.RawMessage, error) {
	var data json.RawMessage
	err := row.Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return nil, domain.ErrConflict
	}
	return data, err
}
