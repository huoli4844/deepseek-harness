// 本文件注册 Swagger 中定义的少仕供应商及其关联资源接口。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"

	"starpivot.local/deepseek-harness-backend/internal/supplier/application"
	"starpivot.local/deepseek-harness-backend/internal/supplier/domain"
)

const supplierPath = "/api/v1/apps/shaoshi"

type supplierHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

type supplierEnvelope struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// RegisterSuppliers 挂载 Swagger 中定义的供应商管理操作。
func RegisterSuppliers(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := supplierHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+supplierPath+"/suppliers", h.suppliers)
	mux.HandleFunc("POST "+supplierPath+"/suppliers", h.suppliers)
	mux.HandleFunc("PUT "+supplierPath+"/suppliers/{id}", h.item(domain.Supplier))
	mux.HandleFunc("DELETE "+supplierPath+"/suppliers/{id}", h.item(domain.Supplier))
	mux.HandleFunc("GET "+supplierPath+"/supplier-categories", h.categories)
	mux.HandleFunc("GET "+supplierPath+"/supplier-closure/{entity}", h.closure)
	mux.HandleFunc("POST "+supplierPath+"/supplier-closure/{entity}", h.closure)
	mux.HandleFunc("PUT "+supplierPath+"/supplier-closure/{entity}/{id}", h.closure)
	mux.HandleFunc("DELETE "+supplierPath+"/supplier-closure/{entity}/{id}", h.closure)
	registerSupplierChildren(mux, h)
}

func registerSupplierChildren(mux *http.ServeMux, h supplierHandler) {
	for _, child := range []struct {
		name string
		kind domain.Kind
	}{
		{name: "contacts", kind: domain.Contact},
		{name: "bank-accounts", kind: domain.BankAccount},
		{name: "qualifications", kind: domain.Qualification},
	} {
		mux.HandleFunc("GET "+supplierPath+"/suppliers/{id}/"+child.name, h.children(child.kind))
		mux.HandleFunc("POST "+supplierPath+"/suppliers/{id}/"+child.name, h.children(child.kind))
	}
	mux.HandleFunc("PUT "+supplierPath+"/supplier-contacts/{id}", h.item(domain.Contact))
	mux.HandleFunc("DELETE "+supplierPath+"/supplier-contacts/{id}", h.item(domain.Contact))
	mux.HandleFunc("PUT "+supplierPath+"/supplier-bank-accounts/{id}", h.item(domain.BankAccount))
	mux.HandleFunc("DELETE "+supplierPath+"/supplier-bank-accounts/{id}", h.item(domain.BankAccount))
	mux.HandleFunc("PUT "+supplierPath+"/supplier-qualifications/{id}", h.item(domain.Qualification))
	mux.HandleFunc("DELETE "+supplierPath+"/supplier-qualifications/{id}", h.item(domain.Qualification))
}

func (h supplierHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replySupplier(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replySupplier(w, r, http.StatusForbidden, "没有供应商管理写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h supplierHandler) suppliers(w http.ResponseWriter, r *http.Request) {
	write := r.Method == http.MethodPost
	access, ok := h.authorize(w, r, write)
	if !ok {
		return
	}
	if write {
		raw, err := decodeSupplierBody(w, r)
		if err != nil {
			finishSupplier(w, r, nil, err)
			return
		}
		data, err := h.service.Create(r.Context(), domain.Supplier, access.TenantID, access.UserID, 0, raw)
		finishSupplier(w, r, data, err)
		return
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	query, okQuery := archiveListQuery(r.URL.Query(), true)
	if !okPage || !okSize || !okQuery {
		finishSupplier(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.List(r.Context(), domain.Supplier, access.TenantID, 0, page, size, query)
	finishSupplier(w, r, data, err)
}

func (h supplierHandler) categories(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	data, err := h.service.Categories(r.Context(), access.TenantID)
	finishSupplier(w, r, data, err)
}

func (h supplierHandler) closure(w http.ResponseWriter, r *http.Request) {
	write := r.Method != http.MethodGet
	if _, ok := h.authorize(w, r, write); !ok {
		return
	}
	// Swagger 未定义 entity 的允许值，数据库也没有通用关闭记录表，暂不猜测落表。
	replySupplier(w, r, http.StatusNotImplemented, "供应商关闭记录的实体类型尚未配置", nil)
}

func (h supplierHandler) children(kind domain.Kind) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		write := r.Method == http.MethodPost
		access, ok := h.authorize(w, r, write)
		if !ok {
			return
		}
		parent, err := parseSupplierID(r.PathValue("id"))
		if err != nil {
			finishSupplier(w, r, nil, err)
			return
		}
		if write {
			raw, err := decodeSupplierBody(w, r)
			if err != nil {
				finishSupplier(w, r, nil, err)
				return
			}
			data, err := h.service.Create(r.Context(), kind, access.TenantID, access.UserID, parent, raw)
			finishSupplier(w, r, data, err)
			return
		}
		page, okPage := pageParam(r, "page", 1)
		size, okSize := pageParam(r, "page_size", 20)
		if !okPage || !okSize {
			finishSupplier(w, r, nil, domain.ErrInvalid)
			return
		}
		data, err := h.service.List(r.Context(), kind, access.TenantID, parent, page, size, archivequery.Query{})
		finishSupplier(w, r, data, err)
	}
}

func (h supplierHandler) item(kind domain.Kind) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		write := r.Method == http.MethodPut || r.Method == http.MethodDelete
		access, ok := h.authorize(w, r, write)
		if !ok {
			return
		}
		id, err := parseSupplierID(r.PathValue("id"))
		if err != nil {
			finishSupplier(w, r, nil, err)
			return
		}
		if r.Method == http.MethodDelete {
			data, err := h.service.Delete(r.Context(), kind, access.TenantID, id)
			finishSupplier(w, r, data, err)
			return
		}
		raw, err := decodeSupplierBody(w, r)
		if err != nil {
			finishSupplier(w, r, nil, err)
			return
		}
		data, err := h.service.Update(r.Context(), kind, access.TenantID, id, raw)
		finishSupplier(w, r, data, err)
	}
}

func parseSupplierID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0, domain.ErrInvalid
	}
	return id, nil
}

func decodeSupplierBody(w http.ResponseWriter, r *http.Request) (json.RawMessage, error) {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil || !json.Valid(raw) {
		return nil, domain.ErrInvalid
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, domain.ErrInvalid
	}
	return raw, nil
}

func finishSupplier(w http.ResponseWriter, r *http.Request, data any, err error) {
	status, message := http.StatusOK, "成功"
	switch {
	case err == nil:
	case errors.Is(err, domain.ErrInvalid):
		status, message = http.StatusBadRequest, domain.ErrInvalid.Error()
	case errors.Is(err, domain.ErrNotFound):
		status, message = http.StatusNotFound, domain.ErrNotFound.Error()
	default:
		status, message = http.StatusInternalServerError, "供应商服务暂不可用"
		slog.ErrorContext(r.Context(), "供应商请求处理失败", "method", r.Method, "error_type", "database_or_internal")
	}
	replySupplier(w, r, status, message, data)
}

func replySupplier(w http.ResponseWriter, r *http.Request, status int, message string, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	code := status
	if status == http.StatusOK {
		code = 0
	} else {
		data = nil
	}
	if err := json.NewEncoder(w).Encode(supplierEnvelope{Code: code, Message: message, Data: data}); err != nil {
		slog.WarnContext(r.Context(), "供应商响应写入失败", "error_type", "encoding")
	}
}
