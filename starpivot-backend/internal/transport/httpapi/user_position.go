// 本文件注册用户任职 HTTP 接口，路径与线上 user-positions 模块保持一致。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"starpivot.local/deepseek-harness-backend/internal/userposition/application"
	"starpivot.local/deepseek-harness-backend/internal/userposition/domain"
)

const userPositionPath = "/api/v1/user-positions"

type userPositionHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterUserPositions 注册任职记录的查询、创建、更新与删除操作。
func RegisterUserPositions(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := userPositionHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+userPositionPath, h.list)
	mux.HandleFunc("POST "+userPositionPath, h.create)
	mux.HandleFunc("PUT "+userPositionPath+"/{id}", h.item)
	mux.HandleFunc("DELETE "+userPositionPath+"/{id}", h.item)
}

// authorize 校验可信身份；write 额外要求写权限。
func (h userPositionHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有任职写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h userPositionHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	values := r.URL.Query()
	mine := values.Get("mine")
	if len(values["user_id"]) > 1 || len(values["position_id"]) > 1 || len(values["mine"]) > 1 ||
		(mine != "" && mine != "1") {
		finishUserPosition(w, r, nil, domain.ErrInvalid)
		return
	}
	query := domain.ListQuery{
		UserID:     parseIDParam(values.Get("user_id")),
		PositionID: parseIDParam(values.Get("position_id")),
	}
	// 非法数字过滤值会被解析成 0，这里显式拒绝而不是当成不过滤。
	if (values.Get("user_id") != "" && query.UserID == 0) ||
		(values.Get("position_id") != "" && query.PositionID == 0) {
		finishUserPosition(w, r, nil, domain.ErrInvalid)
		return
	}
	if mine == "1" {
		query.UserID = access.UserID
	}
	data, err := h.service.List(r.Context(), access.TenantID, query)
	finishUserPosition(w, r, data, err)
}

func (h userPositionHandler) create(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeUserPosition(w, r)
	if err != nil {
		finishUserPosition(w, r, nil, err)
		return
	}
	data, err := h.service.Create(r.Context(), access.TenantID, draft)
	finishUserPosition(w, r, data, err)
}

func (h userPositionHandler) item(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishUserPosition(w, r, nil, domain.ErrInvalid)
		return
	}
	var data json.RawMessage
	switch r.Method {
	case http.MethodPut:
		var draft domain.Draft
		draft, err = decodeUserPosition(w, r)
		if err == nil {
			data, err = h.service.Update(r.Context(), access.TenantID, id, draft)
		}
	case http.MethodDelete:
		data, err = h.service.Delete(r.Context(), access.TenantID, id)
	}
	finishUserPosition(w, r, data, err)
}

func decodeUserPosition(w http.ResponseWriter, r *http.Request) (domain.Draft, error) {
	var draft domain.Draft
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&draft); err != nil {
		return draft, domain.ErrInvalid
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return draft, domain.ErrInvalid
	}
	return draft, nil
}

// finishUserPosition 统一映射任职域错误到 HTTP 状态码与响应信封。
func finishUserPosition(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyCustomer(w, r, http.StatusBadRequest, err.Error(), nil)
	case errors.Is(err, domain.ErrNotFound):
		replyCustomer(w, r, http.StatusNotFound, err.Error(), nil)
	case errors.Is(err, domain.ErrConflict):
		replyCustomer(w, r, http.StatusConflict, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "任职请求处理失败", "method", r.Method, "path", r.URL.Path)
		replyCustomer(w, r, http.StatusInternalServerError, "任职服务暂不可用", nil)
	}
}
