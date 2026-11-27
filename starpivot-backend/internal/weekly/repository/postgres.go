// Package repository 实现 PostgreSQL 周报仓储，不依赖传输或鉴权协议。
package repository

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

const reportColumns = `id, business_tenant_id, period_start, period_end,
	progress_summary, completed_work, planned_work, issues_and_risks, need_support,
	status, created_by, submitted_by, submitted_at, created_at, updated_at`

const selectReport = `SELECT ` + reportColumns + ` FROM public.prj_project_weekly_reports
	WHERE business_tenant_id=$1 AND created_by=$2 AND period_start=$3`

const saveReport = `INSERT INTO public.prj_project_weekly_reports AS report (
	business_tenant_id, period_start, period_end, created_by, progress_summary,
	completed_work, planned_work, issues_and_risks, need_support
)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (business_tenant_id, created_by, period_start) DO UPDATE SET
	progress_summary=EXCLUDED.progress_summary, completed_work=EXCLUDED.completed_work,
	planned_work=EXCLUDED.planned_work, issues_and_risks=EXCLUDED.issues_and_risks,
	need_support=EXCLUDED.need_support, updated_at=clock_timestamp()
WHERE report.status='draft'
RETURNING ` + reportColumns

const submitReport = `UPDATE public.prj_project_weekly_reports
	SET status='submitted', submitted_by=$4, submitted_at=statement_timestamp(), updated_at=statement_timestamp()
	WHERE business_tenant_id=$1 AND created_by=$2 AND period_start=$3 AND status='draft'
	RETURNING ` + reportColumns

// Postgres 按可信租户读取和保存用户周报。
type Postgres struct{ pool *pgxpool.Pool }

// New 绑定调用方提供的数据库连接池。
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

// validateRowProjects 校验正文 JSON 行内引用的项目编码都属于当前租户且未删除。
func validateRowProjects(ctx context.Context, tx pgx.Tx, tenant int64, draft domain.Draft) error {
	for _, code := range draft.RowProjectCodes() {
		var exists bool
		err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM public.prj_projects
			WHERE business_tenant_id=$1 AND code=$2 AND deleted_at IS NULL)`, tenant, code).Scan(&exists)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrNotFound
		}
	}
	return nil
}

// Get 在同一只读快照中返回本人周报和自然周内本人的已批准工时。
func (p *Postgres) Get(ctx context.Context, tenant, user int64, week domain.Week) (domain.View, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return domain.View{}, err
	}
	defer rollback(tx)
	report, err := scanReport(tx.QueryRow(ctx, selectReport, tenant, user, week.Start))
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return domain.View{}, err
	}
	return commitView(ctx, tx, tenant, user, week, report)
}

// Save 按用户周键新增或更新草稿，并校验正文行内项目归属；已提交周报返回锁定。
func (p *Postgres) Save(ctx context.Context, tenant, actor int64, week domain.Week, draft domain.Draft) (domain.View, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return domain.View{}, err
	}
	defer rollback(tx)
	if err := validateRowProjects(ctx, tx, tenant, draft); err != nil {
		return domain.View{}, err
	}
	report, err := scanReport(tx.QueryRow(ctx, saveReport, tenant, week.Start, week.End, actor,
		draft.ProgressSummary, draft.CompletedWork, draft.PlannedWork, draft.IssuesAndRisks, draft.NeedSupport))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.View{}, domain.ErrLocked
	}
	if err != nil {
		return domain.View{}, err
	}
	return commitView(ctx, tx, tenant, actor, week, report)
}

// Submit 写入提交审计字段。重复提交读取同一记录，保留首次提交信息。
func (p *Postgres) Submit(ctx context.Context, tenant, actor int64, week domain.Week) (domain.View, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return domain.View{}, err
	}
	defer rollback(tx)
	// 先锁定周报，保证提交审计时间在等待其他写入结束后取得。
	report, err := scanReport(tx.QueryRow(ctx, selectReport+" FOR UPDATE", tenant, actor, week.Start))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.View{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.View{}, err
	}
	if report.Status == "draft" {
		if err := report.Draft.ValidateForSubmit(); err != nil {
			return domain.View{}, err
		}
		if !report.Complete() {
			return domain.View{}, domain.ErrIncomplete
		}
		if err := validateRowProjects(ctx, tx, tenant, report.Draft); err != nil {
			return domain.View{}, err
		}
		report, err = scanReport(tx.QueryRow(ctx, submitReport, tenant, actor, week.Start, actor))
		if err != nil {
			return domain.View{}, err
		}
	}
	return commitView(ctx, tx, tenant, actor, week, report)
}

func scanReport(row pgx.Row) (*domain.Report, error) {
	var report domain.Report
	var start, end time.Time
	err := row.Scan(&report.ID, &report.BusinessTenantID, &start, &end,
		&report.ProgressSummary, &report.CompletedWork, &report.PlannedWork, &report.IssuesAndRisks,
		&report.NeedSupport, &report.Status, &report.CreatedBy, &report.SubmittedBy, &report.SubmittedAt,
		&report.CreatedAt, &report.UpdatedAt)
	if err != nil {
		return nil, err
	}
	report.PeriodStart = start.Format(time.DateOnly)
	report.PeriodEnd = end.Format(time.DateOnly)
	return &report, nil
}

func commitView(ctx context.Context, tx pgx.Tx, tenant, user int64, week domain.Week, report *domain.Report) (domain.View, error) {
	labor, err := laborSummary(ctx, tx, tenant, user, week)
	if err != nil {
		return domain.View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.View{}, err
	}
	return domain.View{Report: report, Labor: labor}, nil
}

// laborSummary 汇总本人自然周内全部项目的已批准工时。
func laborSummary(ctx context.Context, tx pgx.Tx, tenant, user int64, week domain.Week) (domain.LaborSummary, error) {
	const query = `SELECT user_id, sum(hours)::text, (sum(sum(hours)) OVER ())::text
		FROM public.fin_labor_hours
		WHERE business_tenant_id=$1 AND user_id=$2 AND work_date BETWEEN $3 AND $4 AND status='approved'
		GROUP BY user_id ORDER BY user_id`
	rows, err := tx.Query(ctx, query, tenant, user, week.Start, week.End)
	if err != nil {
		return domain.LaborSummary{}, err
	}
	defer rows.Close()
	summary := domain.LaborSummary{TotalHours: "0.00", Employees: []domain.EmployeeHours{}}
	for rows.Next() {
		var employee domain.EmployeeHours
		if err := rows.Scan(&employee.UserID, &employee.Hours, &summary.TotalHours); err != nil {
			return domain.LaborSummary{}, err
		}
		summary.Employees = append(summary.Employees, employee)
	}
	return summary, rows.Err()
}
