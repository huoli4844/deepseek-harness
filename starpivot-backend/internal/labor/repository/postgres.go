// Package repository 实现租户内项目与工时的 PostgreSQL 访问。
package repository

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/labor/domain"
)

// Postgres 执行参数化工时事务。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定业务数据库连接池。
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

func projectID(ctx context.Context, tx pgx.Tx, tenant int64, code string, write bool) (int64, error) {
	query := `SELECT id FROM public.prj_projects WHERE business_tenant_id=$1 AND code=$2 AND deleted_at IS NULL`
	if write {
		query += " FOR SHARE"
	}
	var id int64
	err := tx.QueryRow(ctx, query, tenant, code).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, domain.ErrNotFound
	}
	return id, err
}

func checkTask(ctx context.Context, tx pgx.Tx, tenantID, project int64, task *int64) error {
	if task == nil {
		return nil
	}
	var taskID int64
	err := tx.QueryRow(ctx, `SELECT id FROM public.prj_project_tasks
		WHERE business_tenant_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL FOR SHARE`,
		tenantID, project, *task).Scan(&taskID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	return err
}

const recordProjection = `id, user_id, project_id, task_id, to_char(work_date,'YYYY-MM-DD'), hours::text,
	work_type, description, status, completion_status, submitted_at, approved_at, nullif(approved_by,0), created_at, updated_at`

func scanRecord(row pgx.Row, actor domain.Actor) (domain.Record, error) {
	var r domain.Record
	err := row.Scan(&r.ID, &r.UserID, &r.ProjectID, &r.TaskID, &r.WorkDate, &r.Hours,
		&r.WorkType, &r.Description, &r.Status, &r.CompletionStatus, &r.SubmittedAt, &r.ApprovedAt,
		&r.ApprovedBy, &r.CreatedAt, &r.UpdatedAt)
	r.SetPermissions(actor)
	return r, err
}
