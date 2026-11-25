// 本文件将少仕物料路由映射到物料用例，不执行数据库操作。
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"

	"starpivot.local/deepseek-harness-backend/internal/material/application"
	"starpivot.local/deepseek-harness-backend/internal/material/domain"
)

const materialPath = "/api/v1/apps/shaoshi/materials"
const materialCategoryPath = "/api/v1/apps/shaoshi/material-categories"

type materialHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterMaterials 挂载物料查询、更新、软删除及分类查询、创建接口。
func RegisterMaterials(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := materialHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+materialPath, h.list)
	mux.HandleFunc("PUT "+materialPath+"/{id}", h.updateMaterial)
	mux.HandleFunc("DELETE "+materialPath+"/{id}", h.deleteMaterial)
	mux.HandleFunc("GET "+materialCategoryPath, h.categories)
	mux.HandleFunc("POST "+materialCategoryPath, h.createCategory)
}

func (h materialHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (int64, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyMaterial(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return 0, false
	}
	if write && !access.CanWrite {
		replyMaterial(w, r, http.StatusForbidden, "没有物料写入权限", nil)
		return 0, false
	}
	return access.TenantID, true
}

func (h materialHandler) updateMaterial(w http.ResponseWriter, r *http.Request) {
	tenant, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := materialID(r)
	if err != nil {
		finishMaterial(w, r, nil, domain.ErrInvalid)
		return
	}
	var draft domain.MaterialDraft
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	var trailing json.RawMessage
	if err := dec.Decode(&draft); err != nil || !errors.Is(dec.Decode(&trailing), io.EOF) {
		finishMaterial(w, r, nil, domain.ErrInvalid)
		return
	}
	if err := h.service.UpdateMaterial(r.Context(), tenant, id, draft); err != nil {
		finishMaterial(w, r, nil, err)
		return
	}
	replyMaterial(w, r, http.StatusOK, "成功", struct {
		ID int64 `json:"id"`
	}{ID: id})
}

func (h materialHandler) deleteMaterial(w http.ResponseWriter, r *http.Request) {
	tenant, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := materialID(r)
	if err != nil {
		finishMaterial(w, r, nil, domain.ErrInvalid)
		return
	}
	if err := h.service.DeleteMaterial(r.Context(), tenant, id); err != nil {
		finishMaterial(w, r, nil, err)
		return
	}
	replyMaterial(w, r, http.StatusOK, "成功", struct {
		ID int64 `json:"id"`
	}{ID: id})
}

func materialID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, domain.ErrInvalid
	}
	return id, nil
}

func materialParams(r *http.Request, keys ...string) (url.Values, error) {
	values, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return nil, domain.ErrInvalid
	}
	for _, key := range keys {
		if len(values[key]) > 1 {
			return nil, domain.ErrInvalid
		}
	}
	return values, nil
}

func parseMaterialList(r *http.Request) (domain.ListQuery, error) {
	values, err := materialParams(r, "category_id", "code", "name", "material_type", "critical_level", "sort_by", "sort_dir")
	if err != nil {
		return domain.ListQuery{}, err
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	if !okPage || !okSize {
		return domain.ListQuery{}, domain.ErrInvalid
	}
	query := domain.ListQuery{
		Page: page, PageSize: size, Code: values.Get("code"), Name: values.Get("name"),
		MaterialType: values.Get("material_type"), CriticalLevel: values.Get("critical_level"),
		SortBy: values.Get("sort_by"), SortDir: values.Get("sort_dir"),
	}
	if values.Has("category_id") {
		query.CategoryID, err = strconv.ParseInt(values.Get("category_id"), 10, 64)
		if err != nil || query.CategoryID <= 0 {
			return domain.ListQuery{}, domain.ErrInvalid
		}
	}
	return query, nil
}

func (h materialHandler) list(w http.ResponseWriter, r *http.Request) {
	tenant, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	query, err := parseMaterialList(r)
	if err != nil {
		finishMaterial(w, r, nil, err)
		return
	}
	data, err := h.service.List(r.Context(), tenant, query)
	finishMaterial(w, r, data, err)
}

func (h materialHandler) categories(w http.ResponseWriter, r *http.Request) {
	tenant, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	values, err := materialParams(r, "keyword")
	if err != nil {
		finishMaterial(w, r, nil, err)
		return
	}
	items, err := h.service.Categories(r.Context(), tenant, values.Get("keyword"))
	finishMaterial(w, r, struct {
		Items []domain.Category `json:"items"`
	}{Items: items}, err)
}

func (h materialHandler) createCategory(w http.ResponseWriter, r *http.Request) {
	tenant, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	var draft domain.CategoryDraft
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	dec.DisallowUnknownFields()
	var trailing json.RawMessage
	if err := dec.Decode(&draft); err != nil || !errors.Is(dec.Decode(&trailing), io.EOF) {
		finishMaterial(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.CreateCategory(r.Context(), tenant, draft)
	finishMaterial(w, r, data, err)
}

func finishMaterial(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyMaterial(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyMaterial(w, r, http.StatusBadRequest, domain.ErrInvalid.Error(), nil)
	case errors.Is(err, domain.ErrNotFound), errors.Is(err, domain.ErrMaterialNotFound):
		replyMaterial(w, r, http.StatusNotFound, err.Error(), nil)
	case errors.Is(err, domain.ErrConflict), errors.Is(err, domain.ErrMaterialConflict):
		replyMaterial(w, r, http.StatusConflict, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "物料请求处理失败", "method", r.Method, "error_type", fmt.Sprintf("%T", err))
		replyMaterial(w, r, http.StatusInternalServerError, "物料服务暂不可用", nil)
	}
}

func replyMaterial(w http.ResponseWriter, r *http.Request, status int, message string, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	code := status
	if status == http.StatusOK {
		code = 0
	}
	if err := json.NewEncoder(w).Encode(struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    any    `json:"data"`
	}{Code: code, Message: message, Data: data}); err != nil {
		slog.WarnContext(r.Context(), "物料响应写入失败")
	}
}
