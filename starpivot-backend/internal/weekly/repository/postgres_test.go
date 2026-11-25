// 本文件用一次性的回环数据库验证周报迁移、租户隔离和提交事务。
package repository_test

import (
	"context"
	"errors"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
	"starpivot.local/deepseek-harness-backend/internal/weekly/repository"
)

func TestPostgresWeeklyReportLifecycle(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool := weeklyTestPool(t, ctx)
	checkMigration(t, ctx, pool)
	service := application.New(repository.New(pool))
	const code = "PROJECT.1"
	const start = "2026-11-23"

	initial, err := service.Get(ctx, 7, code, start)
	if err != nil || initial.Report != nil || initial.Labor.TotalHours != "3.75" ||
		len(initial.Labor.Employees) != 2 || initial.Labor.Employees[0] != (domain.EmployeeHours{UserID: 8, Hours: "2.50"}) {
		t.Fatalf("只应汇总同租户同项目自然周的已批准工时：%+v / %v", initial, err)
	}
	if _, err := service.Get(ctx, 8, code, start); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("跨租户读取应拒绝：%v", err)
	}
	if _, err := service.Save(ctx, 8, 9, code, start, domain.Draft{}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("跨租户写入应拒绝：%v", err)
	}
	if _, err := service.Submit(ctx, 7, 9, code, start); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("缺少草稿应拒绝提交：%v", err)
	}
	empty, err := service.Save(ctx, 7, 9, code, start, domain.Draft{})
	if err != nil || empty.Report == nil || empty.Report.Status != "draft" || empty.Report.PeriodEnd != "2026-11-29" {
		t.Fatalf("保存空白草稿失败：%+v / %v", empty, err)
	}
	if _, err := service.Submit(ctx, 7, 9, code, start); !errors.Is(err, domain.ErrIncomplete) {
		t.Fatalf("必填正文为空时应拒绝提交：%v", err)
	}
	draft := domain.Draft{ProgressSummary: "进展", CompletedWork: "已完成", PlannedWork: "下周计划"}
	updated, err := service.Save(ctx, 7, 19, code, start, draft)
	if err != nil || updated.Report == nil || updated.Report.ID != empty.Report.ID ||
		updated.Report.CreatedBy != 9 || !updated.Report.CreatedAt.Equal(empty.Report.CreatedAt) {
		t.Fatalf("更新草稿应保留创建审计：%+v / %v", updated, err)
	}
	submitted, err := service.Submit(ctx, 7, 19, code, start)
	if err != nil || submitted.Report == nil || submitted.Report.Status != "submitted" ||
		submitted.Report.SubmittedBy == nil || *submitted.Report.SubmittedBy != 19 ||
		submitted.Report.SubmittedAt == nil || submitted.Report.CompletedWork != draft.CompletedWork {
		t.Fatalf("提交审计有误：%+v / %v", submitted, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE public.fin_labor_hours SET status = 'approved' WHERE id = 4`); err != nil {
		t.Fatal(err)
	}
	retried, err := service.Submit(ctx, 7, 29, code, start)
	if err != nil || retried.Report == nil || retried.Report.SubmittedBy == nil ||
		*retried.Report.SubmittedBy != 19 || retried.Report.SubmittedAt == nil ||
		!retried.Report.SubmittedAt.Equal(*submitted.Report.SubmittedAt) || retried.Labor.TotalHours != "103.75" {
		t.Fatalf("重复提交应保留审计并读取实时工时：%+v / %v", retried, err)
	}
	if _, err := service.Save(ctx, 7, 19, code, start, draft); !errors.Is(err, domain.ErrLocked) {
		t.Fatalf("已提交周报应锁定正文：%v", err)
	}
	checkWorkspace(t, ctx, pool, service)
}

func weeklyTestPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_WEEKLY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("未配置隔离的 PostgreSQL 周报测试库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || cfg.ConnConfig.Database != "dsh_weekly_test" {
		t.Fatal("周报测试必须使用回环地址和 dsh_weekly_test 库")
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	runSQL(t, ctx, pool, `CREATE TABLE public.prj_projects (
		id bigint PRIMARY KEY, business_tenant_id bigint NOT NULL, code varchar(64) UNIQUE, deleted_at timestamptz);
		CREATE TABLE public.fin_labor_hours (
		id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, business_tenant_id bigint NOT NULL, project_id bigint NOT NULL,
		user_id bigint NOT NULL, work_date date, hours numeric(5,2) NOT NULL, status varchar(20) NOT NULL);
		INSERT INTO public.prj_projects (id, business_tenant_id, code) VALUES (1,7,'PROJECT.1'), (2,7,'PROJECT-2');
		CREATE TABLE public.prj_project_tasks (
		id bigint PRIMARY KEY, business_tenant_id bigint NOT NULL, project_id bigint NOT NULL, name text NOT NULL, deleted_at timestamptz);
		INSERT INTO public.prj_project_tasks (id, business_tenant_id, project_id, name) VALUES
		(1,7,1,'项目一任务'), (2,7,2,'项目二任务'), (3,8,1,'其他租户任务');
		ALTER TABLE public.prj_projects ADD COLUMN name text NOT NULL DEFAULT '测试项目';
		INSERT INTO public.fin_labor_hours (business_tenant_id,project_id,user_id,work_date,hours,status) VALUES
		(7,1,8,'2026-11-23',1.50,'approved'), (7,1,8,'2026-11-29',1.00,'approved'),
		(7,1,9,'2026-11-24',1.25,'approved'), (7,1,8,'2026-11-24',100,'submitted'),
		(8,1,8,'2026-11-24',100,'approved'), (7,2,8,'2026-11-24',100,'approved'),
		(7,1,8,'2026-11-22',100,'approved'), (7,1,8,'2026-11-30',100,'approved'),
		(7,1,8,NULL,100,'approved');`)
	migration, err := os.ReadFile("../../../migrations/0002_project_weekly_reports.sql")
	if err != nil {
		t.Fatal(err)
	}
	runSQL(t, ctx, pool, string(migration))
	migration, err = os.ReadFile("../../../migrations/0004_weekly_report_items.sql")
	if err != nil {
		t.Fatal(err)
	}
	runSQL(t, ctx, pool, string(migration))
	return pool
}

func runSQL(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sql string) {
	t.Helper()
	if _, err := pool.Exec(ctx, sql); err != nil {
		t.Fatal(err)
	}
}

func checkMigration(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var table string
	var fields, commented int
	err := pool.QueryRow(ctx, `SELECT obj_description('public.prj_project_weekly_reports'::regclass),
		count(*), count(col_description(attrelid, attnum)) FROM pg_attribute
		WHERE attrelid='public.prj_project_weekly_reports'::regclass AND attnum>0 AND NOT attisdropped`).Scan(&table, &fields, &commented)
	if err != nil || fields != 16 || commented != 16 || table != "项目周报表，记录项目每周进展、风险和下周计划" {
		t.Fatalf("周报表和字段备注缺失：表 %q 字段 %d 备注 %d / %v", table, fields, commented, err)
	}
	var statusComment string
	err = pool.QueryRow(ctx, `SELECT col_description(attrelid, attnum) FROM pg_attribute
		WHERE attrelid='public.prj_project_weekly_reports'::regclass AND attname='status'`).Scan(&statusComment)
	if err != nil || !strings.Contains(statusComment, "draft 表示草稿") || !strings.Contains(statusComment, "submitted 表示已提交") {
		t.Fatalf("周报状态备注缺少取值说明：%s / %v", statusComment, err)
	}
	const insert = `INSERT INTO public.prj_project_weekly_reports (business_tenant_id, project_id, period_start, period_end,
		created_by, progress_summary, completed_work, planned_work, status) VALUES (7,1,$1,$2,9,'','','',$3)`
	for _, invalid := range [][]any{
		{"2026-11-24", "2026-11-30", "draft"},
		{"2026-11-23", "2026-11-28", "draft"},
		{"2026-11-23", "2026-11-29", "submitted"},
		{"2026-11-23", "2026-11-29", "invalid"},
	} {
		if _, err := pool.Exec(ctx, insert, invalid...); err == nil {
			t.Fatalf("数据库应拒绝无效周报：%v", invalid)
		}
	}
}
