// 本文件查询项目选择器和可见工时页，不执行写操作。
package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"starpivot.local/deepseek-harness-backend/internal/labor/domain"
)

var readOptions = pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly}

const projectFilter = `business_tenant_id=$1 AND deleted_at IS NULL
	AND ($2='' OR strpos(lower(code), lower($2))>0 OR strpos(lower(name), lower($2))>0)`

// Projects 在同一快照中查询项目选项和匹配总数。
func (p *Postgres) Projects(ctx context.Context, tenant int64, keyword string, page, size int) (domain.ProjectPage, error) {
	result := domain.ProjectPage{Items: make([]domain.Project, 0), Page: page, PageSize: size}
	tx, err := p.begin(ctx, tenant, readOptions)
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM public.prj_projects WHERE "+projectFilter,
		tenant, keyword).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT id,code,name FROM public.prj_projects WHERE "+projectFilter+
		" ORDER BY code,id LIMIT $3 OFFSET $4", tenant, keyword, size, int64(page-1)*int64(size))
	if err != nil {
		return result, err
	}
	result.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[domain.Project])
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

const taskFilter = `business_tenant_id=$1 AND project_id=$2 AND deleted_at IS NULL
	AND ($3='' OR strpos(lower(code), lower($3))>0 OR strpos(lower(name), lower($3))>0)`

// Tasks 查询同租户有效项目的任务选项。
func (p *Postgres) Tasks(ctx context.Context, tenant int64, code, keyword string, page, size int) (domain.TaskPage, error) {
	result := domain.TaskPage{Items: make([]domain.Task, 0), Page: page, PageSize: size}
	tx, err := p.begin(ctx, tenant, readOptions)
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	project, err := projectID(ctx, tx, tenant, code, false)
	if err != nil {
		return result, err
	}
	if err := tx.QueryRow(ctx, "SELECT count(*) FROM public.prj_project_tasks WHERE "+taskFilter,
		tenant, project, keyword).Scan(&result.Total); err != nil {
		return result, err
	}
	rows, err := tx.Query(ctx, "SELECT id,code,name,status FROM public.prj_project_tasks WHERE "+taskFilter+
		" ORDER BY code,id LIMIT $4 OFFSET $5", tenant, project, keyword, size, int64(page-1)*int64(size))
	if err != nil {
		return result, err
	}
	result.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[domain.Task])
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}

const visibleRecords = `business_tenant_id=$1 AND project_id=$2 AND (status='approved' OR user_id=$3 AND $3>0)`
const recordFilter = `(nullif($4,'')::date IS NULL OR work_date>=nullif($4,'')::date)
	AND (nullif($5,'')::date IS NULL OR work_date<=nullif($5,'')::date)
	AND ($6='' OR status=$6) AND ($7::bigint=0 OR user_id=$7)`

// List 在同一快照查询匹配页、筛选总数和访问范围内的档案总数。
func (p *Postgres) List(ctx context.Context, actor domain.Actor, code string, query domain.ListQuery) (domain.Page, error) {
	result := domain.Page{Items: make([]domain.Record, 0), Page: query.Page, PageSize: query.PageSize}
	if err := query.Validate(); err != nil {
		return result, err
	}
	tx, err := p.begin(ctx, actor.TenantID, readOptions)
	if err != nil {
		return result, err
	}
	defer rollback(tx)
	project, err := projectID(ctx, tx, actor.TenantID, code, false)
	if err != nil {
		return result, err
	}
	args := []any{actor.TenantID, project, actor.UserID, query.DateFrom, query.DateTo, query.Status, query.UserID}
	if err := tx.QueryRow(ctx, "SELECT count(*),count(*) FILTER (WHERE "+recordFilter+
		") FROM public.fin_labor_hours WHERE "+visibleRecords, args...).Scan(&result.ArchiveTotal, &result.Total); err != nil {
		return result, err
	}
	order := "entry.work_date DESC NULLS LAST, entry.id DESC"
	if query.SortBy != "" {
		order = fmt.Sprintf("entry.%s %s NULLS LAST", query.SortBy, query.SortDir)
		if query.SortBy != "id" {
			order += ", entry.id DESC"
		}
	}
	args = append(args, query.PageSize, int64(query.Page-1)*int64(query.PageSize))
	rows, err := tx.Query(ctx, "SELECT "+recordProjection+" FROM public.fin_labor_hours entry WHERE "+visibleRecords+
		" AND "+recordFilter+" ORDER BY "+order+" LIMIT $8 OFFSET $9", args...)
	if err != nil {
		return result, err
	}
	result.Items, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Record, error) {
		return scanRecord(row, actor)
	})
	if err != nil {
		return result, err
	}
	return result, tx.Commit(ctx)
}
