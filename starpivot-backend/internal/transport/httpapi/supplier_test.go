// 本包验证供应商 HTTP 契约与可信身份边界，不连接数据库。
package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"

	"starpivot.local/deepseek-harness-backend/internal/supplier/application"
	"starpivot.local/deepseek-harness-backend/internal/supplier/domain"
)

type supplierTestAuth struct {
	access CustomerAccess
	allow  bool
}

func (a supplierTestAuth) AuthorizeCustomer(*http.Request) (CustomerAccess, bool) {
	return a.access, a.allow
}

type supplierTestRepository struct {
	tenant int64
	actor  int64
	kind   domain.Kind
	query  archivequery.Query
}

func (r *supplierTestRepository) List(_ context.Context, kind domain.Kind, tenant, _ int64, page, size int, query archivequery.Query) (application.Page, error) {
	r.tenant, r.kind, r.query = tenant, kind, query
	return application.Page{Items: []json.RawMessage{json.RawMessage(`{"id":8}`)}, Total: 9, ArchiveTotal: 19, Page: page, Size: size}, nil
}

func (r *supplierTestRepository) Get(context.Context, domain.Kind, int64, int64) (json.RawMessage, error) {
	return nil, domain.ErrNotFound
}

func (r *supplierTestRepository) Create(_ context.Context, kind domain.Kind, tenant, actor, _ int64, _ map[string]json.RawMessage) (json.RawMessage, error) {
	r.tenant, r.actor, r.kind = tenant, actor, kind
	return json.RawMessage(`{"id":21}`), nil
}

func (r *supplierTestRepository) Update(context.Context, domain.Kind, int64, int64, map[string]json.RawMessage) (json.RawMessage, error) {
	return json.RawMessage(`{"id":21}`), nil
}

func (r *supplierTestRepository) Delete(context.Context, domain.Kind, int64, int64) (json.RawMessage, error) {
	return json.RawMessage(`{"id":21}`), nil
}

func (r *supplierTestRepository) Categories(context.Context, int64) ([]string, int64, error) {
	return []string{"机加工类"}, 1, nil
}

func TestSupplierRoutesRequireTrustedIdentity(t *testing.T) {
	repo := &supplierTestRepository{}
	mux := http.NewServeMux()
	RegisterSuppliers(mux, application.New(repo), supplierTestAuth{})
	cases := []struct{ method, path string }{
		{http.MethodGet, supplierPath + "/suppliers"},
		{http.MethodPost, supplierPath + "/suppliers"},
		{http.MethodPut, supplierPath + "/suppliers/1"},
		{http.MethodDelete, supplierPath + "/suppliers/1"},
		{http.MethodPut, supplierPath + "/suppliers/1"},
		{http.MethodDelete, supplierPath + "/suppliers/1"},
		{http.MethodGet, supplierPath + "/supplier-categories"},
		{http.MethodGet, supplierPath + "/suppliers/1/contacts"},
		{http.MethodPost, supplierPath + "/suppliers/1/contacts"},
		{http.MethodGet, supplierPath + "/suppliers/1/bank-accounts"},
		{http.MethodPost, supplierPath + "/suppliers/1/bank-accounts"},
		{http.MethodGet, supplierPath + "/suppliers/1/qualifications"},
		{http.MethodPost, supplierPath + "/suppliers/1/qualifications"},
		{http.MethodPut, supplierPath + "/supplier-contacts/1"},
		{http.MethodDelete, supplierPath + "/supplier-contacts/1"},
		{http.MethodPut, supplierPath + "/supplier-bank-accounts/1"},
		{http.MethodDelete, supplierPath + "/supplier-bank-accounts/1"},
		{http.MethodPut, supplierPath + "/supplier-qualifications/1"},
		{http.MethodDelete, supplierPath + "/supplier-qualifications/1"},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{}`)))
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("未验证身份的请求应被拒绝，实际状态码 %d", response.Code)
			}
		})
	}
}

func TestSupplierCreateUsesTrustedTenantAndActor(t *testing.T) {
	repo := &supplierTestRepository{}
	service := application.New(repo)
	mux := http.NewServeMux()
	RegisterSuppliers(mux, service, supplierTestAuth{
		access: CustomerAccess{UserID: 42, TenantID: 3, CanWrite: true}, allow: true,
	})
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, supplierPath+"/suppliers", strings.NewReader(`{"name":"示例","created_by":999,"business_tenant_id":999}`)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("客户端传入系统字段应被拒绝，实际状态码 %d", response.Code)
	}
	response = httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest(http.MethodPost, supplierPath+"/suppliers", strings.NewReader(`{"name":"示例"}`)))
	if response.Code != http.StatusOK || repo.tenant != 3 || repo.actor != 42 || repo.kind != domain.Supplier {
		t.Fatalf("创建未采用可信身份，状态码=%d tenant=%d actor=%d kind=%s", response.Code, repo.tenant, repo.actor, repo.kind)
	}
}

func TestSupplierListReturnsTotal(t *testing.T) {
	repo := &supplierTestRepository{}
	mux := http.NewServeMux()
	RegisterSuppliers(mux, application.New(repo), WithTemporaryTenantReads(supplierTestAuth{}, 3))
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, supplierPath+"/suppliers?page=2&page_size=10&code=S&name=metal&category=raw&contact_person=Lee&sort_by=category&sort_direction=asc", nil)
	request.RemoteAddr = "127.0.0.1:2345"
	request.Header.Set("Authorization", "Bearer forwarded-token")
	request.Header.Set("X-Active-Tenant", "another-tenant")
	mux.ServeHTTP(response, request)
	wantQuery := archivequery.Query{Code: "S", Name: "metal", Category: "raw", ContactPerson: "Lee", SortBy: "category", SortDirection: "asc"}
	if response.Code != http.StatusOK || repo.tenant != 3 || repo.kind != domain.Supplier || repo.query != wantQuery {
		t.Fatalf("供应商列表请求未按可信租户查询，状态码=%d tenant=%d kind=%s", response.Code, repo.tenant, repo.kind)
	}
	var payload struct {
		Data application.Page `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Data.Total != 9 || payload.Data.ArchiveTotal != 19 || payload.Data.Page != 2 || payload.Data.Size != 10 || len(payload.Data.Items) != 1 {
		t.Fatalf("列表响应分页与总数不符：%s", response.Body.String())
	}
}
