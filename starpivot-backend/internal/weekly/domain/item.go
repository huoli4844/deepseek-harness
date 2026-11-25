// 本文件定义个人周报登记数据和字段校验。
package domain

import (
	"strings"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/projectwork"
)

// ItemDraft 是当前填报人可编辑的登记字段。
type ItemDraft struct {
	ProjectCode      string  `json:"project_code"`
	TaskID           int64   `json:"task_id"`
	WorkType         string  `json:"work_type"`
	CompletionStatus string  `json:"completion_status"`
	HasRisk          bool    `json:"has_risk"`
	RiskDetails      *string `json:"risk_details"`
}

// Normalize 校验登记枚举并合并空风险说明与未填写状态。
func (item ItemDraft) Normalize() (ItemDraft, error) {
	if !ValidProjectCode(item.ProjectCode) || item.TaskID <= 0 ||
		!projectwork.ValidWorkType(item.WorkType) || !projectwork.ValidCompletionStatus(item.CompletionStatus) {
		return ItemDraft{}, ErrInvalid
	}
	if item.RiskDetails != nil {
		details := strings.TrimSpace(*item.RiskDetails)
		if !validText(details) || utf8.RuneCountInString(details) > 4000 || (!item.HasRisk && details != "") {
			return ItemDraft{}, ErrInvalid
		}
		item.RiskDetails = nil
		if details != "" {
			item.RiskDetails = &details
		}
	}
	return item, nil
}

// Item 包含服务端生成的明细及项目周报状态。
type Item struct {
	ID           int64  `json:"id"`
	ReportID     int64  `json:"report_id"`
	ReportStatus string `json:"report_status"`
	ProjectName  string `json:"project_name"`
	TaskName     string `json:"task_name"`
	ItemDraft
}

// Workspace 包含当前填报人的自然周登记。
type Workspace struct {
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	Items       []Item `json:"items"`
}
