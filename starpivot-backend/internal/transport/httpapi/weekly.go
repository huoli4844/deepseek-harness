// 本文件注册周报查询、保存与提交接口；周报按用户每周一份，需可信用户身份。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	weeklydomain "starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

const weeklyPath = "/api/v1/apps/deepseek-harness/weekly-reports"

type weeklyHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterWeeklyReports 注册本人周报的读取、保存与提交操作。
func RegisterWeeklyReports(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	handler := weeklyHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+weeklyPath, handler.get)
	mux.HandleFunc("PUT "+weeklyPath, handler.put)
	mux.HandleFunc("POST "+weeklyPath+"/submit", handler.submit)
}

// authorize 校验可信身份；写入与提交额外要求登录用户与写权限。
func (h weeklyHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || access.UserID <= 0 {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有周报写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h weeklyHandler) get(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	view, err := h.service.Get(r.Context(), access.TenantID, access.UserID,
		r.URL.Query().Get("period_start"))
	finishWeekly(w, r, view, err)
}

func (h weeklyHandler) put(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeWeeklyDraft(w, r)
	if err != nil {
		finishWeekly(w, r, weeklydomain.View{}, err)
		return
	}
	view, err := h.service.Save(r.Context(), access.TenantID, access.UserID, draft.PeriodStart, draft.Draft)
	finishWeekly(w, r, view, err)
}

func (h weeklyHandler) submit(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeWeeklyDraft(w, r)
	if err != nil {
		finishWeekly(w, r, weeklydomain.View{}, err)
		return
	}
	view, err := h.service.Submit(r.Context(), access.TenantID, access.UserID, draft.PeriodStart)
	finishWeekly(w, r, view, err)
}

func decodeWeeklyDraft(w http.ResponseWriter, r *http.Request) (weeklydomain.DraftInput, error) {
	var draft weeklydomain.DraftInput
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&draft); err != nil {
		return weeklydomain.DraftInput{}, weeklydomain.ErrInvalid
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return weeklydomain.DraftInput{}, weeklydomain.ErrInvalid
	}
	return draft, nil
}

// finishWeekly 统一映射周报域错误到 HTTP 状态码与响应信封。
func finishWeekly(w http.ResponseWriter, r *http.Request, view weeklydomain.View, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, http.StatusOK, "成功", view)
	case errors.Is(err, weeklydomain.ErrInvalid):
		replyCustomer(w, r, http.StatusBadRequest, err.Error(), nil)
	case errors.Is(err, weeklydomain.ErrNotFound):
		replyCustomer(w, r, http.StatusNotFound, err.Error(), nil)
	case errors.Is(err, weeklydomain.ErrLocked), errors.Is(err, weeklydomain.ErrIncomplete):
		replyCustomer(w, r, http.StatusConflict, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "周报请求处理失败", "method", r.Method, "path", r.URL.Path)
		replyCustomer(w, r, http.StatusInternalServerError, "周报服务暂不可用", nil)
	}
}
