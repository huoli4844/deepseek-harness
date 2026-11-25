// 本文件注册本人日报协议；不读取其他用户，不执行模型提供的地址或 SQL。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/application"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
)

const dailyPath = "/api/v1/apps/deepseek-harness/daily-reports"

type dailyHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterDailyReports 注册白名单表单契约、本人读取和原子保存接口。
func RegisterDailyReports(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := dailyHandler{service, auth}
	mux.HandleFunc("GET "+dailyPath+"/schema", h.schema)
	mux.HandleFunc("GET "+dailyPath+"/{date}", h.get)
	mux.HandleFunc("PUT "+dailyPath+"/{date}", h.put)
}

func (h dailyHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	a, ok := h.auth.AuthorizeCustomer(r)
	if !ok || a.UserID <= 0 || a.TenantID <= 0 {
		replyCustomer(w, r, 401, "请登录后使用日报", nil)
		return CustomerAccess{}, false
	}
	if write && !a.CanWrite {
		replyCustomer(w, r, 403, "没有日报写权限", nil)
		return CustomerAccess{}, false
	}
	return a, true
}

func (h dailyHandler) schema(w http.ResponseWriter, r *http.Request) {
	a, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	fields := []string{"completed_work", "in_progress_work", "planned_work", "issues_and_risks", "need_support"}
	replyCustomer(w, r, 200, "成功", map[string]any{"schema_id": "daily-report.v1", "user_id": a.UserID,
		"business_tenant_id": a.TenantID, "timezone": "Asia/Shanghai", "fields": fields, "max_length": 10000,
		"statuses": []string{"draft", "submitted"}, "can_write": a.CanWrite})
}

func (h dailyHandler) get(w http.ResponseWriter, r *http.Request) {
	a, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	report, err := h.service.Get(r.Context(), a.TenantID, a.UserID, r.PathValue("date"))
	finishDaily(w, r, report, err)
}

func (h dailyHandler) put(w http.ResponseWriter, r *http.Request) {
	a, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	var input domain.Input
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 256<<10))
	d.DisallowUnknownFields()
	err := d.Decode(&input)
	if err == nil {
		var extra json.RawMessage
		if !errors.Is(d.Decode(&extra), io.EOF) {
			err = domain.ErrInvalid
		}
	}
	if err != nil {
		finishDaily(w, r, nil, domain.ErrInvalid)
		return
	}
	report, err := h.service.Save(r.Context(), a.TenantID, a.UserID, r.PathValue("date"), input)
	finishDaily(w, r, report, err)
}

func finishDaily(w http.ResponseWriter, r *http.Request, report *domain.Report, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, 200, "成功", map[string]any{"report": report})
	case errors.Is(err, domain.ErrInvalid):
		replyCustomer(w, r, 400, err.Error(), nil)
	case errors.Is(err, domain.ErrConflict):
		replyCustomer(w, r, 409, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "日报请求失败", "method", r.Method, "error", err)
		replyCustomer(w, r, 503, "日报服务暂不可用，请稍后重试", nil)
	}
}
