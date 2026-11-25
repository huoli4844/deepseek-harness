// 本文件验证客户路由权限与 HTTP 响应，不使用外部数据库。
package httpapi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"

	"starpivot.local/deepseek-harness-backend/internal/customer/application"
	"starpivot.local/deepseek-harness-backend/internal/customer/domain"
	"starpivot.local/deepseek-harness-backend/internal/transport/httpapi"
)

const customers = "/api/v1/apps/shaoshi/customers"
const testKey = "12345678901234567890123456789012"

type fakeRepo struct {
	application.Repository
	tenant, actor int64
}

func (f *fakeRepo) Create(_ context.Context, tenant, actor int64, d domain.Draft) (domain.Customer, error) {
	f.tenant, f.actor = tenant, actor
	return domain.Customer{ID: 1, Draft: d, CreatedBy: actor, CreditUsed: "0"}, nil
}

func (f *fakeRepo) List(_ context.Context, tenant int64, page, size int, query archivequery.Query) (domain.Page, error) {
	f.tenant = tenant
	total := int64(15)
	if query.Keyword == "客户" || (query.Code == "A" && query.Name == "B" && query.ContactPerson == "C" &&
		query.SortBy == "name" && query.SortDirection == "desc") {
		total = 2
	}
	return domain.Page{Items: []domain.Customer{}, Total: total, ArchiveTotal: 15, Page: page, Size: size}, nil
}

func (f *fakeRepo) Get(_ context.Context, tenant, _ int64) (domain.Customer, error) {
	f.tenant = tenant
	return domain.Customer{}, domain.ErrNotFound
}

func TestCustomerHTTP(t *testing.T) {
	repo := &fakeRepo{}
	mux := http.NewServeMux()
	httpapi.RegisterCustomers(mux, application.New(repo), httpapi.NewLocalCustomerGateway([32]byte([]byte(testKey))))
	valid := `{"code":"C1","name":"客户"}`
	for _, tc := range []struct {
		name, method, path, body, access, want string
		status                                 int
	}{
		{"拒绝伪造身份", "POST", customers, valid, "", "", 401},
		{"只读不允许写入", "POST", customers, valid, "read", "", 403},
		{"拒绝请求体创建人", "POST", customers, `{"code":"C1","name":"客户","created_by":7}`, "write", "", 400},
		{"拒绝请求体租户", "POST", customers, `{"code":"C1","name":"客户","business_tenant_id":9}`, "write", "", 400},
		{"创建人来自可信身份", "POST", customers, valid, "write", `"created_by":42`, 200},
		{"页明细和总数独立", "GET", customers + "?page=4&page_size=2", "", "read", `"items":[],"total":15,"archive_total":15,"page":4,"page_size":2`, 200},
		{"搜索总数和档案总数独立", "GET", customers + "?keyword=%20%E5%AE%A2%E6%88%B7%20", "", "read", `"total":2,"archive_total":15`, 200},
		{"结构化筛选和排序", "GET", customers + "?code=A&name=B&contact_person=C&sort_by=name&sort_direction=desc", "", "read", `"total":2,"archive_total":15`, 200},
		{"页大小超限", "GET", customers + "?page_size=201", "", "read", "", 400},
		{"当前租户未发现资源", "GET", customers + "/10", "", "read", "", 404},
		{"不支持的 HTTP 方法", "PATCH", customers + "/1", "", "write", "", 405},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			setGateway(r, tc.access)
			if tc.access == "" {
				r.Header.Del("X-Starpivot-Gateway-Key")
			}
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != tc.status || !strings.Contains(w.Body.String(), tc.want) {
				t.Fatalf("响应不符：%d %s", w.Code, w.Body.String())
			}
		})
	}
	if repo.tenant != 5 || repo.actor != 42 {
		t.Fatalf("仓储身份错误：%d/%d", repo.tenant, repo.actor)
	}
}

func TestGatewayRejectsRemoteAssertions(t *testing.T) {
	r := httptest.NewRequest("GET", customers, nil)
	setGateway(r, "write")
	r.RemoteAddr = "192.0.2.1:3456"
	a := httpapi.NewLocalCustomerGateway([32]byte([]byte(testKey)))
	if _, ok := a.AuthorizeCustomer(r); ok {
		t.Fatal("不能接受来自非本机的身份断言")
	}
}

func TestTemporaryCustomerReads(t *testing.T) {
	repo := &fakeRepo{}
	mux := http.NewServeMux()
	gateway := httpapi.NewLocalCustomerGateway([32]byte([]byte(testKey)))
	httpapi.RegisterCustomers(mux, application.New(repo), httpapi.WithTemporaryTenantReads(gateway, 3))
	for _, tc := range []struct {
		method, address string
		status          int
	}{
		{"GET", "127.0.0.1:2345", 200},
		{"HEAD", "[::1]:2345", 200},
		{"GET", "192.0.2.1:2345", 401},
		{"POST", "127.0.0.1:2345", 401},
	} {
		req := httptest.NewRequest(tc.method, customers, nil)
		req.RemoteAddr = tc.address
		req.Header.Set("X-Active-Tenant", "another-tenant")
		req.Header.Set("X-Starpivot-Tenant-Id", "99")
		resp := httptest.NewRecorder()
		mux.ServeHTTP(resp, req)
		if resp.Code != tc.status || repo.tenant != 3 || repo.actor != 0 {
			t.Fatalf("%s %s：状态=%d，租户=%d，用户=%d", tc.method, tc.address, resp.Code, repo.tenant, repo.actor)
		}
	}
	req := httptest.NewRequest("GET", customers, nil)
	setGateway(req, "write")
	resp := httptest.NewRecorder()
	mux.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK || repo.tenant != 5 {
		t.Fatalf("可信网关身份应优先于临时配置，状态=%d，租户=%d", resp.Code, repo.tenant)
	}
}

func setGateway(r *http.Request, access string) {
	r.RemoteAddr = "127.0.0.1:2345"
	r.Header.Set("X-Starpivot-Gateway-Key", testKey)
	r.Header.Set("X-Starpivot-User-Id", "42")
	r.Header.Set("X-Starpivot-Tenant-Id", "5")
	r.Header.Set("X-Starpivot-Customer-Access", access)
}
