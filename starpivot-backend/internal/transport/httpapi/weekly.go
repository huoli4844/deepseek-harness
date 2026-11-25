// 本文件处理周报 HTTP 请求、可信身份和响应映射。
package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

const weeklyPath = "/api/v1/apps/deepseek-harness/projects/{code}/weekly-reports"

type weeklyHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterWeeklyReports 注册项目周报读取、草稿保存和提交接口。
func RegisterWeeklyReports(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := weeklyHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+weeklyPath, h.get)
	mux.HandleFunc("PUT "+weeklyPath, h.save)
	mux.HandleFunc("POST "+weeklyPath+"/submit", h.submit)
}

func (h weeklyHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyWeekly(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyWeekly(w, r, http.StatusForbidden, "没有项目周报写入权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h weeklyHandler) get(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	start, err := weeklyPeriodStart(r)
	if err != nil {
		finishWeekly(w, r, nil, err)
		return
	}
	view, err := h.service.Get(r.Context(), access.TenantID, r.PathValue("code"), start)
	finishWeekly(w, r, view, err)
}

func weeklyPeriodStart(r *http.Request) (string, error) {
	values, err := url.ParseQuery(r.URL.RawQuery)
	starts := values["period_start"]
	if err != nil || len(starts) > 1 {
		return "", domain.ErrInvalid
	}
	if len(starts) == 1 {
		return starts[0], nil
	}
	return domain.CurrentWeekStart(time.Now()), nil
}

type weeklyDraftInput struct {
	PeriodStart     string  `json:"period_start"`
	ProgressSummary *string `json:"progress_summary"`
	CompletedWork   *string `json:"completed_work"`
	PlannedWork     *string `json:"planned_work"`
	IssuesAndRisks  *string `json:"issues_and_risks"`
	NeedSupport     *string `json:"need_support"`
}

func (h weeklyHandler) save(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	var input weeklyDraftInput
	if err := decodeWeeklyInput(w, r, &input); err != nil ||
		input.ProgressSummary == nil || input.CompletedWork == nil || input.PlannedWork == nil {
		finishWeekly(w, r, domain.View{}, domain.ErrInvalid)
		return
	}
	draft := domain.Draft{
		ProgressSummary: *input.ProgressSummary, CompletedWork: *input.CompletedWork, PlannedWork: *input.PlannedWork,
		IssuesAndRisks: input.IssuesAndRisks, NeedSupport: input.NeedSupport,
	}
	view, err := h.service.Save(r.Context(), access.TenantID, access.UserID, r.PathValue("code"), input.PeriodStart, draft)
	finishWeekly(w, r, view, err)
}

func (h weeklyHandler) submit(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	var input struct {
		PeriodStart string `json:"period_start"`
	}
	if err := decodeWeeklyInput(w, r, &input); err != nil {
		finishWeekly(w, r, domain.View{}, err)
		return
	}
	view, err := h.service.Submit(r.Context(), access.TenantID, access.UserID, r.PathValue("code"), input.PeriodStart)
	finishWeekly(w, r, view, err)
}

func decodeWeeklyInput(w http.ResponseWriter, r *http.Request, input any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 512<<10))
	decoder.DisallowUnknownFields()
	var trailing json.RawMessage
	if err := decoder.Decode(input); err != nil || !errors.Is(decoder.Decode(&trailing), io.EOF) {
		return domain.ErrInvalid
	}
	return nil
}

func finishWeekly(w http.ResponseWriter, r *http.Request, view any, err error) {
	switch {
	case err == nil:
		replyWeekly(w, r, http.StatusOK, "成功", view)
	case errors.Is(err, domain.ErrInvalid), errors.Is(err, domain.ErrIncomplete):
		replyWeekly(w, r, http.StatusBadRequest, err.Error(), nil)
	case errors.Is(err, domain.ErrNotFound):
		replyWeekly(w, r, http.StatusNotFound, domain.ErrNotFound.Error(), nil)
	case errors.Is(err, domain.ErrLocked):
		replyWeekly(w, r, http.StatusConflict, domain.ErrLocked.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "项目周报请求处理失败", "method", r.Method, "error_type", fmt.Sprintf("%T", err))
		replyWeekly(w, r, http.StatusInternalServerError, "项目周报服务暂不可用", nil)
	}
}

func replyWeekly(w http.ResponseWriter, r *http.Request, status int, message string, view any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	code := status
	if status == http.StatusOK {
		code = 0
	}
	payload := struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    any    `json:"data"`
	}{Code: code, Message: message, Data: view}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.WarnContext(r.Context(), "项目周报响应写入失败")
	}
}
