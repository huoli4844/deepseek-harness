// 本文件验证组织架构接口的透传、部门范围过滤与鉴权行为。
package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/organization/application"
	organizationrepository "starpivot.local/deepseek-harness-backend/internal/organization/repository"
)

// organizationUpstream 模拟元枢部门树、用户接口与成员编辑删除接口。
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
			// 部门 ID 缺失表示未分配部门的成员。
			{"id": 15, "nickname": "王五"},
		}
		writeEnvelope(t, w, map[string]any{"list": users, "page": 1, "page_size": 200, "total": len(users)})
	})
	mux.HandleFunc("PUT /api/v1/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/api/v1/users/404" {
			writeEnvelopeStatus(t, w, http.StatusNotFound, "用户不存在")
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if r.Header.Get("Content-Type") != "application/json" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		writeEnvelope(t, w, map[string]any{"id": r.PathValue("id"), "nickname": payload["nickname"]})
	})
	mux.HandleFunc("DELETE /api/v1/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/api/v1/users/404" {
			writeEnvelopeStatus(t, w, http.StatusNotFound, "用户不存在")
			return
		}
		writeEnvelope(t, w, map[string]any{"id": r.PathValue("id")})
	})
	mux.HandleFunc("GET /api/v1/roles", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		writeEnvelope(t, w, map[string]any{"list": []map[string]any{
			{"id": 51, "name": "管理员", "code": "admin", "status": 1},
			{"id": 52, "name": "已停用角色", "code": "disabled", "status": 0},
		}, "page": 1, "page_size": 100, "total": 2})
	})
	mux.HandleFunc("PUT /api/v1/users/{id}/status", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		writeEnvelope(t, w, map[string]any{"id": r.PathValue("id"), "status": payload["status"]})
	})
	mux.HandleFunc("POST /api/v1/users/{id}/roles", func(w http.ResponseWriter, r *http.Request) {
		if unauthorized {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		writeEnvelope(t, w, map[string]any{"id": r.PathValue("id"), "role_ids": payload["role_ids"]})
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func writeEnvelope(t *testing.T, w http.ResponseWriter, data any) {
	t.Helper()
	writeEnvelopeStatus(t, w, http.StatusOK, data)
}

func writeEnvelopeStatus(t *testing.T, w http.ResponseWriter, status int, data any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	payload := map[string]any{"code": status, "message": "success", "data": data}
	if text, ok := data.(string); ok {
		payload = map[string]any{"code": status, "message": text, "data": nil}
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
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

// organizationRequestBody 携带请求体调用接口，空 token 表示匿名调用。
func organizationRequestBody(
	mux *http.ServeMux,
	method string,
	target string,
	token string,
	body io.Reader,
) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, body)
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("X-Active-Tenant", "shaoshi")
	}
	if body != nil && method != http.MethodDelete {
		request.Header.Set("Content-Type", "application/json")
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
	data, ok := body["data"].(map[string]any)
	if !ok {
		t.Fatalf("期望快照对象，实际 %v", body["data"])
	}
	if count, _ := data["unassigned_count"].(float64); int(count) != 1 {
		t.Fatalf("未分配成员应为 1 人，实际 %v", data["unassigned_count"])
	}
	nodes, ok := data["departments"].([]any)
	if !ok || len(nodes) != 2 {
		t.Fatalf("期望两个根部门，实际 %v", data["departments"])
	}
	headquarters, _ := nodes[0].(map[string]any)
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
	sales, _ := nodes[1].(map[string]any)
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

func TestOrganizationUnassignedUsers(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users?department_id=0", "token")
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d", recorder.Code)
	}
	data, _ := decodeOrganization(t, recorder)["data"].(map[string]any)
	if total, _ := data["total"].(float64); int(total) != 1 {
		t.Fatalf("未分配成员应返回 1 人，实际 total=%v", data["total"])
	}
	list, _ := data["list"].([]any)
	member, _ := list[0].(map[string]any)
	if nickname, _ := member["nickname"].(string); nickname != "王五" {
		t.Fatalf("未分配成员应为王五，实际 %v", member)
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
	if recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users/1", "token"); recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET 用户详情未注册应返回 405，实际 %d", recorder.Code)
	}
	if recorder := organizationRequest(mux, http.MethodGet, "/api/v1/departments", "token"); recorder.Code != http.StatusNotFound {
		t.Fatalf("未知路径期望 404，实际 %d", recorder.Code)
	}
}

func TestOrganizationUpdateUser(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	body := strings.NewReader(`{"nickname":"王小明","email":"wang@example.com","phone":"13800000000"}`)
	recorder := organizationRequestBody(mux, http.MethodPut, "/api/v1/users/15", "token", body)
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	if got := decodeOrganization(t, recorder)["data"]; got != nil {
		t.Fatalf("编辑成功无需回传数据，实际 %v", got)
	}
}

func TestOrganizationUpdateUserRejectsInvalidBody(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	cases := []struct {
		name    string
		method  string
		path    string
		payload string
	}{
		{"昵称为空", http.MethodPut, "/api/v1/users/15", `{"nickname":"  ","email":"","phone":""}`},
		{"未知字段", http.MethodPut, "/api/v1/users/15", `{"nickname":"张三","status":1}`},
		{"尾随内容", http.MethodPut, "/api/v1/users/15", `{"nickname":"张三"}{"x":1}`},
		{"非法ID", http.MethodPut, "/api/v1/users/0", `{"nickname":"张三"}`},
		{"非法JSON", http.MethodPut, "/api/v1/users/15", `{"nickname":`},
		{"非法路径ID", http.MethodDelete, "/api/v1/users/abc", ""},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			recorder := organizationRequestBody(mux, item.method, item.path, "token", strings.NewReader(item.payload))
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("期望 400，实际 %d：%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestOrganizationUpdateUserUnauthorized(t *testing.T) {
	upstream := organizationUpstream(t, true)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequestBody(
		mux, http.MethodPut, "/api/v1/users/15", "token",
		strings.NewReader(`{"nickname":"张三","email":"zhang@example.com","phone":""}`))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，实际 %d", recorder.Code)
	}
}

func TestOrganizationUpdateUserUpstreamNotFound(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequestBody(
		mux, http.MethodPut, "/api/v1/users/404", "token",
		strings.NewReader(`{"nickname":"张三","email":"zhang@example.com","phone":""}`))
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("期望透传上游 404，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	if message, _ := decodeOrganization(t, recorder)["message"].(string); message != "用户不存在" {
		t.Fatalf("应透传上游错误信息，实际 %v", message)
	}
}

func TestOrganizationUpdateUserRequiresEmail(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	// 元枢要求邮箱必填：邮箱为空时后台直接拒绝，不透传上游。
	recorder := organizationRequestBody(
		mux, http.MethodPut, "/api/v1/users/15", "token",
		strings.NewReader(`{"nickname":"张三","email":"","phone":"13800000000"}`))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("邮箱为空期望 400，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	// 手机号留空表示保持原值，仍应成功透传。
	recorder = organizationRequestBody(
		mux, http.MethodPut, "/api/v1/users/15", "token",
		strings.NewReader(`{"nickname":"张三","email":"zhang@example.com","phone":""}`))
	if recorder.Code != http.StatusOK {
		t.Fatalf("手机号留空期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
}

func TestOrganizationUserStatusAndRoles(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequestBody(
		mux, http.MethodPut, "/api/v1/users/15/status", "token",
		strings.NewReader(`{"status":0}`))
	if recorder.Code != http.StatusOK {
		t.Fatalf("停用成员期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	recorder = organizationRequestBody(
		mux, http.MethodPost, "/api/v1/users/15/roles", "token",
		strings.NewReader(`{"role_ids":[51,52]}`))
	if recorder.Code != http.StatusOK {
		t.Fatalf("分配角色期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	for _, item := range []struct {
		name    string
		method  string
		path    string
		payload string
	}{
		{"状态非法", http.MethodPut, "/api/v1/users/15/status", `{"status":2}`},
		{"角色ID非法", http.MethodPost, "/api/v1/users/15/roles", `{"role_ids":[0]}`},
		{"未知字段", http.MethodPost, "/api/v1/users/15/roles", `{"role_ids":[51],"status":1}`},
	} {
		recorder := organizationRequestBody(mux, item.method, item.path, "token", strings.NewReader(item.payload))
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("%s 期望 400，实际 %d：%s", item.name, recorder.Code, recorder.Body.String())
		}
	}
	if recorder := organizationRequest(mux, http.MethodGet, "/api/v1/users/15/status", "token"); recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET 状态接口未注册应返回 405，实际 %d", recorder.Code)
	}
}

func TestOrganizationRoles(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequest(mux, http.MethodGet, "/api/v1/roles", "token")
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	data, ok := decodeOrganization(t, recorder)["data"].([]any)
	if !ok {
		t.Fatalf("期望角色数组，实际 %v", decodeOrganization(t, recorder)["data"])
	}
	if len(data) != 1 {
		t.Fatalf("期望仅保留启用角色 1 个，实际 %d", len(data))
	}
	role, _ := data[0].(map[string]any)
	if name, _ := role["name"].(string); name != "管理员" {
		t.Fatalf("期望启用角色为管理员，实际 %v", role)
	}
	if recorder := organizationRequest(mux, http.MethodGet, "/api/v1/roles", ""); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("缺少凭证期望 401，实际 %d", recorder.Code)
	}
}

func TestOrganizationDeleteUser(t *testing.T) {
	upstream := organizationUpstream(t, false)
	mux := newOrganizationMux(t, upstream.URL)
	recorder := organizationRequestBody(mux, http.MethodDelete, "/api/v1/users/15", "token", nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d：%s", recorder.Code, recorder.Body.String())
	}
	if recorder := organizationRequestBody(mux, http.MethodDelete, "/api/v1/users/404", "token", nil); recorder.Code != http.StatusNotFound {
		t.Fatalf("删除不存在用户期望 404，实际 %d", recorder.Code)
	}
	if recorder := organizationRequestBody(mux, http.MethodDelete, "/api/v1/users/15", "", nil); recorder.Code != http.StatusUnauthorized {
		t.Fatalf("缺少凭证期望 401，实际 %d", recorder.Code)
	}
}
