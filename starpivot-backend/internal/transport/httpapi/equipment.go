// 本文件注册设备台账 HTTP 接口，租户由现有可信网关机制确定。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/equipment/application"
	"starpivot.local/deepseek-harness-backend/internal/equipment/domain"
)

const equipmentPath = "/api/v1/apps/deepseek-harness/equipments"

type equipmentHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterEquipment 注册设备台账的集合与单项操作。
func RegisterEquipment(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := equipmentHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+equipmentPath, h.list)
	mux.HandleFunc("POST "+equipmentPath, h.create)
	mux.HandleFunc("GET "+equipmentPath+"/{id}", h.item)
	mux.HandleFunc("PUT "+equipmentPath+"/{id}", h.item)
	mux.HandleFunc("DELETE "+equipmentPath+"/{id}", h.item)
}

func (h equipmentHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有设备台账写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h equipmentHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	values := r.URL.Query()
	query := archivequery.Query{}
	fields := map[string]*string{
		"keyword": &query.Keyword, "sort_by": &query.SortBy, "sort_direction": &query.SortDirection,
	}
	for key, target := range fields {
		if len(values[key]) > 1 {
			finishEquipment(w, r, nil, domain.ErrInvalid)
			return
		}
		*target = strings.TrimSpace(values.Get(key))
	}
	if !okPage || !okSize {
		finishEquipment(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.List(r.Context(), access.TenantID, domain.ListQuery{Query: query, Page: page, PageSize: size})
	finishEquipment(w, r, data, err)
}

func (h equipmentHandler) create(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeEquipment(w, r)
	if err != nil {
		finishEquipment(w, r, nil, err)
		return
	}
	data, err := h.service.Create(r.Context(), access.TenantID, draft)
	finishEquipment(w, r, data, err)
}

func (h equipmentHandler) item(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, r.Method != http.MethodGet && r.Method != http.MethodHead)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishEquipment(w, r, nil, domain.ErrInvalid)
		return
	}
	var data json.RawMessage
	switch r.Method {
	case http.MethodPut:
		var draft domain.Draft
		draft, err = decodeEquipment(w, r)
		if err == nil {
			data, err = h.service.Update(r.Context(), access.TenantID, id, draft)
		}
	case http.MethodDelete:
		data, err = h.service.Delete(r.Context(), access.TenantID, id)
	default:
		data, err = h.service.Get(r.Context(), access.TenantID, id)
	}
	finishEquipment(w, r, data, err)
}

func decodeEquipment(w http.ResponseWriter, r *http.Request) (domain.Draft, error) {
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

func finishEquipment(w http.ResponseWriter, r *http.Request, data any, err error) {
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
		slog.ErrorContext(r.Context(), "设备台账请求处理失败", "method", r.Method, "path", r.URL.Path)
		replyCustomer(w, r, http.StatusInternalServerError, "设备台账暂不可用", nil)
	}
}
