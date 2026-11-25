// Package repository 实现供应商 PostgreSQL 访问，不依赖 HTTP 协议。
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/supplier/application"
	"starpivot.local/deepseek-harness-backend/internal/supplier/domain"
)

// Postgres 按固定表白名单和可信租户执行供应商资源查询。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定调用方持有的数据库连接池。
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

const supplierMatch = `($2 = '' OR EXISTS (
	SELECT 1 FROM unnest(ARRAY[r.code, r.name, r.short_name, r.category, r.contact_person])
	AS field(value) WHERE strpos(lower(field.value), lower($2)) > 0))
	AND ($3 = '' OR strpos(lower(r.code), lower($3)) > 0)
	AND ($4 = '' OR strpos(lower(r.name), lower($4)) > 0)
	AND ($5 = '' OR strpos(lower(r.contact_person), lower($5)) > 0)
	AND ($6 = '' OR btrim(r.category) = $6)`

var sortableSupplierColumns = []string{
	"code", "name", "short_name", "supplier_type", "category", "contact_person", "contact_phone",
	"contact_email", "address", "bank_info", "payment_terms", "quality_rating", "delivery_rating",
	"price_rating", "service_rating", "total_score", "admission_status", "owner_user_id", "remark",
	"created_by", "created_at", "updated_at", "deleted_at", "source_bucket", "source_object_key",
	"source_sheet", "source_row_no", "ingestion_batch_id", "evidence_ref_id", "confidence",
	"review_status", "business_tenant_id", "status",
}

// List 查询资源分页和同一快照中的筛选后总数。
func (p *Postgres) List(ctx context.Context, kind domain.Kind, tenant, parent int64, page, size int, query archivequery.Query) (application.Page, error) {
	result := application.Page{Items: make([]json.RawMessage, 0), Page: page, Size: size}
	spec, ok := domain.SpecFor(kind)
	if !ok || !query.ValidSort(sortableSupplierColumns) {
		return result, domain.ErrInvalid
	}
	order := "r.id DESC"
	if query.SortBy != "" {
		order = fmt.Sprintf("r.%s %s NULLS LAST, r.id DESC", query.SortBy, query.SortDirection)
	}
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	where, args := filters(spec, tenant, parent)
	match := "true"
	if kind == domain.Supplier && (query.Keyword != "" || query.Code != "" || query.Name != "" || query.ContactPerson != "" || query.Category != "") {
		args = append(args, query.Keyword, query.Code, query.Name, query.ContactPerson, query.Category)
		match = supplierMatch
	}
	if err := tx.QueryRow(ctx, "SELECT count(*), count(*) FILTER (WHERE "+match+") FROM public."+
		spec.Table+" r WHERE "+where, args...).Scan(&result.ArchiveTotal, &result.Total); err != nil {
		return result, err
	}
	args = append(args, size, int64(page-1)*int64(size))
	statement := "SELECT to_jsonb(r) FROM public." + spec.Table + " r WHERE " + where + " AND " + match +
		fmt.Sprintf(" ORDER BY %s LIMIT $%d OFFSET $%d", order, len(args)-1, len(args))
	rows, err := tx.Query(ctx, statement, args...)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var item []byte
		if err := rows.Scan(&item); err != nil {
			rows.Close()
			return result, err
		}
		result.Items = append(result.Items, json.RawMessage(item))
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return result, err
	}
	rows.Close()
	return result, tx.Commit(ctx)
}

// Get 读取当前租户的一条未删除资源。
func (p *Postgres) Get(ctx context.Context, kind domain.Kind, tenant, id int64) (json.RawMessage, error) {
	spec, ok := domain.SpecFor(kind)
	if !ok {
		return nil, domain.ErrInvalid
	}
	return p.one(ctx, tenant, "SELECT to_jsonb(r) FROM public."+spec.Table+" r WHERE "+
		"r.business_tenant_id=$1 AND r.deleted_at IS NULL AND r.id=$2", id)
}

// Create 按固定业务字段插入资源并写入可信审计身份。
func (p *Postgres) Create(ctx context.Context, kind domain.Kind, tenant, actor, parent int64, fields map[string]json.RawMessage) (json.RawMessage, error) {
	spec, ok := domain.SpecFor(kind)
	if !ok {
		return nil, domain.ErrInvalid
	}
	keys, body, err := fieldPayload(spec, fields)
	if err != nil {
		return nil, err
	}
	columns := []string{"business_tenant_id", "created_by"}
	selects := []string{"$1", "$2"}
	args := []any{tenant, actor}
	if spec.ParentColumn != "" {
		columns = append(columns, spec.ParentColumn)
		selects = append(selects, "$3")
		args = append(args, parent)
	}
	args = append(args, body)
	if len(keys) > 0 {
		for _, key := range keys {
			columns = append(columns, key)
			selects = append(selects, "p."+key)
		}
	}
	bodyIndex := len(args)
	query := "INSERT INTO public." + spec.Table + " (" + strings.Join(columns, ",") + ") SELECT " +
		strings.Join(selects, ",") + " FROM jsonb_populate_record(NULL::public." + spec.Table +
		fmt.Sprintf(", $%d::jsonb) p", bodyIndex)
	if spec.ParentColumn != "" {
		query += " WHERE EXISTS (SELECT 1 FROM public.md_suppliers s WHERE s.id=$3 AND s.business_tenant_id=$1 AND s.deleted_at IS NULL)"
	}
	query += " RETURNING to_jsonb(" + spec.Table + ")"
	return p.oneQuery(ctx, tenant, query, args...)
}

// Update обновляет переданные поля и сохраняет tenant/creation поля.
func (p *Postgres) Update(ctx context.Context, kind domain.Kind, tenant, id int64, fields map[string]json.RawMessage) (json.RawMessage, error) {
	spec, ok := domain.SpecFor(kind)
	if !ok {
		return nil, domain.ErrInvalid
	}
	keys, body, err := fieldPayload(spec, fields)
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return p.Get(ctx, kind, tenant, id)
	}
	set := make([]string, 0, len(keys))
	for _, key := range keys {
		set = append(set, key+"=p."+key)
	}
	set = append(set, "updated_at=now()")
	query := "UPDATE public." + spec.Table + " r SET " + strings.Join(set, ",") +
		" FROM jsonb_populate_record(NULL::public." + spec.Table + ", $3::jsonb) p" +
		" WHERE r.business_tenant_id=$1 AND r.deleted_at IS NULL AND r.id=$2 RETURNING to_jsonb(r)"
	return p.one(ctx, tenant, query, id, body)
}

// Delete 软删除一条当前租户内的资源。
func (p *Postgres) Delete(ctx context.Context, kind domain.Kind, tenant, id int64) (json.RawMessage, error) {
	spec, ok := domain.SpecFor(kind)
	if !ok {
		return nil, domain.ErrInvalid
	}
	return p.one(ctx, tenant, "UPDATE public."+spec.Table+" r SET deleted_at=now(), updated_at=now() WHERE "+
		"r.business_tenant_id=$1 AND r.deleted_at IS NULL AND r.id=$2 RETURNING to_jsonb(r)", id)
}

// Categories 返回当前租户有效供应商已使用的不同分类。
func (p *Postgres) Categories(ctx context.Context, tenant int64) ([]string, int64, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, 0, err
	}
	defer rollback(tx)
	rows, err := tx.Query(ctx, "SELECT DISTINCT btrim(category) AS category FROM public.md_suppliers WHERE business_tenant_id=$1 AND deleted_at IS NULL AND btrim(category)<>'' ORDER BY category", tenant)
	if err != nil {
		return nil, 0, err
	}
	categories := make([]string, 0)
	for rows.Next() {
		var category string
		if err := rows.Scan(&category); err != nil {
			rows.Close()
			return nil, 0, err
		}
		categories = append(categories, category)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, 0, err
	}
	rows.Close()
	return categories, int64(len(categories)), tx.Commit(ctx)
}

func fieldPayload(spec domain.Spec, fields map[string]json.RawMessage) ([]string, []byte, error) {
	allowed := make(map[string]struct{}, len(spec.Fields))
	for _, field := range spec.Fields {
		allowed[field] = struct{}{}
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		if _, ok := allowed[key]; !ok {
			return nil, nil, domain.ErrInvalid
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	body, err := json.Marshal(fields)
	return keys, body, err
}

func filters(spec domain.Spec, tenant, parent int64) (string, []any) {
	where := "r.business_tenant_id=$1 AND r.deleted_at IS NULL"
	args := []any{tenant}
	if spec.ParentColumn != "" {
		where += " AND r." + spec.ParentColumn + "=$2"
		args = append(args, parent)
	}
	return where, args
}

func (p *Postgres) one(ctx context.Context, tenant int64, query string, args ...any) (json.RawMessage, error) {
	return p.oneQuery(ctx, tenant, query, append([]any{tenant}, args...)...)
}

func (p *Postgres) oneQuery(ctx context.Context, tenant int64, query string, args ...any) (json.RawMessage, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer rollback(tx)
	var item []byte
	if err := tx.QueryRow(ctx, query, args...).Scan(&item); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return json.RawMessage(item), tx.Commit(ctx)
}
