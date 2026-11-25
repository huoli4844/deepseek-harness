// 本文件写入工时并使用数据库状态条件控制并发提交。
package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"starpivot.local/deepseek-harness-backend/internal/labor/domain"
)

const ownRecord = `business_tenant_id=$1 AND project_id=$2 AND user_id=$3 AND id=$4`

// Create 保存由可信身份提供填报人的新草稿。
func (p *Postgres) Create(ctx context.Context, actor domain.Actor, code string, draft domain.Draft) (domain.Record, error) {
	tx, err := p.begin(ctx, actor.TenantID, pgx.TxOptions{})
	if err != nil {
		return domain.Record{}, err
	}
	defer rollback(tx)
	project, err := projectID(ctx, tx, actor.TenantID, code, true)
	if err != nil {
		return domain.Record{}, err
	}
	if err := checkTask(ctx, tx, actor.TenantID, project, draft.TaskID); err != nil {
		return domain.Record{}, err
	}
	row := tx.QueryRow(ctx, `INSERT INTO public.fin_labor_hours
		(business_tenant_id, project_id, user_id, task_id, work_date, hours, work_type, description, completion_status, status)
		VALUES ($1,$2,$3,$4,$5::text::date,$6::text::numeric,$7,$8,$9,'draft') RETURNING `+recordProjection,
		actor.TenantID, project, actor.UserID, draft.TaskID, draft.WorkDate, draft.Hours, draft.WorkType, draft.Description, draft.CompletionStatus)
	r, err := scanRecord(row, actor)
	if err != nil {
		return domain.Record{}, err
	}
	return r, tx.Commit(ctx)
}

// Update 保存本人草稿或驳回项。驳回项重新保存后恢复草稿状态。
func (p *Postgres) Update(ctx context.Context, actor domain.Actor, code string, id int64, draft domain.Draft) (domain.Record, error) {
	tx, err := p.begin(ctx, actor.TenantID, pgx.TxOptions{})
	if err != nil {
		return domain.Record{}, err
	}
	defer rollback(tx)
	project, err := projectID(ctx, tx, actor.TenantID, code, true)
	if err != nil {
		return domain.Record{}, err
	}
	args := []any{actor.TenantID, project, actor.UserID, id}
	if err := checkTask(ctx, tx, actor.TenantID, project, draft.TaskID); err != nil {
		return domain.Record{}, err
	}
	row := tx.QueryRow(ctx, `UPDATE public.fin_labor_hours SET task_id=$5, work_date=$6::text::date,
		hours=$7::text::numeric, work_type=$8, description=$9, completion_status=$10, updated_at=now(), status='draft',
		submitted_at=NULL, approved_at=NULL, approved_by=0 WHERE `+ownRecord+
		" AND status IN ('draft','rejected') RETURNING "+recordProjection,
		append(args, draft.TaskID, draft.WorkDate, draft.Hours, draft.WorkType, draft.Description, draft.CompletionStatus)...)
	return finishMutation(ctx, tx, row, args, actor)
}

// Submit 提交本人有效草稿，并在同一语句记录状态和时间。
func (p *Postgres) Submit(ctx context.Context, actor domain.Actor, code string, id int64) (domain.Record, error) {
	tx, err := p.begin(ctx, actor.TenantID, pgx.TxOptions{})
	if err != nil {
		return domain.Record{}, err
	}
	defer rollback(tx)
	project, err := projectID(ctx, tx, actor.TenantID, code, true)
	if err != nil {
		return domain.Record{}, err
	}
	args := []any{actor.TenantID, project, actor.UserID, id}
	existing, err := scanRecord(tx.QueryRow(ctx, "SELECT "+recordProjection+" FROM public.fin_labor_hours WHERE "+
		ownRecord+" FOR UPDATE", args...), actor)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Record{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Record{}, err
	}
	if existing.Status != "draft" {
		return domain.Record{}, domain.ErrConflict
	}
	if err := validateSubmission(existing); err != nil {
		return domain.Record{}, err
	}
	if err := checkTask(ctx, tx, actor.TenantID, project, existing.TaskID); err != nil {
		return domain.Record{}, err
	}
	row := tx.QueryRow(ctx, `UPDATE public.fin_labor_hours SET status='submitted', submitted_at=now()
		WHERE `+ownRecord+" RETURNING "+recordProjection, args...)
	r, err := scanRecord(row, actor)
	if err != nil {
		return domain.Record{}, err
	}
	return r, tx.Commit(ctx)
}

func validateSubmission(r domain.Record) error {
	if r.WorkDate == nil {
		return domain.ErrInvalid
	}
	return (domain.Draft{TaskID: r.TaskID, WorkDate: *r.WorkDate, Hours: r.Hours,
		WorkType: r.WorkType, Description: r.Description, CompletionStatus: r.CompletionStatus}).Validate()
}

func finishMutation(ctx context.Context, tx pgx.Tx, row pgx.Row, args []any, actor domain.Actor) (domain.Record, error) {
	r, err := scanRecord(row, actor)
	if errors.Is(err, pgx.ErrNoRows) {
		var id int64
		found := tx.QueryRow(ctx, "SELECT id FROM public.fin_labor_hours WHERE "+ownRecord, args...).Scan(&id)
		if errors.Is(found, pgx.ErrNoRows) {
			return domain.Record{}, domain.ErrNotFound
		}
		if found != nil {
			return domain.Record{}, found
		}
		return domain.Record{}, domain.ErrConflict
	}
	if err != nil {
		return domain.Record{}, err
	}
	return r, tx.Commit(ctx)
}
