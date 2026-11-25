// Package repository 将合同查询用例映射到既有 PostgreSQL 合同表。
package repository

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/contract/domain"
)

// Postgres 使用参数化租户条件查询合同台账。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定合同台账的数据库连接池。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

var readOptions = pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}

// 合同表没有删除标记，项目名称按同租户未删除项目左连接取得。
const contractFrom = `FROM public.fin_contracts c
	LEFT JOIN public.prj_projects p ON p.id = c.project_id
		AND p.business_tenant_id = c.business_tenant_id AND p.deleted_at IS NULL`

const contractFilter = `c.business_tenant_id = $1 AND ($2 = '' OR
	strpos(lower(c.code), lower($2)) > 0 OR
	strpos(lower(c.counterparty_name), lower($2)) > 0 OR
	strpos(lower(c.source_contract_no), lower($2)) > 0 OR
	strpos(lower(coalesce(p.code, '')), lower($2)) > 0 OR
	strpos(lower(coalesce(p.name, '')), lower($2)) > 0)`

const contractProjection = `c.id, c.code, c.contract_type, c.counterparty_name, c.project_id,
	p.code AS project_code, p.name AS project_name, c.signed_date, c.effective_date, c.expiry_date,
	c.total_amount, c.tax_amount, c.owed_amount, c.warranty_amount, c.status, c.updated_at`

// sortExpressions 只包含领域层白名单字段，避免排序参数拼入任意 SQL。
var sortExpressions = map[string]string{
	"id": "c.id", "code": "c.code", "contract_type": "c.contract_type",
	"counterparty_name": "c.counterparty_name", "project_code": "p.code", "project_name": "p.name",
	"signed_date": "c.signed_date", "effective_date": "c.effective_date", "expiry_date": "c.expiry_date",
	"total_amount": "c.total_amount", "tax_amount": "c.tax_amount", "owed_amount": "c.owed_amount",
	"warranty_amount": "c.warranty_amount", "status": "c.status", "updated_at": "c.updated_at",
}

// List 在同一只读快照内返回匹配页、匹配总数和合同档案总数。
func (p *Postgres) List(ctx context.Context, tenant int64, q domain.ListQuery) (domain.Page, error) {
	result := domain.Page{Items: make([]json.RawMessage, 0), Page: q.Page, PageSize: q.PageSize}
	if !q.Valid() {
		return result, domain.ErrInvalid
	}
	tx, err := p.begin(ctx, tenant)
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	if err := tx.QueryRow(ctx, "SELECT count(*) "+contractFrom+" WHERE "+contractFilter,
		tenant, q.Keyword).Scan(&result.Total); err != nil {
		return result, err
	}
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM public.fin_contracts WHERE business_tenant_id = $1",
		tenant).Scan(&result.ArchiveTotal); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT to_jsonb(page) FROM (SELECT "+contractProjection+
		" "+contractFrom+" WHERE "+contractFilter+" ORDER BY "+orderBy(q)+" LIMIT $3 OFFSET $4) page",
		tenant, q.Keyword, q.PageSize, int64(q.Page-1)*int64(q.PageSize))
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var item json.RawMessage
		if err := rows.Scan(&item); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

// orderBy 生成白名单内的排序表达式，未指定时按最近更新时间倒序。
func orderBy(q domain.ListQuery) string {
	if q.SortBy == "" {
		return "c.updated_at DESC, c.id DESC"
	}
	return sortExpressions[q.SortBy] + " " + strings.ToUpper(q.SortDirection) + ", c.id DESC"
}

func (p *Postgres) begin(ctx context.Context, tenant int64) (pgx.Tx, error) {
	tx, err := p.pool.BeginTx(ctx, readOptions)
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
