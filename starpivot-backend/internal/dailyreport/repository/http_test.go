// 本文件通过真实 HTTP 连接和一次性 PostgreSQL 数据库验证完整日报链路。
package repository_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/application"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/repository"
	"starpivot.local/deepseek-harness-backend/internal/transport/httpapi"
	"strings"
	"testing"
	"time"
)

type testIdentity struct{}

func (testIdentity) AuthorizeCustomer(r *http.Request) (httpapi.CustomerAccess, bool) {
	if r.Header.Get("Authorization") == "Bearer isolated-user-a" {
		return httpapi.CustomerAccess{TenantID: 7, UserID: 8, CanWrite: true}, true
	}
	if r.Header.Get("Authorization") == "Bearer isolated-user-b" {
		return httpapi.CustomerAccess{TenantID: 7, UserID: 9, CanWrite: true}, true
	}
	return httpapi.CustomerAccess{}, false
}

func TestDailyRealHTTP(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool := testPool(t, ctx)
	mux := http.NewServeMux()
	httpapi.RegisterDailyReports(mux, application.New(repository.New(pool)), testIdentity{})
	server := httptest.NewServer(mux)
	defer server.Close()
	path := server.URL + "/api/v1/apps/deepseek-harness/daily-reports/2026-11-25"
	body := `{"expected_version":0,"request_id":"00000000-0000-4000-8000-000000000001","status":"submitted","completed_work":"用户在确认弹窗编辑后的正文","evidence_refs":[]}`
	call := func(method, token, body string) *domain.Report {
		t.Helper()
		req, err := http.NewRequestWithContext(ctx, method, path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Authorization", token)
		req.Header.Set("Content-Type", "application/json")
		res, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatalf("真实 HTTP %s：%d", method, res.StatusCode)
		}
		var output struct {
			Data struct {
				Report *domain.Report `json:"report"`
			} `json:"data"`
		}
		if err = json.NewDecoder(res.Body).Decode(&output); err != nil {
			t.Fatal(err)
		}
		return output.Data.Report
	}
	saved := call("PUT", "Bearer isolated-user-a", body)
	if saved == nil || saved.Status != "submitted" || saved.SubmittedAt == nil || saved.CompletedWork != "用户在确认弹窗编辑后的正文" {
		t.Fatalf("保存回读不一致：%+v", saved)
	}
	retried := call("PUT", "Bearer isolated-user-a", body)
	if retried.ID != saved.ID || !retried.SubmittedAt.Equal(*saved.SubmittedAt) {
		t.Fatal("真实接口重复请求产生重复保存")
	}
	if read := call("GET", "Bearer isolated-user-a", ""); read == nil || read.ID != saved.ID {
		t.Fatal("真实接口读取失败")
	}
	if read := call("GET", "Bearer isolated-user-b", ""); read != nil {
		t.Fatal("真实接口泄露他人日报")
	}
	t.Log("真实 HTTP PUT/GET、人工最终正文、幂等重试及跨用户隔离均已验证")
}
