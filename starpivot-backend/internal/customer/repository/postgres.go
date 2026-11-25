// Package repository 实现 PostgreSQL 客户仓储，不依赖 HTTP 或调用方身份协议。
package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/customer/domain"
)

const columns = `id, code, name, short_name, industry, level, contact_person, contact_phone, contact_email,
	address, credit_limit::text, credit_used::text, status, created_by, created_at, updated_at, deleted_at IS NOT NULL, deleted_at`
const visible = `business_tenant_id=$1 AND deleted_at IS NULL`
const customerMatch = `($2 = '' OR EXISTS (
	SELECT 1 FROM unnest(ARRAY[code, name, short_name, contact_person]) AS field(value)
	WHERE strpos(lower(field.value), lower($2)) > 0))
	AND ($3 = '' OR strpos(lower(code), lower($3)) > 0)
	AND ($4 = '' OR strpos(lower(name), lower($4)) > 0)
	AND ($5 = '' OR strpos(lower(contact_person), lower($5)) > 0)`

var sortableCustomerColumns = []string{"code", "name", "short_name", "contact_person", "contact_phone", "status", "created_at", "created_by"}

// Postgres 按经验证的租户执行客户查询和写入。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定调用方持有的连接池。
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

// List 即使页码超过末页也返回同一快照的有效客户总数。
func (p *Postgres) List(ctx context.Context, tenant int64, page, size int, query archivequery.Query) (domain.Page, error) {
	result := domain.Page{Items: make([]domain.Customer, 0), Page: page, Size: size}
	if !query.ValidSort(sortableCustomerColumns) {
		return result, domain.ErrInvalid
	}
	order := "id DESC"
	if query.SortBy != "" {
		order = fmt.Sprintf("%s %s NULLS LAST, id DESC", query.SortBy, query.SortDirection)
	}
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	args := []any{tenant, query.Keyword, query.Code, query.Name, query.ContactPerson}
	if err := tx.QueryRow(ctx, "SELECT count(*), count(*) FILTER (WHERE "+customerMatch+
		") FROM public.md_customers WHERE "+visible, args...).Scan(&result.ArchiveTotal, &result.Total); err != nil {
		return result, err
	}
	args = append(args, size, int64(page-1)*int64(size))
	rows, err := tx.Query(ctx, "SELECT "+columns+" FROM public.md_customers WHERE "+visible+" AND "+customerMatch+
		" ORDER BY "+order+" LIMIT $6 OFFSET $7", args...)
	if err != nil {
		return result, err
	}
	result.Items, err = pgx.AppendRows(result.Items, rows, func(row pgx.CollectableRow) (domain.Customer, error) {
		return scan(row)
	})
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

// Get 仅返回当前租户未删除的档案。
func (p *Postgres) Get(ctx context.Context, tenant, id int64) (domain.Customer, error) {
	return p.one(ctx, tenant, "SELECT "+columns+" FROM public.md_customers WHERE "+visible+" AND id=$2", id)
}

// Create 保存身份层提供的元枢用户 ID。
func (p *Postgres) Create(ctx context.Context, tenant, actor int64, d domain.Draft) (domain.Customer, error) {
	return p.one(ctx, tenant, `INSERT INTO public.md_customers (business_tenant_id, created_by, code, name, short_name,
		industry, level, contact_person, contact_phone, contact_email, address, credit_limit, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text::numeric,$13) RETURNING `+columns, draftArgs(actor, d)...)
}

// Update 保留创建与导入信息，只替换表单字段。
func (p *Postgres) Update(ctx context.Context, tenant, id int64, d domain.Draft) (domain.Customer, error) {
	return p.one(ctx, tenant, `UPDATE public.md_customers SET code=$3, name=$4, short_name=$5, industry=$6,
		level=$7, contact_person=$8, contact_phone=$9, contact_email=$10, address=$11,
		credit_limit=$12::text::numeric, status=$13, updated_at=now() WHERE `+visible+
		" AND id=$2 RETURNING "+columns, draftArgs(id, d)...)
}

// Delete 只写入删除时间和更新时间，保留原有外键关系。
func (p *Postgres) Delete(ctx context.Context, tenant, id int64) (domain.Customer, error) {
	return p.one(ctx, tenant, "UPDATE public.md_customers SET deleted_at=now(), updated_at=now() WHERE "+
		visible+" AND id=$2 RETURNING "+columns, id)
}

func draftArgs(id int64, d domain.Draft) []any {
	return []any{id, d.Code, d.Name, d.ShortName, d.Industry, d.Level, d.ContactPerson, d.ContactPhone,
		d.ContactEmail, d.Address, d.CreditLimit.String(), d.Status}
}

func (p *Postgres) one(ctx context.Context, tenant int64, query string, args ...any) (domain.Customer, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return domain.Customer{}, err
	}
	defer rollback(tx)
	c, err := scan(tx.QueryRow(ctx, query, append([]any{tenant}, args...)...))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Customer{}, domain.ErrNotFound
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "md_customers_code_key" {
		return domain.Customer{}, domain.ErrConflict
	}
	if err != nil {
		return domain.Customer{}, err
	}
	return c, tx.Commit(ctx)
}

func scan(row pgx.Row) (domain.Customer, error) {
	var c domain.Customer
	var limit, used string
	var status int16
	err := row.Scan(&c.ID, &c.Code, &c.Name, &c.ShortName, &c.Industry, &c.Level, &c.ContactPerson,
		&c.ContactPhone, &c.ContactEmail, &c.Address, &limit, &used, &status, &c.CreatedBy,
		&c.CreatedAt, &c.UpdatedAt, &c.IsDeleted, &c.DeletedAt)
	c.CreditLimit, c.CreditUsed, c.Status = json.Number(limit), json.Number(used), &status
	return c, err
}
