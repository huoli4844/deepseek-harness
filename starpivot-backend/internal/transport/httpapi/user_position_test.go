// 本文件验证用户任职接口的路由、身份、过滤条件与增删改查行为。
package httpapi

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	userpositionapplication "starpivot.local/deepseek-harness-backend/internal/userposition/application"
	userpositionrepository "starpivot.local/deepseek-harness-backend/internal/userposition/repository"
)

// userPositionMux 组装任职路由，走临时租户网关身份（用户 8）。
func userPositionMux(service *userpositionapplication.Service) *http.ServeMux {
	mux := http.NewServeMux()
	gateway := NewLocalCustomerGateway([32]byte([]byte(meetingTestKey)))
	RegisterUserPositions(mux, service, WithTemporaryTenantReads(gateway, 3))
	return mux
}

// userPositionRequest 发送带网关身份的请求，校验状态码并返回响应 data 字段。
func userPositionRequest(t *testing.T, mux *http.ServeMux, method, url, scope, body string, status int) json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:34568"
	if scope != "" {
		req.Header.Set("X-Starpivot-Gateway-Key", meetingTestKey)
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

func TestUserPositionRouteGuards(t *testing.T) {
	mux := userPositionMux(userpositionapplication.New(nil))
	userPositionRequest(t, mux, "PATCH", userPositionPath, "", "", 405)
	userPositionRequest(t, mux, "GET", userPositionPath+"/1", "", "", 405)
	userPositionRequest(t, mux, "POST", userPositionPath, "", "", 401)
	userPositionRequest(t, mux, "POST", userPositionPath, "read",
		`{"user_id":1,"position_id":1,"role_in_project":"x"}`, 403)
	// 参数与字段校验：未知过滤值、非法日期、结束早于开始、引用 ID 非正。
	userPositionRequest(t, mux, "GET", userPositionPath+"?mine=2", "", "", 400)
	userPositionRequest(t, mux, "GET", userPositionPath+"?user_id=x", "", "", 400)
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":0,"position_id":1,"role_in_project":"x"}`, 400)
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":1,"position_id":1,"role_in_project":""}`, 400)
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":1,"position_id":1,"role_in_project":"x","start_date":"2026/01/01"}`, 400)
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":1,"position_id":1,"role_in_project":"x","start_date":"2026-02-01","end_date":"2026-01-01"}`, 400)
	userPositionRequest(t, mux, "PUT", userPositionPath+"/0", "write", `{}`, 400)
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":1,"position_id":1,"role_in_project":"x","bogus":1}`, 400)
}

func TestUserPositionPostgresFlow(t *testing.T) {
	pool := userPositionTestPool(t)
	mux := userPositionMux(userpositionapplication.New(userpositionrepository.New(pool)))
	// 列表：租户全部任职、按用户过滤、mine 过滤与岗位名称联查。
	all := userPositionRequest(t, mux, "GET", userPositionPath, "", "", 200)
	assertUserPositionItems(t, all, 2, "质检员")
	mine := userPositionRequest(t, mux, "GET", userPositionPath+"?mine=1", "", "", 200)
	assertUserPositionItems(t, mine, 2, "技术主管")
	byUser := userPositionRequest(t, mux, "GET", userPositionPath+"?user_id=99", "", "", 200)
	assertUserPositionItems(t, byUser, 0, "")
	// 创建：联查字段回填，来源追溯列落默认值。
	created := userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":9,"position_id":2,"role_in_project":" 技术负责人 ","start_date":"2026-05-01",
		  "end_date":"2026-08-31","is_primary":true,"status":2}`, 200)
	var record struct {
		ID            int64  `json:"id"`
		PositionName  string `json:"position_name"`
		Category      string `json:"position_category"`
		RoleInProject string `json:"role_in_project"`
		Status        int16  `json:"status"`
		ReviewStatus  string `json:"review_status"`
	}
	if err := json.Unmarshal(created, &record); err != nil || record.ID == 0 ||
		record.PositionName != "技术主管" || record.Category != "技术部" ||
		record.RoleInProject != "技术负责人" || record.Status != 2 || record.ReviewStatus != "unreviewed" {
		t.Fatalf("创建任职返回错误：%s (%v)", created, err)
	}
	// 引用不存在的岗位触发外键冲突。
	userPositionRequest(t, mux, "POST", userPositionPath, "write",
		`{"user_id":9,"position_id":99,"role_in_project":"x"}`, 409)
	// 更新与删除。
	updated := userPositionRequest(t, mux, "PUT", fmt.Sprintf("%s/%d", userPositionPath, record.ID), "write",
		`{"user_id":9,"position_id":1,"role_in_project":"质量负责人","status":1}`, 200)
	assertUserPositionItems(t, json.RawMessage("["+string(updated)+"]"), 1, "质检员")
	userPositionRequest(t, mux, "PUT", fmt.Sprintf("%s/%d", userPositionPath, record.ID), "write",
		`{"user_id":9,"position_id":1,"role_in_project":"质量负责人"}`, 200)
	deleted := userPositionRequest(t, mux, "DELETE", fmt.Sprintf("%s/%d", userPositionPath, record.ID), "write", "", 200)
	assertUserPositionItems(t, json.RawMessage("["+string(deleted)+"]"), 1, "质检员")
	userPositionRequest(t, mux, "DELETE", fmt.Sprintf("%s/%d", userPositionPath, record.ID), "write", "", 404)
	assertUserPositionItems(t, all, 2, "质检员")
}

// assertUserPositionItems 校验任职列表条数与首个岗位名称。
func assertUserPositionItems(t *testing.T, data json.RawMessage, count int, firstName string) {
	t.Helper()
	var page struct {
		Items []struct {
			PositionName string `json:"position_name"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &page); err != nil || len(page.Items) != count {
		t.Fatalf("任职列表条数应为 %d：%s (%v)", count, data, err)
	}
	if count > 0 && page.Items[0].PositionName != firstName {
		t.Fatalf("首个岗位应为 %s：%s", firstName, data)
	}
}

func userPositionTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_USER_POSITION_TEST_ADMIN_URL")
	if dsn == "" {
		t.Skip("未配置本机隔离测试数据库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || len(cfg.ConnConfig.Fallbacks) != 0 || cfg.ConnConfig.Database != "postgres" {
		t.Fatal("测试连接必须为禁用 TLS 的单一回环地址，管理库必须为 postgres")
	}
	pool, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	sql, err := os.ReadFile("testdata/user_position.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), string(sql)); err != nil {
		t.Fatalf("执行 testdata/user_position.sql 失败：%v", err)
	}
	return pool
}
