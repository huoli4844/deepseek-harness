// 本文件验证组织架构接口的透传、部门范围过滤与鉴权行为。
package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/organization/application"
	organizationrepository "starpivot.local/deepseek-harness-backend/internal/organization/repository"
)

// organizationUpstream 模拟元枢部门树与用户接口，用户接口不支持部门过滤。
func organizationUpstream(t *testing.T, unauthorized bool) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/departments/tree", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		writeEnvelope(t, w, []map[string]any{
			{"id": 1, "name": "总部", "parent_id": 0, "children": []map[string]any{
				{"id": 2, "name": "项目中心", "parent_id": 1, "children": []map[string]any{
					{"id": 3, "name": "交付组", "parent_id": 2},
				}},
			}},
			{"id": 4, "name": "销售中心", "parent_id": 0},
		})
	})
	mux.HandleFunc("/api/v1/users", func(w http.ResponseWriter, r *http.Request) {
		users := []map[string]any{
			{"id": 11, "nickname": "张一", "department_id": 1},
			{"id": 12, "nickname": "张二", "department_id": 2},
			{"id": 13, "nickname": "李三", "department_id": 3},
			{"id": 14, "nickname": "李四", "department_id": 4},
		}
		writeEnvelope(t, w, map[string]any{"list": users, "page": 1, "page_size": 200, "total": len(users)})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func writeEnvelope(t *testing.T, w http.ResponseWriter, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]any{"code": 200, "message": "success", "data": data}); err != nil {
		t.Fatalf("写入上游响应失败：%v", err)
	}
}

func newOrganizationMux(t *testing.T, upstream string) *http.ServeMux {
	t.Helper()
	repo, err := organizationrepository.New(upstream, nil)
	if err != nil {
		t.Fatalf("构造组织架构仓储失败：%v", err)
	}
	mux := http.NewServeMux()
	RegisterOrganization(mux, application.New(repo))
	return mux
}

func organizationRequest(mux *http.ServeMux, method, target, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, nil)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("X-Active-Tenant", "shaoshi")
	}
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	return recorder
}

func decodeOrganization(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("解析响应失败：%v", err)
	}
	return body
}

func TestOrganizationTree(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/departments/tree", "token")
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d", recorder.Code)
	}
	body := decodeOrganization(t, recorder)
	data, ok := body["data"].([]any)
	if !ok || len(data) != 2 {
		t.Fatalf("期望两个根部门，实际 %v", body["data"])
	}
	headquarters, _ := data[0].(map[string]any)
	if total, _ := headquarters["total_members"].(float64); int(total) != 3 {
		t.Fatalf("总部应含子树共 3 人，实际 %v", headquarters["total_members"])
	}
	children, _ := headquarters["children"].([]any)
	if len(children) != 1 {
		t.Fatalf("总部期望一个子部门，实际 %v", headquarters["children"])
	}
	center, _ := children[0].(map[string]any)
	if total, _ := center["total_members"].(float64); int(total) != 2 {
		t.Fatalf("项目中心应含子树共 2 人，实际 %v", center["total_members"])
	}
	groups, _ := center["children"].([]any)
	if len(groups) != 1 {
		t.Fatalf("项目中心期望一个子部门，实际 %v", center["children"])
	}
	leaf, _ := groups[0].(map[string]any)
	if total, _ := leaf["total_members"].(float64); int(total) != 1 {
		t.Fatalf("交付组应有 1 人，实际 %v", leaf["total_members"])
	}
	sales, _ := data[1].(map[string]any)
	if total, _ := sales["total_members"].(float64); int(total) != 1 {
		t.Fatalf("销售中心应有 1 人，实际 %v", sales["total_members"])
	}
}

func TestOrganizationUsersByDepartment(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users?department_id=1&page=1&page_size=2", "token")
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d", recorder.Code)
	}
	data, ok := decodeOrganization(t, recorder)["data"].(map[string]any)
	if !ok {
		t.Fatal("缺少 data 对象")
	}
	if total, _ := data["total"].(float64); int(total) != 3 {
		t.Fatalf("期望子树共 3 人，实际 %v", data["total"])
	}
	list, _ := data["list"].([]any)
	if len(list) != 2 {
		t.Fatalf("期望第一页 2 人，实际 %d", len(list))
	}
	second := organizationRequest(mux, http.MethodGet, "/api/v1/users?department_id=1&page=2&page_size=2", "token")
	page, _ := decodeOrganization(t, second)["data"].(map[string]any)
	if list, _ := page["list"].([]any); len(list) != 1 {
		t.Fatalf("期望第二页 1 人，实际 %d", len(list))
	}
}

func TestOrganizationUsersOutsideDepartment(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users?department_id=99", "token")
	data, _ := decodeOrganization(t, recorder)["data"].(map[string]any)
	if total, _ := data["total"].(float64); int(total) != 0 {
		t.Fatalf("未知部门应返回空列表，实际 total=%v", data["total"])
	}
}

func TestOrganizationRequiresBearer(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	for _, target := range []string{"/api/v1/departments/tree", "/api/v1/users"} {
		recorder := organizationRequest(mux, http.MethodGet, target, "")
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("%s 缺少凭证时期望 401，实际 %d", target, recorder.Code)
		}
	}
}

func TestOrganizationUpstreamUnauthorized(t *testing.T) {
	upstream := organizationUpstream(t, true)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/departments/tree", "token")
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("上游拒绝时期望 401，实际 %d", recorder.Code)
	}
}

func TestOrganizationRejectsInvalidQuery(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	for _, target := range []string{
		"/api/v1/users?department_id=abc",
		"/api/v1/users?page=0",
		"/api/v1/users?page_size=" + strconv.Itoa(organizationMaxSize+1),
		"/api/v1/users?keyword=a&keyword=b",
	} {
		recorder := organizationRequest(mux, http.MethodGet, target, "token")
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("%s 期望 400，实际 %d", target, recorder.Code)
		}
	}
}

func TestOrganizationRejectsMethodAndUnknownPath(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	if recorder := organizationRequest(mux, http.MethodPost, "/api/v1/users", "token"); recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST 期望 405，实际 %d", recorder.Code)
	}
	if recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users/1", "token"); recorder.Code != http.StatusNotFound {
		t.Fatalf("未知路径期望 404，实际 %d", recorder.Code)
	}
}
