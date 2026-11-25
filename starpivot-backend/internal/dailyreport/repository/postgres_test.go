// 本文件只允许回环隔离库，演练真实迁移、备注、审计和并发版本规则。
package repository_test

import (
	"context"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"net"
	"os"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/application"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/repository"
	"strings"
	"testing"
	"time"
)

func TestDailyPostgresLifecycle(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool := testPool(t, ctx)
	service := application.New(repository.New(pool))
	date := "2026-11-25"
	input := domain.Input{Content: domain.Content{CompletedWork: "完成接口联调", EvidenceRefs: []domain.Evidence{}}, Status: "draft", RequestID: "00000000-0000-4000-8000-000000000001"}
	report, err := service.Save(ctx, 7, 8, date, input)
	if err != nil || report == nil || report.Version != 1 || report.SubmittedAt != nil {
		t.Fatalf("首次保存失败：%+v %v", report, err)
	}
	retry, err := service.Save(ctx, 7, 8, date, input)
	if err != nil || retry.ID != report.ID || !retry.UpdatedAt.Equal(report.UpdatedAt) {
		t.Fatalf("重复保存不应改审计：%+v %v", retry, err)
	}
	input.CompletedWork = "冒用幂等标识"
	if _, err = service.Save(ctx, 7, 8, date, input); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("应拒绝同标识不同正文：%v", err)
	}
	input.RequestID = "00000000-0000-4000-8000-000000000002"
	if _, err = service.Save(ctx, 7, 8, date, input); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("旧版本应冲突：%v", err)
	}
	input.ExpectedVersion = 1
	input.Status = "submitted"
	input.CompletedWork = "人工核对后的最终正文"
	submitted, err := service.Save(ctx, 7, 8, date, input)
	if err != nil || submitted.Version != 2 || submitted.Status != "submitted" || submitted.SubmittedAt == nil || !submitted.CreatedAt.Equal(report.CreatedAt) {
		t.Fatalf("提交审计错误：%+v %v", submitted, err)
	}
	retry, err = service.Save(ctx, 7, 8, date, input)
	if err != nil || !retry.SubmittedAt.Equal(*submitted.SubmittedAt) {
		t.Fatalf("重复提交应保留时间：%v", err)
	}
	input.RequestID = "00000000-0000-4000-8000-000000000003"
	input.ExpectedVersion = 2
	if _, err = service.Save(ctx, 7, 8, date, input); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("已提交正文必须锁定：%v", err)
	}
	for _, ids := range [][2]int64{{7, 9}, {8, 8}} {
		other, err := service.Get(ctx, ids[0], ids[1], date)
		if err != nil || other != nil {
			t.Fatalf("不得读到其他用户或租户：%+v %v", other, err)
		}
	}
	checkComments(t, ctx, pool)
	if _, err := pool.Exec(ctx, `INSERT INTO public.tsk_daily_work_reports(business_tenant_id,user_id,work_date,status,last_request_id,last_request_hash) VALUES(1,1,'2026-11-25','approved','00000000-0000-4000-8000-000000000009','x')`); err == nil {
		t.Fatal("数据库应拒绝未声明状态")
	}
}

func testPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_DAILY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("需配置回环地址的隔离日报测试管理库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || cfg.ConnConfig.Database != "postgres" {
		t.Fatal("仅允许回环 postgres 管理库创建一次性测试库")
	}
	admin, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	name := fmt.Sprintf("dsh_daily_test_%d", time.Now().UnixNano())
	if _, err = admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	cfg.ConnConfig.Database = name
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(context.Background(), "DROP DATABASE "+name+" WITH (FORCE)")
		admin.Close()
	})
	migration, err := os.ReadFile("../../../migrations/0009_daily_work_reports.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, string(migration)); err != nil {
		t.Fatal(err)
	}
	return pool
}

func checkComments(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	var table, status string
	var fields, comments int
	err := pool.QueryRow(ctx, `SELECT obj_description('public.tsk_daily_work_reports'::regclass),count(*),count(col_description(attrelid,attnum)) FROM pg_attribute WHERE attrelid='public.tsk_daily_work_reports'::regclass AND attnum>0 AND NOT attisdropped`).Scan(&table, &fields, &comments)
	if err != nil || table != "个人工作日报表" || fields != 17 || fields != comments {
		t.Fatalf("中文备注不完整：%q %d %d %v", table, fields, comments, err)
	}
	err = pool.QueryRow(ctx, `SELECT col_description(attrelid,attnum) FROM pg_attribute WHERE attrelid='public.tsk_daily_work_reports'::regclass AND attname='status'`).Scan(&status)
	if err != nil || !strings.Contains(status, "draft=草稿") || !strings.Contains(status, "submitted=已提交") || !strings.Contains(status, "默认") {
		t.Fatalf("状态备注不完整：%q %v", status, err)
	}
}
