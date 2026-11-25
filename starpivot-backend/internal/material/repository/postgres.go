// Package repository 保留物料查询及分类写入的 PostgreSQL 实现。
package repository

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/material/domain"
)

// Postgres 按可信租户访问原有物料表。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定数据库连接池。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

func (p *Postgres) begin(ctx context.Context, tenant int64, options pgx.TxOptions) (pgx.Tx, error) {
	tx, err := p.pool.BeginTx(ctx, options)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", strconv.FormatInt(tenant, 10)); err != nil {
		rollback(tx)
		return nil, err
	}
	return tx, nil
}

func rollback(tx pgx.Tx) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = tx.Rollback(ctx)
}

const materialColumns = `m.id, m.code, m.name, m.spec, m.material_type, m.category_code, m.category_code2,
	m.unit, m.brand, m.model, m.drawing_no, m.price_suggested, m.safety_stock, m.lead_time_days,
	m.critical_level, m.remark, m.status, m.created_by, m.created_at, m.updated_at, m.business_code`

const materialCategoryTree = `WITH RECURSIVE selected_categories(id, code) AS (
	SELECT id, code FROM public.md_material_categories WHERE business_tenant_id=$1 AND id=$2
	UNION
	SELECT child.id, child.code FROM public.md_material_categories child
	JOIN selected_categories parent ON child.parent_id=parent.id WHERE child.business_tenant_id=$1
) `

const visibleMaterials = `m.business_tenant_id=$1 AND m.deleted_at IS NULL`
const matchedMaterials = `($2=0 OR EXISTS (SELECT 1 FROM selected_categories c WHERE c.code IN (m.category_code, m.category_code2)))
	AND ($3='' OR strpos(lower(m.code), lower($3)) > 0)
	AND ($4='' OR strpos(lower(m.name), lower($4)) > 0)
	AND ($5='' OR m.material_type=$5) AND ($6='' OR m.critical_level=$6)`

var materialSortColumns = map[string]string{
	"id": "id", "code": "code", "name": "name", "spec": "spec", "material_type": "material_type",
	"category_code": "category_code", "category_code2": "category_code2", "unit": "unit", "brand": "brand",
	"model": "model", "drawing_no": "drawing_no", "price_suggested": "price_suggested", "safety_stock": "safety_stock",
	"lead_time_days": "lead_time_days", "critical_level": "critical_level", "remark": "remark", "status": "status",
	"created_by": "created_by", "created_at": "created_at", "updated_at": "updated_at", "business_code": "business_code",
}

func materialOrder(sortBy, sortDir string) (string, error) {
	if sortBy == "" && sortDir == "" {
		return "page.id DESC", nil
	}
	column, ok := materialSortColumns[sortBy]
	if !ok {
		return "", domain.ErrInvalid
	}
	direction := "ASC"
	switch sortDir {
	case "", "asc":
	case "desc":
		direction = "DESC"
	default:
		return "", domain.ErrInvalid
	}
	order := "page." + column + " " + direction + " NULLS LAST"
	if column != "id" {
		order += ", page.id DESC"
	}
	return order, nil
}

// List 对同一快照查询匹配页、租户总数和筛选选项。
func (p *Postgres) List(ctx context.Context, tenant int64, q domain.ListQuery) (domain.Page, error) {
	order, err := materialOrder(q.SortBy, q.SortDir)
	if err != nil {
		return domain.Page{}, err
	}
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return domain.Page{}, err
	}
	defer rollback(tx)
	page := domain.Page{Page: q.Page, PageSize: q.PageSize}
	args := []any{tenant, q.CategoryID, q.Code, q.Name, q.MaterialType, q.CriticalLevel}
	if err := tx.QueryRow(ctx, materialCategoryTree+`SELECT count(*), count(*) FILTER (WHERE `+matchedMaterials+`),
		coalesce(array_agg(DISTINCT m.material_type ORDER BY m.material_type) FILTER (WHERE m.material_type <> ''), '{}'::varchar[]),
		coalesce(array_agg(DISTINCT m.critical_level ORDER BY m.critical_level) FILTER (WHERE m.critical_level <> ''), '{}'::varchar[])
		FROM public.md_materials m WHERE `+visibleMaterials, args...).Scan(
		&page.ArchiveTotal, &page.Total, &page.MaterialTypes, &page.CriticalLevels); err != nil {
		return domain.Page{}, err
	}
	args = append(args, q.PageSize, int64(q.Page-1)*int64(q.PageSize))
	if err := tx.QueryRow(ctx, materialCategoryTree+`SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY `+order+`), '[]'::jsonb) FROM (
		SELECT * FROM (SELECT `+materialColumns+` FROM public.md_materials m WHERE `+visibleMaterials+` AND `+matchedMaterials+`) page
		ORDER BY `+order+` LIMIT $7 OFFSET $8
	) page`, args...).Scan(&page.Items); err != nil {
		return domain.Page{}, err
	}
	return page, tx.Commit(ctx)
}

// UpdateMaterial 仅更新可编辑业务字段，保留租户、审计及导入溯源信息。
func (p *Postgres) UpdateMaterial(ctx context.Context, tenant, id int64, d domain.MaterialDraft) error {
	return p.writeMaterial(ctx, tenant, `UPDATE public.md_materials SET code=$3, name=$4, spec=$5,
		material_type=$6, category_code=$7, category_code2=$8, unit=$9, brand=$10, model=$11,
		drawing_no=$12, price_suggested=$13::numeric, safety_stock=$14::numeric, lead_time_days=$15,
		critical_level=$16, remark=$17, status=$18, updated_at=now()
		WHERE business_tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id`,
		id, d.Code, d.Name, d.Spec, d.MaterialType, d.CategoryCode, d.CategoryCode2, d.Unit, d.Brand,
		d.Model, d.DrawingNo, d.PriceSuggested.String(), d.SafetyStock.String(), d.LeadTimeDays,
		d.CriticalLevel, d.Remark, d.Status)
}

// DeleteMaterial 通过已有删除时间列软删除，避免破坏其他业务表的物料引用。
func (p *Postgres) DeleteMaterial(ctx context.Context, tenant, id int64) error {
	return p.writeMaterial(ctx, tenant, `UPDATE public.md_materials SET deleted_at=now(), updated_at=now()
		WHERE business_tenant_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id`, id)
}

func (p *Postgres) writeMaterial(ctx context.Context, tenant int64, query string, args ...any) error {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer rollback(tx)
	var id int64
	if err := tx.QueryRow(ctx, query, append([]any{tenant}, args...)...).Scan(&id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.ErrMaterialNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return domain.ErrMaterialConflict
		}
		return err
	}
	return tx.Commit(ctx)
}
