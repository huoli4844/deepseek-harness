// 本文件执行个人周报登记查询和事务写入。
package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

const selectWorkspace = `SELECT i.id, r.id, r.status, p.code, p.name, i.task_id, t.name, i.work_type,
	i.completion_status, i.has_risk, i.risk_details
	FROM public.prj_project_weekly_report_items i
	JOIN public.prj_project_weekly_reports r ON r.id=i.report_id
	JOIN public.prj_projects p ON p.id=r.project_id AND p.business_tenant_id=r.business_tenant_id
	JOIN public.prj_project_tasks t ON t.id=i.task_id AND t.business_tenant_id=r.business_tenant_id AND t.project_id=r.project_id
	WHERE r.business_tenant_id=$1 AND i.user_id=$2 AND r.period_start=$3 AND p.deleted_at IS NULL
	ORDER BY i.id`

// GetWorkspace 返回当前员工在该自然周的登记明细。
func (p *Postgres) GetWorkspace(ctx context.Context, tenant, user int64, week domain.Week) (domain.Workspace, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return domain.Workspace{}, err
	}
	defer rollback(tx)
	return commitWorkspace(ctx, tx, tenant, user, week)
}

// SaveWorkspace 在同一事务中替换本人草稿明细，并保留已提交的登记。
func (p *Postgres) SaveWorkspace(ctx context.Context, tenant, user int64, week domain.Week, items []domain.ItemDraft) (domain.Workspace, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return domain.Workspace{}, err
	}
	defer rollback(tx)
	// 同租户同周的多项目请求必须串行获取周报行锁，避免两个批量保存交错锁定。
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended(
		'project-weekly-workspace/' || $1::bigint::text || '/' || $2::text, 0))`,
		tenant, week.Start.Format(time.DateOnly)); err != nil {
		return domain.Workspace{}, err
	}
	projects, err := ensureWorkspaceProjects(ctx, tx, tenant, user, week, items)
	if err != nil {
		return domain.Workspace{}, err
	}
	headers, err := lockWorkspaceReports(ctx, tx, tenant, user, week, projects)
	if err != nil {
		return domain.Workspace{}, err
	}
	if err := replaceWorkspaceItems(ctx, tx, tenant, user, items, projects, headers); err != nil {
		return domain.Workspace{}, err
	}
	return commitWorkspace(ctx, tx, tenant, user, week)
}

func ensureWorkspaceProjects(ctx context.Context, tx pgx.Tx, tenant, user int64, week domain.Week, items []domain.ItemDraft) (map[string]int64, error) {
	projects := make(map[string]int64)
	for _, item := range items {
		if _, exists := projects[item.ProjectCode]; exists {
			continue
		}
		project, err := projectID(ctx, tx, tenant, item.ProjectCode, true)
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(ctx, `INSERT INTO public.prj_project_weekly_reports
			(business_tenant_id, project_id, period_start, period_end, created_by, progress_summary, completed_work, planned_work)
			VALUES ($1,$2,$3,$4,$5,'','','') ON CONFLICT (business_tenant_id, project_id, period_start) DO NOTHING`,
			tenant, project, week.Start, week.End, user)
		if err != nil {
			return nil, err
		}
		projects[item.ProjectCode] = project
	}
	return projects, nil
}

// projectID 校验项目属于当前租户，并返回未删除项目的主键。
func projectID(ctx context.Context, tx pgx.Tx, tenant int64, code string, _ bool) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM public.prj_projects
		WHERE business_tenant_id=$1 AND code=$2 AND deleted_at IS NULL`, tenant, code).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, domain.ErrNotFound
	}
	return id, err
}

type workspaceHeader struct {
	ProjectID int64
	ID        int64
	Status    string
}

func lockWorkspaceReports(ctx context.Context, tx pgx.Tx, tenant, user int64, week domain.Week, projects map[string]int64) (map[int64]workspaceHeader, error) {
	projectIDs := make([]int64, 0, len(projects))
	for _, id := range projects {
		projectIDs = append(projectIDs, id)
	}
	// 旧登记与本次请求涉及的周报都必须锁定，确保批量保存与周报提交不会同时修改结果。
	rows, err := tx.Query(ctx, `SELECT r.project_id, r.id, r.status FROM public.prj_project_weekly_reports r
		JOIN public.prj_projects p ON p.id=r.project_id AND p.business_tenant_id=r.business_tenant_id
		WHERE r.business_tenant_id=$1 AND r.period_start=$2 AND p.deleted_at IS NULL AND (
			r.project_id=ANY($3::bigint[]) OR EXISTS (SELECT 1 FROM public.prj_project_weekly_report_items i
				WHERE i.report_id=r.id AND i.user_id=$4))
		ORDER BY r.project_id FOR UPDATE OF r`, tenant, week.Start, projectIDs, user)
	if err != nil {
		return nil, err
	}
	locked, err := pgx.CollectRows(rows, pgx.RowToStructByPos[workspaceHeader])
	if err != nil {
		return nil, err
	}
	headers := make(map[int64]workspaceHeader, len(locked))
	for _, header := range locked {
		headers[header.ProjectID] = header
	}
	return headers, nil
}

func replaceWorkspaceItems(ctx context.Context, tx pgx.Tx, tenant, user int64, items []domain.ItemDraft, projects map[string]int64, headers map[int64]workspaceHeader) error {
	draftIDs := make([]int64, 0, len(headers))
	for _, header := range headers {
		if header.Status == "draft" {
			draftIDs = append(draftIDs, header.ID)
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM public.prj_project_weekly_report_items
		WHERE user_id=$1 AND report_id=ANY($2::bigint[])`, user, draftIDs); err != nil {
		return err
	}
	for _, item := range items {
		projectID := projects[item.ProjectCode]
		header, ok := headers[projectID]
		if !ok {
			return domain.ErrNotFound
		}
		if header.Status != "draft" {
			return domain.ErrLocked
		}
		if err := insertWorkspaceItem(ctx, tx, tenant, user, header, item); err != nil {
			return err
		}
	}
	return nil
}

func insertWorkspaceItem(ctx context.Context, tx pgx.Tx, tenant, user int64, header workspaceHeader, item domain.ItemDraft) error {
	var task int64
	err := tx.QueryRow(ctx, `SELECT id FROM public.prj_project_tasks
		WHERE business_tenant_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL FOR SHARE`,
		tenant, header.ProjectID, item.TaskID).Scan(&task)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO public.prj_project_weekly_report_items
		(report_id,user_id,task_id,work_type,completion_status,has_risk,risk_details) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		header.ID, user, task, item.WorkType, item.CompletionStatus, item.HasRisk, item.RiskDetails)
	return err
}

func commitWorkspace(ctx context.Context, tx pgx.Tx, tenant, user int64, week domain.Week) (domain.Workspace, error) {
	rows, err := tx.Query(ctx, selectWorkspace, tenant, user, week.Start)
	if err != nil {
		return domain.Workspace{}, err
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Item, error) {
		var item domain.Item
		err := row.Scan(&item.ID, &item.ReportID, &item.ReportStatus, &item.ProjectCode, &item.ProjectName, &item.TaskID,
			&item.TaskName, &item.WorkType, &item.CompletionStatus, &item.HasRisk, &item.RiskDetails)
		return item, err
	})
	if err != nil {
		return domain.Workspace{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.Workspace{}, err
	}
	return domain.Workspace{PeriodStart: week.Start.Format(time.DateOnly), PeriodEnd: week.End.Format(time.DateOnly), Items: items}, nil
}
