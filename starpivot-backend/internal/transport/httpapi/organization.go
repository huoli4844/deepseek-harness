// 本文件注册组织架构树与成员列表接口，沿用元枢原始路径并透传凭证。
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/organization/application"
	"starpivot.local/deepseek-harness-backend/internal/organization/domain"
)

const (
	organizationTreePath  = "/api/v1/departments/tree"
	organizationUsersPath = "/api/v1/users"
	organizationMaxSize   = 200
)

type organizationHandler struct {
	service *application.Service
}

// RegisterOrganization 注册组织架构与用户查询接口。
func RegisterOrganization(mux *http.ServeMux, service *application.Service) {
	h := organizationHandler{service: service}
	mux.HandleFunc("GET "+organizationTreePath, h.tree)
	mux.HandleFunc("GET "+organizationUsersPath, h.users)
}

func (h organizationHandler) tree(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	data, err := h.service.Tree(r.Context(), credential)
	finishOrganization(w, r, data, err)
}

func (h organizationHandler) users(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	query, ok := parseOrganizationUsers(r)
	if !ok {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.Users(r.Context(), credential, query)
	finishOrganization(w, r, data, err)
}

// parseOrganizationUsers 校验成员查询参数，非法参数直接返回 false。
func parseOrganizationUsers(r *http.Request) (domain.UsersQuery, bool) {
	values := r.URL.Query()
	for _, key := range []string{"department_id", "keyword"} {
		if len(values[key]) > 1 {
			return domain.UsersQuery{}, false
		}
	}
	query := domain.UsersQuery{Keyword: strings.TrimSpace(values.Get("keyword"))}
	if len(query.Keyword) > 64 {
		return domain.UsersQuery{}, false
	}
	if raw := values.Get("department_id"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id < 0 {
			return domain.UsersQuery{}, false
		}
		query.DepartmentID = id
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	if !okPage || !okSize || page < 1 || size < 1 || size > organizationMaxSize {
		return domain.UsersQuery{}, false
	}
	query.Page, query.PageSize = page, size
	return query, true
}

// organizationCredential 要求调用方提供元枢 Bearer 凭证，租户编码可选。
func organizationCredential(w http.ResponseWriter, r *http.Request) (domain.Credential, bool) {
	token, ok := bearerToken(r)
	if !ok {
		finishOrganization(w, r, nil, domain.ErrUnauthorized)
		return domain.Credential{}, false
	}
	code, ok := activeTenant(r)
	if !ok {
		finishOrganization(w, r, nil, domain.ErrUnauthorized)
		return domain.Credential{}, false
	}
	return domain.Credential{Token: token, TenantCode: code}, true
}

// finishOrganization 输出与元枢一致的响应信封，并映射领域错误。
func finishOrganization(w http.ResponseWriter, r *http.Request, data any, err error) {
	status, message := http.StatusOK, "成功"
	switch {
	case err == nil:
	case errors.Is(err, domain.ErrInvalid):
		status, message = http.StatusBadRequest, domain.ErrInvalid.Error()
	case errors.Is(err, domain.ErrUnauthorized):
		status, message = http.StatusUnauthorized, domain.ErrUnauthorized.Error()
	case errors.Is(err, domain.ErrUnavailable):
		status, message = http.StatusBadGateway, domain.ErrUnavailable.Error()
	default:
		slog.ErrorContext(r.Context(), "组织架构请求处理失败", "error_type", err)
		status, message = http.StatusServiceUnavailable, "组织架构服务暂不可用"
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	code := status
	if status == http.StatusOK {
		code = 0
	}
	if encodeErr := json.NewEncoder(w).Encode(map[string]any{
		"code": code, "message": message, "data": data,
	}); encodeErr != nil {
		slog.WarnContext(r.Context(), "组织架构响应写入失败")
	}
}
