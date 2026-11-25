// Package repository 实现按本人和租户隔离的日报事务，不依赖传输层。
package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
)

const columns = `id, work_date::text, completed_work, in_progress_work, planned_work,
 issues_and_risks, need_support, evidence_refs, status, version, created_at, updated_at, submitted_at`
const selectSQL = `SELECT ` + columns + ` FROM public.tsk_daily_work_reports
 WHERE business_tenant_id=$1 AND user_id=$2 AND work_date=$3::date`

// Postgres 仅接收经鉴权解析的用户和租户。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定连接池，不运行迁移。
func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

func scan(row pgx.Row) (*domain.Report, error) {
	var r domain.Report
	var refs []byte
	err := row.Scan(&r.ID, &r.WorkDate, &r.CompletedWork, &r.InProgressWork, &r.PlannedWork,
		&r.IssuesAndRisks, &r.NeedSupport, &refs, &r.Status, &r.Version, &r.CreatedAt, &r.UpdatedAt, &r.SubmittedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(refs, &r.EvidenceRefs); err != nil {
		return nil, err
	}
	return &r, nil
}

// Get 返回本人指定日期的日报，不接受调用方指定他人 ID。
func (p *Postgres) Get(ctx context.Context, tenant, user int64, date string) (*domain.Report, error) {
	return scan(p.pool.QueryRow(ctx, selectSQL, tenant, user, date))
}

// Save 在同一事务中完成版本检查、幂等检查和审计更新。
func (p *Postgres) Save(ctx context.Context, tenant, user int64, date string, input domain.Input) (*domain.Report, error) {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	// 同一用户的日记录串行化，保护首次新增和跨日期请求标识唯一性。
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, fmtOwner(tenant, user)); err != nil {
		return nil, err
	}
	data, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(data)
	digest := hex.EncodeToString(hash[:])
	var oldID, oldHash, oldDate string
	err = tx.QueryRow(ctx, `SELECT last_request_id::text,last_request_hash,work_date::text FROM public.tsk_daily_work_reports
 WHERE business_tenant_id=$1 AND user_id=$2 AND last_request_id=$3::uuid`, tenant, user, input.RequestID).Scan(&oldID, &oldHash, &oldDate)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if oldID != "" {
		if oldHash != digest || oldDate != date {
			return nil, domain.ErrConflict
		}
		return scan(tx.QueryRow(ctx, selectSQL, tenant, user, date))
	}
	refs := input.EvidenceRefs
	if refs == nil {
		refs = []domain.Evidence{}
	}
	encoded, err := json.Marshal(refs)
	if err != nil {
		return nil, err
	}
	row := tx.QueryRow(ctx, saveSQL, tenant, user, date, input.CompletedWork, input.InProgressWork, input.PlannedWork,
		input.IssuesAndRisks, input.NeedSupport, encoded, input.Status, input.RequestID, digest, input.ExpectedVersion)
	report, err := scan(row)
	if err != nil {
		return nil, err
	}
	if report == nil {
		return nil, domain.ErrConflict
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return report, nil
}
