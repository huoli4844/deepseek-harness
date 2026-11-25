// 本文件验证本机网关传入的客户身份，不维护平台权限。
package httpapi

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strconv"
)

// CustomerAccess 是服务端确定的业务资源访问范围。
type CustomerAccess struct {
	UserID   int64
	TenantID int64
	CanWrite bool
}

// CustomerAuthorizer 返回服务端允许的资源访问范围。
type CustomerAuthorizer interface {
	AuthorizeCustomer(*http.Request) (CustomerAccess, bool)
}

type localGateway struct{ secret [32]byte }

type temporaryTenantReads struct {
	gateway  CustomerAuthorizer
	tenantID int64
}

// WithTemporaryTenantReads 在缺少可信网关身份时为本机查询启用配置指定的租户。
func WithTemporaryTenantReads(gateway CustomerAuthorizer, tenantID int64) CustomerAuthorizer {
	if tenantID <= 0 {
		return gateway
	}
	return temporaryTenantReads{gateway: gateway, tenantID: tenantID}
}

func (a temporaryTenantReads) AuthorizeCustomer(r *http.Request) (CustomerAccess, bool) {
	if access, ok := a.gateway.AuthorizeCustomer(r); ok {
		return access, true
	}
	if (r.Method == http.MethodGet || r.Method == http.MethodHead) && isLoopbackRequest(r) {
		return CustomerAccess{TenantID: a.tenantID}, true
	}
	return CustomerAccess{}, false
}

// NewLocalCustomerGateway 接受授权网关使用的本机共享密钥。
func NewLocalCustomerGateway(secret [32]byte) CustomerAuthorizer {
	return localGateway{secret: secret}
}

func (g localGateway) AuthorizeCustomer(r *http.Request) (CustomerAccess, bool) {
	if !isLoopbackRequest(r) {
		return CustomerAccess{}, false
	}
	key := r.Header.Values("X-Starpivot-Gateway-Key")
	if len(key) != 1 || subtle.ConstantTimeCompare([]byte(key[0]), g.secret[:]) != 1 {
		return CustomerAccess{}, false
	}
	user, userOK := positiveHeader(r, "X-Starpivot-User-Id")
	tenant, tenantOK := positiveHeader(r, "X-Starpivot-Tenant-Id")
	scope := r.Header.Values("X-Starpivot-Customer-Access")
	if !userOK || !tenantOK || len(scope) != 1 || (scope[0] != "read" && scope[0] != "write") {
		return CustomerAccess{}, false
	}
	return CustomerAccess{UserID: user, TenantID: tenant, CanWrite: scope[0] == "write"}, true
}

func isLoopbackRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	return err == nil && net.ParseIP(host).IsLoopback()
}

func positiveHeader(r *http.Request, name string) (int64, bool) {
	values := r.Header.Values(name)
	if len(values) != 1 {
		return 0, false
	}
	v, err := strconv.ParseInt(values[0], 10, 64)
	return v, err == nil && v > 0
}
