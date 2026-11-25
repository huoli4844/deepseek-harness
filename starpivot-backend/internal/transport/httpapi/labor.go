// 本文件将项目选择与工时 HTTP 路由映射到用例层。
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/labor/application"
	"starpivot.local/deepseek-harness-backend/internal/labor/domain"
)

const projectsPath = "/api/v1/apps/shaoshi/projects"
const laborPath = projectsPath + "/{code}/labor-hours"

type laborHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterLabor 挂载项目选择、工时读取及本人填报操作。
func RegisterLabor(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := laborHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+projectsPath, h.projects)
	mux.HandleFunc("GET "+projectsPath+"/{code}/tasks", h.tasks)
	mux.HandleFunc("GET "+laborPath, h.list)
	mux.HandleFunc("POST "+laborPath, h.create)
	mux.HandleFunc("PUT "+laborPath+"/{id}", h.update)
	mux.HandleFunc("POST "+laborPath+"/{id}/submit", h.submit)
}

func (h laborHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (domain.Actor, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyLabor(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return domain.Actor{}, false
	}
	if write && !access.CanWrite {
		replyLabor(w, r, http.StatusForbidden, "没有工时填报写权限", nil)
		return domain.Actor{}, false
	}
	return domain.Actor{TenantID: access.TenantID, UserID: access.UserID, CanWrite: access.CanWrite}, true
}

func (h laborHandler) projects(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	values, err := laborParams(r, "keyword")
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	page, size, err := laborPageParams(r)
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	data, err := h.service.Projects(r.Context(), actor, values.Get("keyword"), page, size)
	finishLabor(w, r, data, err)
}

func (h laborHandler) list(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	query, err := laborQuery(r)
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	data, err := h.service.List(r.Context(), actor, r.PathValue("code"), query)
	finishLabor(w, r, data, err)
}

func (h laborHandler) tasks(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	values, err := laborParams(r, "keyword")
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	page, size, err := laborPageParams(r)
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	data, err := h.service.Tasks(r.Context(), actor, r.PathValue("code"), values.Get("keyword"), page, size)
	finishLabor(w, r, data, err)
}

func (h laborHandler) create(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeLaborDraft(w, r)
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	data, err := h.service.Create(r.Context(), actor, r.PathValue("code"), draft)
	finishLabor(w, r, data, err)
}

func (h laborHandler) update(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishLabor(w, r, nil, domain.ErrInvalid)
		return
	}
	draft, err := decodeLaborDraft(w, r)
	if err != nil {
		finishLabor(w, r, nil, err)
		return
	}
	data, err := h.service.Update(r.Context(), actor, r.PathValue("code"), id, draft)
	finishLabor(w, r, data, err)
}

func (h laborHandler) submit(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishLabor(w, r, nil, domain.ErrInvalid)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1024))
	if err != nil || strings.TrimSpace(string(body)) != "" {
		finishLabor(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.Submit(r.Context(), actor, r.PathValue("code"), id)
	finishLabor(w, r, data, err)
}

func laborPageParams(r *http.Request) (int, int, error) {
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	if !okPage || !okSize {
		return 0, 0, domain.ErrInvalid
	}
	return page, size, nil
}

func laborParams(r *http.Request, keys ...string) (url.Values, error) {
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

func laborQuery(r *http.Request) (domain.ListQuery, error) {
	values, err := laborParams(r, "date_from", "date_to", "status", "user_id", "sort_by", "sort_dir")
	if err != nil {
		return domain.ListQuery{}, err
	}
	page, size, err := laborPageParams(r)
	if err != nil {
		return domain.ListQuery{}, err
	}
	query := domain.ListQuery{Page: page, PageSize: size, DateFrom: values.Get("date_from"),
		DateTo: values.Get("date_to"), Status: values.Get("status"), SortBy: values.Get("sort_by"),
		SortDir: values.Get("sort_dir")}
	if values.Has("user_id") {
		query.UserID, err = strconv.ParseInt(values.Get("user_id"), 10, 64)
		if err != nil || query.UserID <= 0 {
			return domain.ListQuery{}, domain.ErrInvalid
		}
	}
	return query, nil
}

func decodeLaborDraft(w http.ResponseWriter, r *http.Request) (domain.Draft, error) {
	var body struct {
		TaskID           *int64      `json:"task_id"`
		WorkDate         string      `json:"work_date"`
		Hours            json.Number `json:"hours"`
		WorkType         string      `json:"work_type"`
		Description      string      `json:"description"`
		CompletionStatus *string     `json:"completion_status"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	var trailing json.RawMessage
	if err := dec.Decode(&body); err != nil || !errors.Is(dec.Decode(&trailing), io.EOF) {
		return domain.Draft{}, domain.ErrInvalid
	}
	return domain.Draft{TaskID: body.TaskID, WorkDate: body.WorkDate, Hours: body.Hours.String(),
		WorkType: body.WorkType, Description: body.Description, CompletionStatus: body.CompletionStatus}, nil
}

func finishLabor(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyLabor(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyLabor(w, r, http.StatusBadRequest, domain.ErrInvalid.Error(), nil)
	case errors.Is(err, domain.ErrNotFound):
		replyLabor(w, r, http.StatusNotFound, domain.ErrNotFound.Error(), nil)
	case errors.Is(err, domain.ErrConflict):
		replyLabor(w, r, http.StatusConflict, domain.ErrConflict.Error(), nil)
	case errors.Is(err, context.Canceled):
		// 客户端切页或退出会取消在途请求，此时数据库查询必然中断，不属于服务端故障。
		slog.WarnContext(r.Context(), "项目工时请求被客户端取消", "method", r.Method, "path", r.URL.Path)
	default:
		slog.ErrorContext(r.Context(), "项目工时请求处理失败", "method", r.Method, "error_type", fmt.Sprintf("%T", err))
		replyLabor(w, r, http.StatusInternalServerError, "项目工时服务暂不可用", nil)
	}
}

func replyLabor(w http.ResponseWriter, r *http.Request, status int, message string, data any) {
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
		slog.WarnContext(r.Context(), "项目工时响应写入失败")
	}
}
