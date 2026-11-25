// 本文件验证合同列表的路由、身份、租户隔离、搜索排序与分页行为。
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/contract/application"
	"starpivot.local/deepseek-harness-backend/internal/contract/domain"
	"starpivot.local/deepseek-harness-backend/internal/contract/repository"
)

const contractTestKey = "abcdefghijklmnopqrstuvwxyz012345"

func contractMux(service *application.Service) *http.ServeMux {
	mux := http.NewServeMux()
	gateway := NewLocalCustomerGateway([32]byte([]byte(contractTestKey)))
	RegisterContracts(mux, service, WithTemporaryTenantReads(gateway, 3))
	return mux
}

func contractRequest(t *testing.T, mux *http.ServeMux, method, url, scope, body string, status int) json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:34567"
	if scope != "" {
		req.Header.Set("X-Starpivot-Gateway-Key", contractTestKey)
		req.Header.Set("X-Starpivot-Tenant-Id", "3")
		req.Header.Set("X-Starpivot-User-Id", "8")
		req.Header.Set("X-Starpivot-Customer-Access", scope)
	}
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	if res.Code != status {
		t.Fatalf("%s %s 应返回 %d，实际为 %d %s", method, url, status, res.Code, res.Body.String())
	}
	if status != 200 {
		return nil
	}
	var envelope struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &envelope); err != nil || envelope.Code != 0 {
		t.Fatalf("成功响应格式错误：%s (%v)", res.Body.String(), err)
	}
	return envelope.Data
}

func TestContractRouteGuards(t *testing.T) {
	mux := contractMux(application.New(nil))
	contractRequest(t, mux, "PATCH", contractPath, "", "", 405)
	contractRequest(t, mux, "POST", contractPath, "", "", 405)
	contractRequest(t, mux, "GET", contractPath+"/1", "", "", 404)
	contractRequest(t, mux, "GET", contractPath+"/1/unknown", "", "", 404)
	contractRequest(t, mux, "GET", contractPath+"?sort_by=unsupported&sort_direction=asc", "", "", 400)
	contractRequest(t, mux, "GET", contractPath+"?page_size=0", "", "", 400)
	contractRequest(t, mux, "GET", contractPath+"?keyword=a&keyword=b", "", "", 400)
	plain := http.NewServeMux()
	RegisterContracts(plain, application.New(nil), NewLocalCustomerGateway([32]byte([]byte(contractTestKey))))
	contractRequest(t, plain, "GET", contractPath, "", "", 401)
}

func TestContractPostgresList(t *testing.T) {
	pool := contractTestPool(t)
	mux := contractMux(application.New(repository.New(pool)))
	assertContractPage(t, mux, "?page_size=20", 3, 3, "C-A")
	assertContractPage(t, mux, "?keyword=P-10", 1, 3, "C-A")
	assertContractPage(t, mux, "?keyword=丙公司", 1, 3, "C-C")
	assertContractPage(t, mux, "?keyword=T4-ONLY", 0, 3, "")
	assertContractPage(t, mux, "?sort_by=code&sort_direction=asc&page_size=2", 3, 3, "C-A")
	assertContractPage(t, mux, "?sort_by=code&sort_direction=asc&page=2&page_size=2", 3, 3, "C-C")
	item := firstContractItem(t, mux, "?keyword=C-A")
	if item.ProjectCode == nil || *item.ProjectCode != "P-10" || item.ProjectName == nil || *item.ProjectName != "项目甲" {
		t.Fatalf("合同应关联项目编号和名称：%+v", item)
	}
	deletedProject := firstContractItem(t, mux, "?keyword=C-B")
	if deletedProject.ProjectName != nil {
		t.Fatalf("已删除项目不应展示名称：%+v", deletedProject)
	}
}

type contractItem struct {
	Code        string  `json:"code"`
	ProjectCode *string `json:"project_code"`
	ProjectName *string `json:"project_name"`
}

func firstContractItem(t *testing.T, mux *http.ServeMux, query string) contractItem {
	t.Helper()
	data := contractRequest(t, mux, "GET", contractPath+query, "", "", 200)
	var page struct {
		Items []contractItem `json:"items"`
	}
	if err := json.Unmarshal(data, &page); err != nil || len(page.Items) != 1 {
		t.Fatalf("合同记录解析失败：%s (%v)", data, err)
	}
	return page.Items[0]
}

func assertContractPage(t *testing.T, mux *http.ServeMux, query string, total, archiveTotal int64, code string) {
	t.Helper()
	data := contractRequest(t, mux, "GET", contractPath+query, "", "", 200)
	var page domain.Page
	if err := json.Unmarshal(data, &page); err != nil || page.Items == nil ||
		page.Total != total || page.ArchiveTotal != archiveTotal {
		t.Fatalf("合同分页总数错误：%s (%v)", data, err)
	}
	if code == "" {
		if len(page.Items) != 0 {
			t.Fatalf("不应返回合同记录：%s", data)
		}
		return
	}
	var first struct{ Code string }
	if len(page.Items) == 0 || json.Unmarshal(page.Items[0], &first) != nil || first.Code != code {
		t.Fatalf("合同分页记录错误：%s", data)
	}
}

func contractTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_CONTRACT_TEST_ADMIN_URL")
	if dsn == "" {
		t.Skip("未配置本机隔离测试数据库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || len(cfg.ConnConfig.Fallbacks) != 0 || cfg.ConnConfig.Database != "postgres" {
		t.Fatal("测试连接必须为禁用 TLS 的单一回环地址，管理库必须为 postgres")
	}
	admin, err := pgx.ConnectConfig(t.Context(), cfg.ConnConfig.Copy())
	if err != nil {
		t.Fatal("连接本机测试管理库失败")
	}
	database := pgx.Identifier{fmt.Sprintf("dsh_contract_test_%d_%d", os.Getpid(), time.Now().UnixNano())}.Sanitize()
	t.Cleanup(func() { _ = admin.Close(context.Background()) })
	if _, err := admin.Exec(t.Context(), "CREATE DATABASE "+database+" TEMPLATE template0"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(context.Background(), "DROP DATABASE "+database); err != nil {
			t.Error(err)
		}
	})
	cfg.ConnConfig.Database = strings.Trim(database, `"`)
	pool, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	sql, err := os.ReadFile("testdata/contract.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), string(sql)); err != nil {
		t.Fatalf("执行合同测试数据失败：%v", err)
	}
	return pool
}
