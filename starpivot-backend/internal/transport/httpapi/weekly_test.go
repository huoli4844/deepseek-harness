// 本文件验证周报接口的路由与请求体校验；身份接线由 identity_auth_test.go 覆盖。
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	weeklyapplication "starpivot.local/deepseek-harness-backend/internal/weekly/application"
	weeklydomain "starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

// stubWeeklyRepo 返回空视图并记录最近一次保存的输入。
type stubWeeklyRepo struct {
	lastSave   weeklydomain.DraftInput
	lastPeriod string
}

func (r *stubWeeklyRepo) Get(context.Context, int64, int64, weeklydomain.Week) (weeklydomain.View, error) {
	return weeklydomain.View{Labor: weeklydomain.LaborSummary{TotalHours: "0.00", Employees: []weeklydomain.EmployeeHours{}}}, nil
}

func (r *stubWeeklyRepo) Save(_ context.Context, _, _ int64, week weeklydomain.Week, draft weeklydomain.Draft) (weeklydomain.View, error) {
	r.lastPeriod = week.Start.Format("2006-01-02")
	r.lastSave = weeklydomain.DraftInput{PeriodStart: r.lastPeriod, Draft: draft}
	return weeklydomain.View{Labor: weeklydomain.LaborSummary{TotalHours: "0.00", Employees: []weeklydomain.EmployeeHours{}}}, nil
}

func (r *stubWeeklyRepo) Submit(_ context.Context, _, _ int64, week weeklydomain.Week) (weeklydomain.View, error) {
	r.lastPeriod = week.Start.Format("2006-01-02")
	return weeklydomain.View{Labor: weeklydomain.LaborSummary{TotalHours: "0.00", Employees: []weeklydomain.EmployeeHours{}}}, nil
}

// weeklyMux 组装周报路由，走临时租户网关身份（用户 8）。
func weeklyMux(repo *stubWeeklyRepo) *http.ServeMux {
	mux := http.NewServeMux()
	gateway := NewLocalCustomerGateway([32]byte([]byte(meetingTestKey)))
	RegisterWeeklyReports(mux, weeklyapplication.New(repo), WithTemporaryTenantReads(gateway, 3))
	return mux
}

// weeklyRequest 发送带网关身份的请求并校验状态码。
func weeklyRequest(t *testing.T, mux *http.ServeMux, method, url, body string, status int) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:34570"
	req.Header.Set("X-Starpivot-Gateway-Key", meetingTestKey)
	req.Header.Set("X-Starpivot-Tenant-Id", "3")
	req.Header.Set("X-Starpivot-User-Id", "8")
	req.Header.Set("X-Starpivot-Customer-Access", "write")
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	if res.Code != status {
		t.Fatalf("%s %s 应返回 %d，实际为 %d %s", method, url, status, res.Code, res.Body.String())
	}
	return res
}

func TestWeeklyReportRouteGuards(t *testing.T) {
	mux := weeklyMux(&stubWeeklyRepo{})
	weeklyRequest(t, mux, "PATCH", weeklyPath, "", 405)
	weeklyRequest(t, mux, "GET", weeklyPath+"/1", "", 404)
	weeklyRequest(t, mux, "GET", weeklyPath, "", 400) // 缺少周一日期
	weeklyRequest(t, mux, "GET", weeklyPath+"?period_start=2026-11-24", "", 400)
	weeklyRequest(t, mux, "PUT", weeklyPath, `{}`, 400)
	weeklyRequest(t, mux, "PUT", weeklyPath, `{"period_start":"2026-11-23","bogus":1}`, 400)
	weeklyRequest(t, mux, "PUT", weeklyPath, `{"period_start":"2026-11-23","progress_summary":"ok"}`, 200) // 草稿允许空正文
	weeklyRequest(t, mux, "PUT", weeklyPath, `{"period_start":"2026-11-23","progress_summary":"ok",
		"completed_work":"[]","planned_work":"[]"}`, 200)
	weeklyRequest(t, mux, "POST", weeklyPath+"/submit",
		`{"period_start":"2026-11-23","progress_summary":"ok","completed_work":"[]","planned_work":"[]"}`, 200)
	weeklyRequest(t, mux, "POST", weeklyPath, "", 405)
	weeklyRequest(t, mux, "POST", weeklyPath+"/cancel", "", 404)
}

func TestWeeklyReportEnvelope(t *testing.T) {
	repo := &stubWeeklyRepo{}
	mux := weeklyMux(repo)
	res := weeklyRequest(t, mux, "GET", weeklyPath+"?period_start=2026-11-23", "", 200)
	var envelope struct {
		Code int               `json:"code"`
		Data weeklydomain.View `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &envelope); err != nil || envelope.Code != 0 ||
		envelope.Data.Labor.TotalHours == "" || envelope.Data.Labor.Employees == nil {
		t.Fatalf("周报视图格式错误：%s (%v)", res.Body.String(), err)
	}
	body := `{"period_start":"2026-11-23","progress_summary":" ok ","completed_work":"[]","planned_work":"[]"}`
	weeklyRequest(t, mux, "PUT", weeklyPath, body, 200)
	if repo.lastPeriod != "2026-11-23" || repo.lastSave.ProgressSummary != " ok " ||
		repo.lastSave.CompletedWork != "[]" {
		t.Fatalf("保存输入记录错误：%+v", repo.lastSave)
	}
}
