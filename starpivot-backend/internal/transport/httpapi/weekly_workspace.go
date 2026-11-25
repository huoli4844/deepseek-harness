// 本文件处理个人周报登记 HTTP 请求并验证可信用户身份。
package httpapi

import (
	"net/http"

	"starpivot.local/deepseek-harness-backend/internal/weekly/application"
	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

const weeklyWorkspacePath = "/api/v1/apps/deepseek-harness/weekly-reports"

type weeklyWorkspaceHandler struct {
	service *application.WorkspaceService
	auth    CustomerAuthorizer
}

// RegisterWeeklyWorkspace 注册本人周报登记查询和保存。
func RegisterWeeklyWorkspace(mux *http.ServeMux, service *application.WorkspaceService, auth CustomerAuthorizer) {
	h := weeklyWorkspaceHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+weeklyWorkspacePath, h.get)
	mux.HandleFunc("PUT "+weeklyWorkspacePath, h.save)
}

func (h weeklyWorkspaceHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || access.UserID <= 0 {
		replyWeekly(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyWeekly(w, r, http.StatusForbidden, "没有周报登记写入权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h weeklyWorkspaceHandler) get(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	start, err := weeklyPeriodStart(r)
	if err != nil {
		finishWeekly(w, r, nil, err)
		return
	}
	view, err := h.service.Get(r.Context(), access.TenantID, access.UserID, start)
	finishWeekly(w, r, view, err)
}

type weeklyItemInput struct {
	ProjectCode      string  `json:"project_code"`
	TaskID           int64   `json:"task_id"`
	WorkType         string  `json:"work_type"`
	CompletionStatus string  `json:"completion_status"`
	HasRisk          *bool   `json:"has_risk"`
	RiskDetails      *string `json:"risk_details"`
}

func (h weeklyWorkspaceHandler) save(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	var input struct {
		PeriodStart string            `json:"period_start"`
		Items       []weeklyItemInput `json:"items"`
	}
	if err := decodeWeeklyInput(w, r, &input); err != nil || input.Items == nil || len(input.Items) > 200 {
		finishWeekly(w, r, nil, domain.ErrInvalid)
		return
	}
	items := make([]domain.ItemDraft, len(input.Items))
	for index, item := range input.Items {
		if item.HasRisk == nil {
			finishWeekly(w, r, nil, domain.ErrInvalid)
			return
		}
		items[index] = domain.ItemDraft{
			ProjectCode: item.ProjectCode, TaskID: item.TaskID, WorkType: item.WorkType,
			CompletionStatus: item.CompletionStatus, HasRisk: *item.HasRisk, RiskDetails: item.RiskDetails,
		}
	}
	view, err := h.service.Save(r.Context(), access.TenantID, access.UserID, input.PeriodStart, items)
	finishWeekly(w, r, view, err)
}
