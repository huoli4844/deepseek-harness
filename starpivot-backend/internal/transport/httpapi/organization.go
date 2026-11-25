// 本文件注册组织架构树、成员列表与成员编辑、删除接口，沿用元枢原始路径并透传凭证。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
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
	// organizationBodyLimit 限制成员编辑请求体大小，防止异常负载透传上游。
	organizationBodyLimit = 64 << 10
)

type organizationHandler struct {
	service *application.Service
}

// RegisterOrganization 注册组织架构与用户查询、编辑、删除接口。
func RegisterOrganization(mux *http.ServeMux, service *application.Service) {
	h := organizationHandler{service: service}
	mux.HandleFunc("GET "+organizationTreePath, h.tree)
	mux.HandleFunc("GET "+organizationUsersPath, h.users)
	mux.HandleFunc("GET /api/v1/roles", h.roles)
	mux.HandleFunc("PUT /api/v1/users/{id}", h.updateUser)
	mux.HandleFunc("PUT /api/v1/users/{id}/status", h.updateUserStatus)
	mux.HandleFunc("POST /api/v1/users/{id}/roles", h.updateUserRoles)
	mux.HandleFunc("DELETE /api/v1/users/{id}", h.deleteUser)
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
// department_id=0 表示只查询未分配部门的成员。
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
		query.OnlyUnassigned = id == 0
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

// updateUser 透传成员资料编辑到元枢，仅允许昵称、邮箱与手机号。
func (h organizationHandler) updateUser(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	id, ok := parseOrganizationUserID(w, r)
	if !ok {
		return
	}
	update, ok := parseOrganizationUserUpdate(w, r)
	if !ok {
		return
	}
	err := h.service.UpdateUser(r.Context(), credential, id, update)
	finishOrganization(w, r, nil, err)
}

// roles 返回当前租户启用状态的角色列表，供成员编辑弹窗选择。
func (h organizationHandler) roles(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	data, err := h.service.Roles(r.Context(), credential)
	finishOrganization(w, r, data, err)
}

// updateUserStatus 透传成员启用状态编辑到元枢。
func (h organizationHandler) updateUserStatus(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	id, ok := parseOrganizationUserID(w, r)
	if !ok {
		return
	}
	update, ok := parseOrganizationUserStatus(w, r)
	if !ok {
		return
	}
	err := h.service.UpdateUserStatus(r.Context(), credential, id, update)
	finishOrganization(w, r, nil, err)
}

// updateUserRoles 透传成员角色分配到元枢。
func (h organizationHandler) updateUserRoles(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	id, ok := parseOrganizationUserID(w, r)
	if !ok {
		return
	}
	update, ok := parseOrganizationUserRoles(w, r)
	if !ok {
		return
	}
	err := h.service.UpdateUserRoles(r.Context(), credential, id, update)
	finishOrganization(w, r, nil, err)
}

// deleteUser 透传成员删除到元枢。
func (h organizationHandler) deleteUser(w http.ResponseWriter, r *http.Request) {
	credential, ok := organizationCredential(w, r)
	if !ok {
		return
	}
	id, ok := parseOrganizationUserID(w, r)
	if !ok {
		return
	}
	err := h.service.DeleteUser(r.Context(), credential, id)
	finishOrganization(w, r, nil, err)
}

// parseOrganizationUserID 校验路径中的用户 ID，非法时直接响应 400。
func parseOrganizationUserID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return 0, false
	}
	return id, true
}

// parseOrganizationUserUpdate 解析并校验成员编辑负载；未知字段与尾随内容视为非法。
func parseOrganizationUserUpdate(w http.ResponseWriter, r *http.Request) (domain.UserUpdate, bool) {
	var payload struct {
		Nickname string `json:"nickname"`
		Email    string `json:"email"`
		Phone    string `json:"phone"`
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, organizationBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || decoder.More() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserUpdate{}, false
	}
	update := domain.UserUpdate{
		Nickname: strings.TrimSpace(payload.Nickname),
		Email:    strings.TrimSpace(payload.Email),
		Phone:    strings.TrimSpace(payload.Phone),
	}
	if !update.Validate() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserUpdate{}, false
	}
	return update, true
}

// parseOrganizationUserStatus 解析并校验成员状态编辑负载；未知字段与尾随内容视为非法。
func parseOrganizationUserStatus(w http.ResponseWriter, r *http.Request) (domain.UserStatusUpdate, bool) {
	var payload struct {
		Status int `json:"status"`
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, organizationBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || decoder.More() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserStatusUpdate{}, false
	}
	update := domain.UserStatusUpdate{Status: payload.Status}
	if !update.Validate() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserStatusUpdate{}, false
	}
	return update, true
}

// parseOrganizationUserRoles 解析并校验成员角色分配负载；未知字段与尾随内容视为非法。
func parseOrganizationUserRoles(w http.ResponseWriter, r *http.Request) (domain.UserRolesUpdate, bool) {
	var payload struct {
		RoleIDs []int64 `json:"role_ids"`
	}
	decoder := json.NewDecoder(io.LimitReader(r.Body, organizationBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil || decoder.More() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserRolesUpdate{}, false
	}
	update := domain.UserRolesUpdate{RoleIDs: payload.RoleIDs}
	if !update.Validate() {
		finishOrganization(w, r, nil, domain.ErrInvalid)
		return domain.UserRolesUpdate{}, false
	}
	return update, true
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
	var upstream *domain.UpstreamError
	switch {
	case err == nil:
	case errors.As(err, &upstream):
		// 上游已给出明确状态码与提示，原样透传给客户端。
		status, message = upstream.Status, upstream.Error()
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
