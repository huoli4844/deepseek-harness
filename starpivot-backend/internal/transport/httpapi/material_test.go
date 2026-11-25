// 本文件验证物料 HTTP 路由、参数传递和可信身份边界。
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/material/application"
	"starpivot.local/deepseek-harness-backend/internal/material/domain"
)

type materialTestRepo struct {
	tenant        int64
	query         domain.ListQuery
	keyword       string
	draft         domain.CategoryDraft
	materialID    int64
	materialDraft domain.MaterialDraft
	err           error
}

func (r *materialTestRepo) List(_ context.Context, tenant int64, q domain.ListQuery) (domain.Page, error) {
	r.tenant, r.query = tenant, q
	return domain.Page{Items: []json.RawMessage{}, Total: 2, ArchiveTotal: 10, Page: q.Page, PageSize: q.PageSize,
		MaterialTypes: []string{"raw"}, CriticalLevels: []string{"normal"}}, r.err
}

func (r *materialTestRepo) Categories(_ context.Context, tenant int64, keyword string) ([]domain.Category, error) {
	r.tenant, r.keyword = tenant, keyword
	return []domain.Category{{ID: 6}}, r.err
}

func (r *materialTestRepo) CreateCategory(_ context.Context, tenant int64, d domain.CategoryDraft) (domain.Category, error) {
	r.tenant, r.draft = tenant, d
	return domain.Category{ID: 12, ParentID: d.ParentID, Code: d.Code, Name: d.Name}, r.err
}

func (r *materialTestRepo) UpdateMaterial(_ context.Context, tenant, id int64, draft domain.MaterialDraft) error {
	r.tenant, r.materialID, r.materialDraft = tenant, id, draft
	return r.err
}

func (r *materialTestRepo) DeleteMaterial(_ context.Context, tenant, id int64) error {
	r.tenant, r.materialID = tenant, id
	return r.err
}

type materialTestAuth struct {
	access CustomerAccess
	ok     bool
}

func (a materialTestAuth) AuthorizeCustomer(*http.Request) (CustomerAccess, bool) {
	return a.access, a.ok
}

func materialRequest(mux *http.ServeMux, method, target, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.Header.Set("X-Active-Tenant", "other-tenant")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}

func TestMaterialListFilters(t *testing.T) {
	mux := http.NewServeMux()
	repo := &materialTestRepo{}
	RegisterMaterials(mux, application.New(repo), materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3}, true})
	path := materialPath + "?page=4&page_size=10&category_id=6&code=%20A%20&name=B&material_type=raw&critical_level=normal&sort_by=name&sort_dir=desc"
	w := materialRequest(mux, http.MethodGet, path, "")
	want := domain.ListQuery{Page: 4, PageSize: 10, CategoryID: 6, Code: "A", Name: "B", MaterialType: "raw",
		CriticalLevel: "normal", SortBy: "name", SortDir: "desc"}
	if w.Code != http.StatusOK || repo.tenant != 3 || repo.query != want {
		t.Fatalf("可信租户或物料查询参数不符：状态 %d，租户 %d，参数 %+v", w.Code, repo.tenant, repo.query)
	}
	if !strings.Contains(w.Body.String(), `"total":2,"archive_total":10`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("分页总数或缓存策略不符：%s", w.Body.String())
	}
	w = materialRequest(mux, http.MethodGet, materialCategoryPath+"?keyword=%20class%20", "")
	if w.Code != http.StatusOK || repo.keyword != "class" || !strings.Contains(w.Body.String(), `"items":[{"id":6`) {
		t.Fatalf("分类搜索结果不符：状态 %d，响应 %s", w.Code, w.Body.String())
	}
}

func TestMaterialCategoryWrites(t *testing.T) {
	for _, tc := range []struct {
		name string
		auth materialTestAuth
		body string
		err  error
		code int
	}{
		{"无登录身份", materialTestAuth{}, `{"code":"C","name":"分类"}`, nil, 401},
		{"只有查询权限", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3}, true}, `{"code":"C","name":"分类"}`, nil, 403},
		{"拒绝调用方设置租户", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, `{"code":"C","name":"分类","business_tenant_id":9}`, nil, 400},
		{"父级不属于当前租户", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, `{"code":"C","name":"分类","parent_id":6}`, domain.ErrNotFound, 404},
		{"编码已存在", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, `{"code":"C","name":"分类"}`, domain.ErrConflict, 409},
		{"新增子分类", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, `{"code":" C ","name":" 分类 ","parent_id":6}`, nil, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			repo := &materialTestRepo{err: tc.err}
			RegisterMaterials(mux, application.New(repo), tc.auth)
			w := materialRequest(mux, http.MethodPost, materialCategoryPath, tc.body)
			if w.Code != tc.code {
				t.Fatalf("状态为 %d，预期 %d：%s", w.Code, tc.code, w.Body.String())
			}
			if tc.code == 200 && (repo.tenant != 3 || repo.draft.Code != "C" || repo.draft.Name != "分类" ||
				repo.draft.ParentID == nil || *repo.draft.ParentID != 6) {
				t.Fatal("创建分类时没有使用可信租户或未传入净化后的分类数据")
			}
		})
	}
}

func TestMaterialRecordWrites(t *testing.T) {
	body := `{"code":"M-1","name":"钢板","spec":null,"material_type":"raw","category_code":"R","category_code2":"R-1","unit":"kg","brand":"B","model":"X","drawing_no":null,"price_suggested":1.2500,"safety_stock":2,"lead_time_days":3,"critical_level":"A","remark":"备注","status":1}`
	for _, tc := range []struct {
		name string
		auth materialTestAuth
		body string
		err  error
		code int
	}{
		{"未授权更新", materialTestAuth{}, body, nil, 401},
		{"无写权限", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3}, true}, body, nil, 403},
		{"拒绝客户端租户字段", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, strings.TrimSuffix(body, "}") + `,"business_tenant_id":9}`, nil, 400},
		{"拒绝无效价格", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, strings.Replace(body, `"price_suggested":1.2500`, `"price_suggested":-1`, 1), nil, 400},
		{"编码冲突", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, body, domain.ErrMaterialConflict, 409},
		{"物料不存在", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, body, domain.ErrMaterialNotFound, 404},
		{"更新当前租户物料", materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true}, body, nil, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			repo := &materialTestRepo{err: tc.err}
			RegisterMaterials(mux, application.New(repo), tc.auth)
			w := materialRequest(mux, http.MethodPut, materialPath+"/17", tc.body)
			if w.Code != tc.code {
				t.Fatalf("状态为 %d，预期 %d：%s", w.Code, tc.code, w.Body.String())
			}
			if tc.code == http.StatusOK && (repo.tenant != 3 || repo.materialID != 17 || repo.materialDraft.Code != "M-1" ||
				repo.materialDraft.PriceSuggested.String() != "1.2500" || repo.materialDraft.Status != 1) {
				t.Fatalf("更新未使用可信租户或未解析物料字段：租户 %d，ID %d，草稿 %+v", repo.tenant, repo.materialID, repo.materialDraft)
			}
		})
	}
	mux := http.NewServeMux()
	repo := &materialTestRepo{}
	RegisterMaterials(mux, application.New(repo), materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3, CanWrite: true}, true})
	w := materialRequest(mux, http.MethodDelete, materialPath+"/17", "")
	if w.Code != http.StatusOK || repo.tenant != 3 || repo.materialID != 17 {
		t.Fatalf("软删除未使用可信租户和记录 ID：状态 %d，租户 %d，ID %d", w.Code, repo.tenant, repo.materialID)
	}
}

func TestMaterialWriteUsesBearerIdentityAndTrustedTenant(t *testing.T) {
	identity := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer material-token" || r.Header.Get("X-Active-Tenant") != "shaoshi" {
			t.Errorf("身份查询未转发当前 Bearer 和租户：%s %s", r.Method, r.URL.Path)
		}
		if r.URL.Path == "/api/v1/user/me" {
			_, _ = w.Write([]byte(`{"data":{"id":2}}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":{"current":{"id":3,"code":"shaoshi"}}}`))
	}))
	defer identity.Close()

	repo := &materialTestRepo{}
	authorizer := WithBearerIdentity(WithTemporaryTenantReads(materialTestAuth{}, 3), identity.URL, identity.Client())
	mux := http.NewServeMux()
	RegisterMaterials(mux, application.New(repo), authorizer)
	request := httptest.NewRequest(http.MethodDelete, materialPath+"/17", nil)
	request.Header.Set("Authorization", "Bearer material-token")
	request.Header.Set("X-Active-Tenant", "shaoshi")
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	if response.Code != http.StatusOK || repo.tenant != 3 || repo.materialID != 17 {
		t.Fatalf("Bearer 软删除身份或租户错误：状态 %d，租户 %d，ID %d，响应 %s", response.Code, repo.tenant, repo.materialID, response.Body.String())
	}
}

func TestMaterialRoutesRejectInvalidRequests(t *testing.T) {
	mux := http.NewServeMux()
	repo := &materialTestRepo{}
	RegisterMaterials(mux, application.New(repo), materialTestAuth{CustomerAccess{UserID: 2, TenantID: 3}, true})
	for _, tc := range []struct {
		method, path string
		code         int
	}{
		{http.MethodDelete, materialCategoryPath, 405},
		{http.MethodGet, materialPath + "/unknown", 405},
		{http.MethodGet, materialPath + "?category_id=-1", 400},
		{http.MethodGet, materialPath + "?page_size=201", 400},
		{http.MethodGet, materialPath + "?code=A&code=B", 400},
		{http.MethodGet, materialCategoryPath + "?keyword=%00", 400},
	} {
		w := materialRequest(mux, tc.method, tc.path, "")
		if w.Code != tc.code || repo.tenant != 0 {
			t.Fatalf("%s %s 应返回 %d 且不访问仓储：状态 %d", tc.method, tc.path, tc.code, w.Code)
		}
	}
}
