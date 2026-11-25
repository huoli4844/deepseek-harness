// 本文件用独立测试库覆盖迁移与客户仓储，不允许连接生产或共享数据库。
package repository_test

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/customer/application"
	"starpivot.local/deepseek-harness-backend/internal/customer/domain"
	"starpivot.local/deepseek-harness-backend/internal/customer/repository"
)

func TestPostgresCustomerLifecycle(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	p := testPool(t, ctx)
	checkComments(t, ctx, p)
	s := application.New(repository.New(p))
	draft := domain.Draft{Code: "NEW", Name: "新增客户", CreditLimit: json.Number("99999999999999.99")}
	row, err := s.Create(ctx, 7, 99, draft)
	if err != nil || row.CreatedBy != 99 || row.CreatedAt.IsZero() || row.IsDeleted || row.CreditLimit != draft.CreditLimit {
		t.Fatalf("创建及审计校验失败：%+v，%v", row, err)
	}
	if _, err := s.Create(ctx, 7, 99, draft); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("重复编码应返回冲突：%v", err)
	}
	checkPage(t, ctx, s, 1, 2, 1)
	checkPage(t, ctx, s, 3, 2, 0)
	if _, err := s.Get(ctx, 8, row.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("跨租户读取应拒绝：%v", err)
	}
	if _, err := s.Update(ctx, 8, row.ID, draft); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("跨租户更新应拒绝：%v", err)
	}
	if _, err := s.Delete(ctx, 8, row.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("跨租户删除应拒绝：%v", err)
	}
	draft.Name = "改名后的客户"
	updated, err := s.Update(ctx, 7, row.ID, draft)
	if err != nil || updated.Name != draft.Name || updated.CreatedBy != row.CreatedBy || !updated.CreatedAt.Equal(row.CreatedAt) {
		t.Fatalf("更新或审计保留失败：%+v，%v", updated, err)
	}
	deleted, err := s.Delete(ctx, 7, row.ID)
	if err != nil || !deleted.IsDeleted || deleted.DeletedAt == nil {
		t.Fatalf("软删除未标记：%+v，%v", deleted, err)
	}
	if _, err := s.Get(ctx, 7, row.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("软删档案仍可见：%v", err)
	}
	checkPage(t, ctx, s, 1, 1, 1)
	var exists bool
	if err := p.QueryRow(ctx, "SELECT is_deleted FROM public.md_customers WHERE id=$1", row.ID).Scan(&exists); err != nil || !exists {
		t.Fatalf("软删除应保留原记录：%v", err)
	}
}

func testPool(t *testing.T, ctx context.Context) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("未提供隔离的 PostgreSQL 集成测试库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("测试库连接串无法解析")
	}
	if !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || cfg.ConnConfig.Database != "dsh_customer_test" {
		t.Fatal("测试库必须使用回环地址，库名必须为 dsh_customer_test")
	}
	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(p.Close)
	for _, file := range []string{"testdata/customers.sql", "../../../migrations/0001_customer_deletion_flag.sql"} {
		b, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := p.Exec(ctx, string(b)); err != nil {
			t.Fatalf("执行 %s 失败：%v", file, err)
		}
	}
	return p
}

func checkComments(t *testing.T, ctx context.Context, p *pgxpool.Pool) {
	t.Helper()
	for field, fragment := range map[string]string{
		"is_deleted": "false 表示未删除，true 表示已删除", "created_by": "元枢用户 ID",
		"created_at": "创建时间", "updated_at": "更新时间", "deleted_at": "NULL 表示未删除",
	} {
		var comment string
		err := p.QueryRow(ctx, `SELECT col_description(attrelid, attnum) FROM pg_attribute
			WHERE attrelid='public.md_customers'::regclass AND attname=$1`, field).Scan(&comment)
		if err != nil || !strings.Contains(comment, fragment) {
			t.Fatalf("缺少 %s 的中文注释或值说明：%v", field, err)
		}
	}
}

func checkPage(t *testing.T, ctx context.Context, s *application.Service, page int, total int64, size int) {
	t.Helper()
	got, err := s.List(ctx, 7, page, 1, archivequery.Query{})
	if err != nil || got.Total != total || len(got.Items) != size || got.Items == nil {
		t.Fatalf("分页 %d 返回错误：%+v，%v", page, got, err)
	}
}
