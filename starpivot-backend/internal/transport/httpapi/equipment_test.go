// 本文件验证设备台账的路由、身份、租户隔离和分页写入行为。
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
	"starpivot.local/deepseek-harness-backend/internal/equipment/application"
	"starpivot.local/deepseek-harness-backend/internal/equipment/domain"
	"starpivot.local/deepseek-harness-backend/internal/equipment/repository"
)

const equipmentTestKey = "01234567890123456789012345678901"

func equipmentMux(service *application.Service) *http.ServeMux {
	mux := http.NewServeMux()
	gateway := NewLocalCustomerGateway([32]byte([]byte(equipmentTestKey)))
	RegisterEquipment(mux, service, WithTemporaryTenantReads(gateway, 3))
	return mux
}

func equipmentRequest(t *testing.T, mux *http.ServeMux, method, url, scope, body string, status int) json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:34567"
	if scope != "" {
		req.Header.Set("X-Starpivot-Gateway-Key", equipmentTestKey)
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

func TestEquipmentRouteGuards(t *testing.T) {
	mux := equipmentMux(application.New(nil))
	equipmentRequest(t, mux, "PATCH", equipmentPath+"/1", "", "", 405)
	equipmentRequest(t, mux, "GET", equipmentPath+"/1/unknown", "", "", 404)
	equipmentRequest(t, mux, "POST", equipmentPath, "", "", 401)
	equipmentRequest(t, mux, "PUT", equipmentPath+"/1", "read", "", 403)
	equipmentRequest(t, mux, "GET", equipmentPath+"?sort_by=unsupported&sort_direction=asc", "", "", 400)
	equipmentRequest(t, mux, "POST", equipmentPath, "write", `{"code":"X","name":"设备","business_tenant_id":4}`, 400)
	equipmentRequest(t, mux, "POST", equipmentPath, "write", `{"code":"X","name":"设备","runtime_status":"inactive"}`, 400)
}

func TestEquipmentPostgresCRUD(t *testing.T) {
	pool := equipmentTestPool(t)
	mux := equipmentMux(application.New(repository.New(pool)))
	equipmentRequest(t, mux, "GET", equipmentPath+"/1", "", "", 200)
	equipmentRequest(t, mux, "GET", equipmentPath+"/2", "", "", 404)
	equipmentRequest(t, mux, "PUT", equipmentPath+"/2", "write", `{"code":"E-X","name":"跨租户"}`, 404)
	equipmentRequest(t, mux, "DELETE", equipmentPath+"/2", "write", "", 404)
	added := equipmentRequest(t, mux, "POST", equipmentPath, "write",
		`{"code":"E-B","name":"手工设备","purchase_date":"2024-02-29","serial_no":"SER-2"}`, 200)
	var item struct {
		ID           int64  `json:"id"`
		PurchaseDate string `json:"purchase_date"`
	}
	if err := json.Unmarshal(added, &item); err != nil || item.ID <= 2 || item.PurchaseDate != "2024-02-29" {
		t.Fatalf("人工录入设备返回错误：%s (%v)", added, err)
	}
	equipmentRequest(t, mux, "POST", equipmentPath, "write", `{"code":"E-B","name":"重复编码"}`, 409)
	equipmentRequest(t, mux, "PUT", fmt.Sprintf("%s/%d", equipmentPath, item.ID), "write",
		`{"code":"E-B","name":"更新设备","lifecycle_status":"sealed"}`, 200)
	assertEquipmentPage(t, mux, "?page_size=1&sort_by=code&sort_direction=asc", 2, 2, "E-A")
	assertEquipmentPage(t, mux, "?keyword=更新&page_size=1", 1, 2, "E-B")
	assertEquipmentPage(t, mux, "?keyword=更新&page=2&page_size=1", 1, 2, "")
	equipmentRequest(t, mux, "DELETE", equipmentPath+"/1", "write", "", 200)
	equipmentRequest(t, mux, "GET", equipmentPath+"/1", "", "", 404)
	equipmentRequest(t, mux, "DELETE", equipmentPath+"/1", "write", "", 404)
	assertEquipmentPage(t, mux, "", 1, 1, "E-B")
	var kept bool
	err := pool.QueryRow(t.Context(), `SELECT EXISTS (
		SELECT 1 FROM public.eqp_equipment_attachments a JOIN public.eqp_equipments e ON e.id=a.equipment_id
		WHERE e.id = 1 AND e.deleted_at IS NOT NULL AND e.source_object_key='imports/equipment'
	)`).Scan(&kept)
	if err != nil || !kept {
		t.Fatalf("软删除应保留历史关联和来源文件：%v", err)
	}
}

func assertEquipmentPage(t *testing.T, mux *http.ServeMux, query string, total, archiveTotal int64, code string) {
	t.Helper()
	data := equipmentRequest(t, mux, "GET", equipmentPath+query, "", "", 200)
	var page domain.Page
	if err := json.Unmarshal(data, &page); err != nil || page.Items == nil ||
		page.Total != total || page.ArchiveTotal != archiveTotal {
		t.Fatalf("设备分页总数错误：%s (%v)", data, err)
	}
	if code == "" && len(page.Items) == 0 {
		return
	}
	var first struct{ Code string }
	if len(page.Items) != 1 || json.Unmarshal(page.Items[0], &first) != nil || first.Code != code {
		t.Fatalf("设备分页记录错误：%s", data)
	}
}

func equipmentTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_EQUIPMENT_TEST_ADMIN_URL")
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
	database := pgx.Identifier{fmt.Sprintf("dsh_equipment_test_%d_%d", os.Getpid(), time.Now().UnixNano())}.Sanitize()
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
	for _, path := range []string{"testdata/equipment.sql", "../../../migrations/0005_equipment_ledger.sql"} {
		sql, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(t.Context(), string(sql)); err != nil {
			t.Fatalf("执行 %s 失败：%v", path, err)
		}
	}
	var comments int
	err = pool.QueryRow(t.Context(), `SELECT count(*) FROM pg_attribute WHERE attrelid='public.eqp_equipments'::regclass
		AND ((attname='deleted_at' AND col_description(attrelid,attnum) LIKE '%NULL 表示未删除%')
		  OR (attname='source_object_key' AND col_description(attrelid,attnum) LIKE '%NULL 表示人工录入%'))`).Scan(&comments)
	if err != nil || comments != 2 {
		t.Fatalf("迁移缺少中文字段备注：%v", err)
	}
	return pool
}
