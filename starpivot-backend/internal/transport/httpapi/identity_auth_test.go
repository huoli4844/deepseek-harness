// 本文件测试元枢 Bearer 身份解析与本人周报路由的接线。
package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

type weeklyAuthRepository struct {
	tenant, user int64
}

func (f *weeklyAuthRepository) Get(_ context.Context, tenant, user int64, week domain.Week) (domain.View, error) {
	f.tenant, f.user = tenant, user
	return domain.View{Labor: domain.LaborSummary{TotalHours: "0.00", Employees: []domain.EmployeeHours{}}}, nil
}

func (f *weeklyAuthRepository) Save(_ context.Context, tenant, user int64, _ domain.Week, _ domain.Draft) (domain.View, error) {
	f.tenant, f.user = tenant, user
	return domain.View{Labor: domain.LaborSummary{TotalHours: "0.00", Employees: []domain.EmployeeHours{}}}, nil
}

func (f *weeklyAuthRepository) Submit(_ context.Context, tenant, user int64, _ domain.Week) (domain.View, error) {
	f.tenant, f.user = tenant, user
	return domain.View{Labor: domain.LaborSummary{TotalHours: "0.00", Employees: []domain.EmployeeHours{}}}, nil
}

// identityStub 模拟元枢当前用户与当前租户接口，固定返回 12 号用户和 shaoshi 租户。
func identityStub(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer good-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/api/v1/user/me":
			fmt.Fprint(w, `{"data":{"id":12}}`)
		case "/api/v1/user/tenants":
			fmt.Fprint(w, `{"data":{"current":{"id":3,"code":"shaoshi"}}}`)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func TestWeeklyReportsBearerIdentity(t *testing.T) {
	const path = "/api/v1/apps/deepseek-harness/weekly-reports"
	const key = "0123456789abcdef0123456789abcdef"
	const body = `{"period_start":"2026-11-23","progress_summary":"","completed_work":"[]","planned_work":"[]"}`
	identity := identityStub(t)
	defer identity.Close()
	repo := &weeklyAuthRepository{}
	mux := http.NewServeMux()
	personal := WithBearerIdentity(NewLocalCustomerGateway([32]byte([]byte(key))), identity.URL, identity.Client())
	RegisterWeeklyReports(mux, application.New(repo), personal)

	for _, test := range []struct {
		name, method, url, body, tenant, authorization string
		gateway                                        bool
		status                                         int
	}{{
		name: "Bearer 读取本人周报", method: "GET", url: path + "?period_start=2026-11-23",
		tenant: "shaoshi", authorization: "Bearer good-token", status: 200,
	}, {
		name: "Bearer 保存本人周报", method: "PUT", url: path, body: body,
		tenant: "shaoshi", authorization: "Bearer good-token", status: 200,
	}, {
		name: "Bearer 请求头用租户 ID 同样匹配", method: "GET", url: path + "?period_start=2026-11-23",
		tenant: "3", authorization: "Bearer good-token", status: 200,
	}, {
		name: "Bearer 请求头用他人租户 ID 不匹配", method: "GET", url: path, tenant: "4", authorization: "Bearer good-token", status: 401,
	}, {
		name: "缺少凭证", method: "GET", url: path, status: 401,
	}, {
		name: "非 Bearer 凭证", method: "GET", url: path, tenant: "shaoshi", authorization: "Basic abc", status: 401,
	}, {
		name: "元枢拒绝凭证", method: "GET", url: path, tenant: "shaoshi", authorization: "Bearer expired", status: 401,
	}, {
		name: "租户与凭证不符", method: "GET", url: path, tenant: "other", authorization: "Bearer good-token", status: 401,
	}, {
		name: "异常租户编码", method: "GET", url: path, tenant: "shaoshi/../x", authorization: "Bearer good-token", status: 401,
	}, {
		name: "网关身份保持兼容", method: "GET", url: path + "?period_start=2026-11-23",
		tenant: "another-tenant", gateway: true, status: 200,
	}} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(test.method, test.url, strings.NewReader(test.body))
			request.RemoteAddr = "127.0.0.1:50600"
			if test.tenant != "" {
				request.Header.Set("X-Active-Tenant", test.tenant)
			}
			if test.authorization != "" {
				request.Header.Set("Authorization", test.authorization)
			}
			if test.gateway {
				request.Header.Set("X-Starpivot-Gateway-Key", key)
				request.Header.Set("X-Starpivot-User-Id", "9")
				request.Header.Set("X-Starpivot-Tenant-Id", "7")
				request.Header.Set("X-Starpivot-Customer-Access", "write")
			}
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, request)
			if res.Code != test.status {
				t.Fatalf("返回 %d %s，预期 %d", res.Code, res.Body.String(), test.status)
			}
			if test.status != 200 {
				return
			}
			wantTenant, wantUser := int64(3), int64(12)
			if test.gateway {
				wantTenant, wantUser = 7, 9
			}
			if repo.tenant != wantTenant || repo.user != wantUser {
				t.Fatalf("身份解析错误：%+v", repo)
			}
			var payload struct {
				Data struct {
					Report *domain.Report      `json:"report"`
					Labor  domain.LaborSummary `json:"labor"`
				} `json:"data"`
			}
			if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
				t.Fatalf("响应缺少周报数据：%s", res.Body.String())
			}
		})
	}
}

func TestBearerIdentityUnavailable(t *testing.T) {
	identity := identityStub(t)
	identity.Close()
	mux := http.NewServeMux()
	personal := WithBearerIdentity(NewLocalCustomerGateway([32]byte([]byte("0123456789abcdef0123456789abcdef"))), identity.URL, identity.Client())
	RegisterWeeklyReports(mux, application.New(&weeklyAuthRepository{}), personal)
	request := httptest.NewRequest("GET", "/api/v1/apps/deepseek-harness/weekly-reports", nil)
	request.Header.Set("Authorization", "Bearer good-token")
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, request)
	if res.Code != http.StatusUnauthorized {
		t.Fatalf("身份接口不可用时返回 %d", res.Code)
	}
}
