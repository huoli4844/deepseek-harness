// Package repository 将设备台账用例映射到既有 PostgreSQL 设备表。
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/equipment/domain"
)

// Postgres 使用参数化租户条件访问设备台账。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定设备台账的数据库连接池。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

const equipmentColumns = `id, code, name, equipment_type, workshop, model, manufacturer,
	purchase_date, arrival_date, lifecycle_status, runtime_status, maint_interval_days, serial_no, qr_code,
	category_code, category_name, subcategory_code, subcategory_name, remark, status, last_maint_date,
	next_maint_date, responsible_user_id, efficiency_enabled, default_shift_code, default_operator_user_id, capability_tags, review_status,
	created_at, updated_at`
const visible = `business_tenant_id = $1 AND deleted_at IS NULL`
const match = `($2 = '' OR
	strpos(lower(code), lower($2)) > 0 OR strpos(lower(name), lower($2)) > 0 OR
	strpos(lower(equipment_type), lower($2)) > 0 OR strpos(lower(workshop), lower($2)) > 0 OR
	strpos(lower(model), lower($2)) > 0 OR strpos(lower(manufacturer), lower($2)) > 0 OR
	strpos(lower(serial_no), lower($2)) > 0 OR strpos(lower(category_name), lower($2)) > 0 OR
	strpos(lower(subcategory_name), lower($2)) > 0)`

// List 在同一条 SQL 的快照内返回匹配页和两种总数，包括超出末页时的结果。
func (p *Postgres) List(ctx context.Context, tenant int64, q domain.ListQuery) (domain.Page, error) {
	if !q.Valid() {
		return domain.Page{}, domain.ErrInvalid
	}
	order := `id DESC`
	if q.SortBy != "" {
		order = pgx.Identifier{q.SortBy}.Sanitize() + " " + strings.ToUpper(q.SortDirection) + " NULLS LAST, id DESC"
	}
	page := domain.Page{Page: q.Page, PageSize: q.PageSize}
	err := p.pool.QueryRow(ctx, `
		WITH visible AS (
			SELECT `+equipmentColumns+` FROM public.eqp_equipments WHERE `+visible+`
		), matched AS (
			SELECT * FROM visible WHERE `+match+`
		)
		SELECT (SELECT count(*) FROM visible), (SELECT count(*) FROM matched),
			(SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY `+order+`), '[]'::jsonb) FROM (
				SELECT * FROM matched ORDER BY `+order+` LIMIT $3 OFFSET $4
			) page)`, tenant, q.Keyword, q.PageSize, int64(q.Page-1)*int64(q.PageSize)).
		Scan(&page.ArchiveTotal, &page.Total, &page.Items)
	return page, err
}

// Get 读取当前租户的未删除设备。
func (p *Postgres) Get(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return scanEquipment(p.pool.QueryRow(ctx, `SELECT to_jsonb(e) FROM (
		SELECT `+equipmentColumns+` FROM public.eqp_equipments WHERE `+visible+` AND id = $2
	) e`, tenant, id))
}

const editableColumns = `code, name, equipment_type, workshop, model, manufacturer,
	purchase_date, arrival_date, lifecycle_status, runtime_status, maint_interval_days, serial_no,
	qr_code, category_code, category_name, subcategory_code, subcategory_name, remark`

// Create 写入人工录入的设备，导入、审核和维护系统字段使用数据库默认值。
func (p *Postgres) Create(ctx context.Context, tenant int64, draft domain.Draft) (json.RawMessage, error) {
	return scanEquipment(p.pool.QueryRow(ctx, `WITH changed AS (
		INSERT INTO public.eqp_equipments (business_tenant_id, `+editableColumns+`)
		SELECT $1, `+editableColumns+`
		FROM jsonb_populate_record(NULL::public.eqp_equipments, $2::jsonb)
		RETURNING `+equipmentColumns+`
	) SELECT to_jsonb(changed) FROM changed`, tenant, draft))
}

// Update 替换可编辑业务字段并保留原始导入和系统字段。
func (p *Postgres) Update(ctx context.Context, tenant, id int64, draft domain.Draft) (json.RawMessage, error) {
	return scanEquipment(p.pool.QueryRow(ctx, `WITH changed AS (
		UPDATE public.eqp_equipments
		SET (`+editableColumns+`) = (
			SELECT `+editableColumns+` FROM jsonb_populate_record(NULL::public.eqp_equipments, $3::jsonb)
		)
		WHERE `+visible+` AND id = $2 RETURNING `+equipmentColumns+`
	) SELECT to_jsonb(changed) FROM changed`, tenant, id, draft))
}

// Delete 只设置删除时间，避免触发关联业务表的级联操作。
func (p *Postgres) Delete(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return scanEquipment(p.pool.QueryRow(ctx, `WITH changed AS (
		UPDATE public.eqp_equipments SET deleted_at = now()
		WHERE `+visible+` AND id = $2 RETURNING id, deleted_at
	) SELECT to_jsonb(changed) FROM changed`, tenant, id))
}

func scanEquipment(row pgx.Row) (json.RawMessage, error) {
	var data json.RawMessage
	err := row.Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "eqp_equipments_code_key" {
		return nil, domain.ErrConflict
	}
	return data, err
}
