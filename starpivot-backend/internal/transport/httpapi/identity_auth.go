// 本文件用元枢身份接口校验 Bearer 凭证，不维护平台权限。
package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// 身份接口只接受与项目编码同类的租户编码，避免把异常字符转发给云端。
var tenantCodePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

const identityBodyLimit = 64 << 10

type bearerIdentity struct {
	gateway CustomerAuthorizer
	me      *url.URL
	tenants *url.URL
	client  *http.Client
}

// WithBearerIdentity 在可信网关身份之后接受元枢 Bearer 凭证。
// 身份由元枢的当前用户与当前租户接口解析，用于本机宿主直连时不再依赖网关注入身份头。
// apiBase 为空或不是 http(s) 地址时返回原网关，保持仅网关鉴权的既有行为。
func WithBearerIdentity(gateway CustomerAuthorizer, apiBase string, client *http.Client) CustomerAuthorizer {
	base, err := url.Parse(strings.TrimRight(apiBase, "/"))
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return gateway
	}
	if client == nil {
		client = &http.Client{
			Timeout: 4 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return bearerIdentity{
		gateway: gateway,
		me:      base.JoinPath("api/v1/user/me"),
		tenants: base.JoinPath("api/v1/user/tenants"),
		client:  client,
	}
}

// AuthorizeCustomer 优先使用已校验的网关身份，其次用元枢 Bearer 凭证解析当前用户与租户。
// Bearer 身份只授予本人数据的读写权限；调用方仍需按用户与租户限制数据范围。
func (a bearerIdentity) AuthorizeCustomer(r *http.Request) (CustomerAccess, bool) {
	if access, ok := a.gateway.AuthorizeCustomer(r); ok {
		return access, true
	}
	token, ok := bearerToken(r)
	if !ok {
		return CustomerAccess{}, false
	}
	code, ok := activeTenant(r)
	if !ok {
		return CustomerAccess{}, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	var user struct {
		Data struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	var tenants struct {
		Data struct {
			Current struct {
				ID   int64  `json:"id"`
				Code string `json:"code"`
			} `json:"current"`
		} `json:"data"`
	}
	if !a.fetch(ctx, a.me, token, code, &user) || !a.fetch(ctx, a.tenants, token, code, &tenants) {
		return CustomerAccess{}, false
	}
	if user.Data.ID <= 0 || tenants.Data.Current.ID <= 0 {
		return CustomerAccess{}, false
	}
	if code != "" && tenants.Data.Current.Code != code {
		return CustomerAccess{}, false
	}
	return CustomerAccess{UserID: user.Data.ID, TenantID: tenants.Data.Current.ID, CanWrite: true}, true
}

// fetch 用同一份凭证请求身份接口，只接受 200 和 JSON 正文。
func (a bearerIdentity) fetch(ctx context.Context, target *url.URL, token, code string, into any) bool {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return false
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	if code != "" {
		request.Header.Set("X-Active-Tenant", code)
	}
	response, err := a.client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, identityBodyLimit))
		return false
	}
	return json.NewDecoder(io.LimitReader(response.Body, identityBodyLimit)).Decode(into) == nil
}

// bearerToken 只接受单个 Bearer 头，凭证内不允许空白字符。
func bearerToken(r *http.Request) (string, bool) {
	values := r.Header.Values("Authorization")
	if len(values) != 1 {
		return "", false
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(values[0], prefix) {
		return "", false
	}
	token := strings.TrimPrefix(values[0], prefix)
	if token == "" || strings.ContainsAny(token, " \t\r\n") {
		return "", false
	}
	return token, true
}

// activeTenant 返回可选的租户编码；缺省时空字符串表示沿用凭证的当前租户。
func activeTenant(r *http.Request) (string, bool) {
	values := r.Header.Values("X-Active-Tenant")
	if len(values) == 0 {
		return "", true
	}
	if len(values) != 1 || !tenantCodePattern.MatchString(values[0]) {
		return "", false
	}
	return values[0], true
}
