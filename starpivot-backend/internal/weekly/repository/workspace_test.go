// 本文件验证周报登记的批量事务、访问隔离和已提交行的保护。
package repository_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
	"starpivot.local/deepseek-harness-backend/internal/weekly/repository"
)

func checkWorkspace(t *testing.T, ctx context.Context, pool *pgxpool.Pool, reports *application.Service) {
	t.Helper()
	var note string
	var columns, comments int
	err := pool.QueryRow(ctx, `SELECT obj_description('public.prj_project_weekly_report_items'::regclass),
		count(*), count(col_description(attrelid, attnum)) FROM pg_attribute
		WHERE attrelid='public.prj_project_weekly_report_items'::regclass AND attnum>0 AND NOT attisdropped`).Scan(&note, &columns, &comments)
	if err != nil || note == "" || columns != 8 || comments != columns {
		t.Fatalf("登记明细缺少表或字段备注：%q %d/%d / %v", note, comments, columns, err)
	}
	const start = "2026-11-30"
	service := application.NewWorkspace(repository.New(pool))
	empty, err := service.Get(ctx, 7, 9, start)
	if err != nil || empty.Items == nil || len(empty.Items) != 0 || empty.PeriodEnd != "2026-12-06" {
		t.Fatalf("空周应返回空数组：%+v / %v", empty, err)
	}
	a := domain.ItemDraft{ProjectCode: "PROJECT.1", TaskID: 1, WorkType: "direct", CompletionStatus: "in_progress"}
	b := domain.ItemDraft{ProjectCode: "PROJECT-2", TaskID: 2, WorkType: "meeting", CompletionStatus: "completed"}
	if view, err := service.Save(ctx, 7, 9, start, []domain.ItemDraft{a, b}); err != nil || len(view.Items) != 2 ||
		view.Items[0].TaskName != "项目一任务" || view.Items[1].ReportStatus != "draft" {
		t.Fatalf("保存多个项目的登记失败：%+v / %v", view, err)
	}
	if view, err := service.Save(ctx, 7, 10, start, []domain.ItemDraft{b}); err != nil || len(view.Items) != 1 {
		t.Fatalf("保存其他用户的登记失败：%+v / %v", view, err)
	}
	invalid := a
	invalid.TaskID = 3
	if _, err := service.Save(ctx, 7, 9, start, []domain.ItemDraft{b, invalid}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("不能登记其他租户的任务：%v", err)
	}
	if view, err := service.Get(ctx, 7, 9, start); err != nil || len(view.Items) != 2 {
		t.Fatalf("无效请求回滚后应保留原记录：%+v / %v", view, err)
	}
	draft := domain.Draft{ProgressSummary: "进展", CompletedWork: "完成工作", PlannedWork: "下周计划"}
	if _, err := reports.Save(ctx, 7, 19, a.ProjectCode, start, draft); err != nil {
		t.Fatal(err)
	}
	if _, err := reports.Submit(ctx, 7, 19, a.ProjectCode, start); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Save(ctx, 7, 9, start, []domain.ItemDraft{a}); !errors.Is(err, domain.ErrLocked) {
		t.Fatalf("登记不应改动已提交周报：%v", err)
	}
	if view, err := service.Save(ctx, 7, 9, start, nil); err != nil || len(view.Items) != 1 || view.Items[0].ReportStatus != "submitted" {
		t.Fatalf("应仅清除本人的草稿并保留已提交事项：%+v / %v", view, err)
	}
	if view, err := service.Get(ctx, 7, 10, start); err != nil || len(view.Items) != 1 {
		t.Fatalf("不应删除其他员工的登记：%+v / %v", view, err)
	}
}
