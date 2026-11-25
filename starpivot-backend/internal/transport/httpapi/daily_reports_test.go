// 本文件通过真实 HTTP 路由验证日报本人隔离、方法与输入白名单，不连接生产服务。
package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/application"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
	"strings"
	"testing"
)

type dailyAuth struct {
	access CustomerAccess
	valid  bool
}

func (a dailyAuth) AuthorizeCustomer(*http.Request) (CustomerAccess, bool) { return a.access, a.valid }

type dailyRepo struct {
	tenant, user int64
	input        domain.Input
	failure      error
}

func (p *dailyRepo) Get(_ context.Context, tenant, user int64, _ string) (*domain.Report, error) {
	p.tenant = tenant
	p.user = user
	return nil, p.failure
}
func (p *dailyRepo) Save(_ context.Context, tenant, user int64, date string, input domain.Input) (*domain.Report, error) {
	p.tenant = tenant
	p.user = user
	p.input = input
	return &domain.Report{ID: 1, WorkDate: date, Status: input.Status, Version: 1, Content: input.Content}, p.failure
}

func TestDailyRoutes(t *testing.T) {
	repo := &dailyRepo{}
	mux := http.NewServeMux()
	RegisterDailyReports(mux, application.New(repo), dailyAuth{CustomerAccess{TenantID: 7, UserID: 8, CanWrite: true}, true})
	valid := `{"expected_version":0,"request_id":"00000000-0000-4000-8000-000000000001","status":"submitted","completed_work":"人工确认正文","evidence_refs":[]}`
	for _, test := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", dailyPath + "/schema", "", 200}, {"GET", dailyPath + "/2026-11-25?user_id=9&business_tenant_id=9", "", 200},
		{"PUT", dailyPath + "/2026-11-25", valid, 200}, {"POST", dailyPath + "/2026-11-25", valid, 405},
		{"GET", dailyPath + "/2026-02-30", "", 400}, {"GET", dailyPath + "/a/b", "", 404},
		{"PUT", dailyPath + "/2026-11-25", strings.Replace(valid, `"status":`, `"user_id":9,"status":`, 1), 400},
		{"PUT", dailyPath + "/2026-11-25", valid + `{}`, 400},
	} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest(test.method, test.path, strings.NewReader(test.body)))
		if w.Code != test.status {
			t.Fatalf("%s %s：%d %s", test.method, test.path, w.Code, w.Body.String())
		}
	}
	if repo.tenant != 7 || repo.user != 8 || repo.input.CompletedWork != "人工确认正文" {
		t.Fatalf("必须使用可信本人身份与最终正文：%+v", repo)
	}
	for _, failure := range []struct {
		err    error
		status int
	}{{domain.ErrConflict, 409}, {errors.New("数据库故障"), 503}} {
		repo.failure = failure.err
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("PUT", dailyPath+"/2026-11-25", strings.NewReader(valid)))
		if w.Code != failure.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}

func TestDailyAuthorization(t *testing.T) {
	for _, test := range []struct {
		access CustomerAccess
		valid  bool
		status int
	}{
		{CustomerAccess{}, false, 401}, {CustomerAccess{TenantID: 7}, true, 401},
		{CustomerAccess{TenantID: 7, UserID: 8, CanWrite: false}, true, 403},
	} {
		mux := http.NewServeMux()
		RegisterDailyReports(mux, application.New(&dailyRepo{}), dailyAuth{test.access, test.valid})
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("PUT", dailyPath+"/2026-11-25", strings.NewReader(`{}`)))
		if w.Code != test.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
