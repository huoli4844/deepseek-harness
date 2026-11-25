// 本包从公开 HTTP 行为验证服务路由与 OpenAPI，不连接数据库或外部服务。
package backend_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/transport/httpapi"
)

const healthPath = "/api/v1/apps/deepseek-harness/health"

func TestHealthContract(t *testing.T) {
	raw, err := os.ReadFile("api/openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]struct {
			Get struct {
				OperationID string            `json:"operationId"`
				Tags        []string          `json:"tags"`
				Security    []json.RawMessage `json:"security"`
				Responses   map[string]struct {
					Content map[string]json.RawMessage `json:"content"`
				} `json:"responses"`
			} `json:"get"`
		} `json:"paths"`
	}
	if err := json.Unmarshal(raw, &spec); err != nil {
		t.Fatal(err)
	}
	operation := spec.Paths[healthPath].Get
	if operation.OperationID != "getApiV1AppsDeepseekHarnessHealth" || strings.Join(operation.Tags, ",") != "apps/deepseek-harness" {
		t.Fatalf("OpenAPI 没有按元枢规范命名健康接口：%+v", operation)
	}
	if operation.Security == nil || len(operation.Security) != 0 || operation.Responses["200"].Content["application/json"] == nil {
		t.Fatal("OpenAPI 应声明免鉴权和成功 JSON 响应")
	}
}

func TestHealthRouting(t *testing.T) {
	mux := http.NewServeMux()
	httpapi.RegisterHealth(mux)

	t.Run("进程存活时返回不缓存的 JSON", func(t *testing.T) {
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, healthPath, nil))
		if res.Code != http.StatusOK || res.Header().Get("Content-Type") != "application/json; charset=utf-8" || res.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("健康响应状态或响应头不符：%d %v", res.Code, res.Header())
		}
		var payload struct {
			Code    *int   `json:"code"`
			Message string `json:"message"`
			Data    struct {
				Status string `json:"status"`
			} `json:"data"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		if payload.Code == nil || *payload.Code != 0 || payload.Message == "" || payload.Data.Status != "ok" {
			t.Fatalf("健康响应字段不符：%s", res.Body.String())
		}
	})

	t.Run("拒绝不支持的方法", func(t *testing.T) {
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodPost, healthPath, nil))
		if res.Code != http.StatusMethodNotAllowed {
			t.Fatalf("不支持的方法应返回 405，实际 %d", res.Code)
		}
	})

	t.Run("未知路径不与元枢全局健康路由冲突", func(t *testing.T) {
		res := httptest.NewRecorder()
		mux.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))
		if res.Code != http.StatusNotFound {
			t.Fatalf("未知路径应返回 404，实际 %d", res.Code)
		}
	})
}
