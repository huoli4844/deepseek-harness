// 本文件把少仕客户 HTTP 路由映射到客户用例，不执行数据库操作。
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"starpivot.local/deepseek-harness-backend/internal/customer/application"
	"starpivot.local/deepseek-harness-backend/internal/customer/domain"
)

const customerPath = "/api/v1/apps/shaoshi/customers"

type customerHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

type customerEnvelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// RegisterCustomers 挂载已有 Swagger 方法及新增的详情读取。
func RegisterCustomers(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := customerHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+customerPath, h.list)
	mux.HandleFunc("POST "+customerPath, h.create)
	mux.HandleFunc("GET "+customerPath+"/{id}", h.item)
	mux.HandleFunc("PUT "+customerPath+"/{id}", h.item)
	mux.HandleFunc("DELETE "+customerPath+"/{id}", h.item)
}

func (h customerHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有客户资源写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h customerHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	query, okQuery := archiveListQuery(r.URL.Query(), false)
	if !okPage || !okSize || !okQuery {
		finishCustomer(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.List(r.Context(), access.TenantID, page, size, query)
	finishCustomer(w, r, data, err)
}

func pageParam(r *http.Request, name string, fallback int) (int, bool) {
	values, present := r.URL.Query()[name]
	if !present {
		return fallback, true
	}
	if len(values) != 1 {
		return 0, false
	}
	n, err := strconv.Atoi(values[0])
	return n, err == nil
}

func (h customerHandler) create(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeDraft(w, r)
	if err != nil {
		finishCustomer(w, r, nil, err)
		return
	}
	data, err := h.service.Create(r.Context(), access.TenantID, access.UserID, draft)
	finishCustomer(w, r, data, err)
}

func (h customerHandler) item(w http.ResponseWriter, r *http.Request) {
	write := r.Method == http.MethodPut || r.Method == http.MethodDelete
	access, ok := h.authorize(w, r, write)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishCustomer(w, r, nil, domain.ErrInvalid)
		return
	}
	var data domain.Customer
	switch r.Method {
	case http.MethodPut:
		var draft domain.Draft
		draft, err = decodeDraft(w, r)
		if err == nil {
			data, err = h.service.Update(r.Context(), access.TenantID, id, draft)
		}
	case http.MethodDelete:
		data, err = h.service.Delete(r.Context(), access.TenantID, id)
	default:
		data, err = h.service.Get(r.Context(), access.TenantID, id)
	}
	finishCustomer(w, r, data, err)
}

func decodeDraft(w http.ResponseWriter, r *http.Request) (domain.Draft, error) {
	var d domain.Draft
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&d); err != nil {
		return d, domain.ErrInvalid
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return d, domain.ErrInvalid
	}
	return d, nil
}

func finishCustomer(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyCustomer(w, r, http.StatusBadRequest, domain.ErrInvalid.Error(), nil)
	case errors.Is(err, domain.ErrNotFound):
		replyCustomer(w, r, http.StatusNotFound, domain.ErrNotFound.Error(), nil)
	case errors.Is(err, domain.ErrConflict):
		replyCustomer(w, r, http.StatusConflict, domain.ErrConflict.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "客户请求处理失败", "method", r.Method, "error_type", fmt.Sprintf("%T", err))
		replyCustomer(w, r, http.StatusInternalServerError, "客户服务暂不可用", nil)
	}
}

func replyCustomer(w http.ResponseWriter, r *http.Request, status int, message string, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	code := status
	if status == http.StatusOK {
		code = 0
	}
	if err := json.NewEncoder(w).Encode(customerEnvelope{Code: code, Message: message, Data: data}); err != nil {
		slog.WarnContext(r.Context(), "客户响应写入失败")
	}
}
