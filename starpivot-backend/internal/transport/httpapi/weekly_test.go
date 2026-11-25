// 本文件测试周报路由、同租户请求参数和可信身份约束。
package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

type weeklyTestRepository struct {
	tenant, actor int64
	week          domain.Week
}

func (f *weeklyTestRepository) Get(_ context.Context, tenant int64, code string, week domain.Week) (domain.View, error) {
	f.tenant, f.week = tenant, week
	if code != "ABC" {
		return domain.View{}, domain.ErrNotFound
	}
	return domain.View{Labor: domain.LaborSummary{TotalHours: "0.00", Employees: []domain.EmployeeHours{}}}, nil
}

func (f *weeklyTestRepository) Save(_ context.Context, tenant, actor int64, code string, week domain.Week, draft domain.Draft) (domain.View, error) {
	f.tenant, f.actor, f.week = tenant, actor, week
	if code == "LOCKED" {
		return domain.View{}, domain.ErrLocked
	}
	return domain.View{Report: &domain.Report{CreatedBy: actor, Draft: draft, Status: "draft"}}, nil
}

func (f *weeklyTestRepository) Submit(_ context.Context, tenant, actor int64, code string, week domain.Week) (domain.View, error) {
	f.tenant, f.actor, f.week = tenant, actor, week
	if code == "MISSING" {
		return domain.View{}, domain.ErrNotFound
	}
	return domain.View{Report: &domain.Report{SubmittedBy: &actor, Status: "submitted"}}, nil
}

func TestWeeklyRoutesAndAuthorization(t *testing.T) {
	const key = "0123456789abcdef0123456789abcdef"
	const path = "/api/v1/apps/deepseek-harness/projects/ABC/weekly-reports"
	const input = `{"period_start":"2026-11-23","progress_summary":"","completed_work":"","planned_work":""}`
	repo := &weeklyTestRepository{}
	mux := http.NewServeMux()
	RegisterWeeklyReports(mux, application.New(repo), NewLocalCustomerGateway([32]byte([]byte(key))))
	for _, test := range []struct {
		name, method, url, body, scope, bodyPart string
		status                                   int
	}{
		{"读取", "GET", path + "?period_start=2026-11-23", "", "read", `"report":null`, 200},
		{"默认自然周", "GET", path, "", "read", `"total_hours":"0.00"`, 200},
		{"保存草稿", "PUT", path, input, "write", `"created_by":9`, 200},
		{"提交", "POST", path + "/submit", `{"period_start":"2026-11-23"}`, "write", `"submitted_by":9`, 200},
		{"不接受星期二", "GET", path + "?period_start=2026-11-24", "", "read", "", 400},
		{"不接受重复周", "GET", path + "?period_start=2026-11-23&period_start=2026-11-30", "", "read", "", 400},
		{"不接受空值正文", "PUT", path, `{"period_start":"2026-11-23","progress_summary":null}`, "write", "", 400},
		{"拒绝客户端传入租户", "PUT", path, strings.TrimSuffix(input, "}") + `,"business_tenant_id":3}`, "write", "", 400},
		{"缺少身份", "GET", path, "", "", "", 401},
		{"只读身份", "PUT", path, input, "read", "", 403},
		{"不可见项目", "GET", strings.Replace(path, "ABC", "MISSING", 1), "", "read", "", 404},
		{"提交缺少草稿", "POST", strings.Replace(path, "ABC", "MISSING", 1) + "/submit", `{"period_start":"2026-11-23"}`, "write", "", 404},
		{"已提交禁止编辑", "PUT", strings.Replace(path, "ABC", "LOCKED", 1), input, "write", "", 409},
		{"错误方法", "DELETE", path, "", "write", "", 405},
		{"未知路径", "GET", path + "/unknown", "", "read", "", 404},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(test.method, test.url, strings.NewReader(test.body))
			req.RemoteAddr = "127.0.0.1:50600"
			req.Header.Set("X-Active-Tenant", "another-tenant")
			if test.scope != "" {
				req.Header.Set("X-Starpivot-Gateway-Key", key)
				req.Header.Set("X-Starpivot-User-Id", "9")
				req.Header.Set("X-Starpivot-Tenant-Id", "7")
				req.Header.Set("X-Starpivot-Customer-Access", test.scope)
			}
			res := httptest.NewRecorder()
			mux.ServeHTTP(res, req)
			if res.Code != test.status || !strings.Contains(res.Body.String(), test.bodyPart) {
				t.Fatalf("返回 %d %s，预期 %d %q", res.Code, res.Body.String(), test.status, test.bodyPart)
			}
			if test.status == http.StatusOK && (repo.tenant != 7 || repo.week.Start.IsZero() || (test.scope == "write" && repo.actor != 9)) {
				t.Fatalf("请求未传入可信范围：%+v", repo)
			}
		})
	}
}
