// Package domain 定义项目周报和工时汇总数据，不依赖传输或仓储。
package domain

import (
	"encoding/json"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalid 表示日期、项目编码、正文或可信身份无效。
	ErrInvalid = errors.New("周报参数无效")
	// ErrNotFound 表示当前租户未找到项目或待提交周报。
	ErrNotFound = errors.New("项目或周报不存在")
	// ErrLocked 表示已提交的周报不可修改。
	ErrLocked = errors.New("周报已提交，正文不可修改")
	// ErrIncomplete 表示必填正文尚有空白内容。
	ErrIncomplete = errors.New("请填写本周项目进展摘要、本周已完成工作和下周工作计划")
)

var codePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

// ValidProjectCode 校验少仕项目路径使用的编码。
func ValidProjectCode(code string) bool {
	return codePattern.MatchString(code)
}

// Week 区分自然周的开始和结束。它们是日期，写入 PostgreSQL DATE。
type Week struct {
	Start time.Time
	End   time.Time
}

// ParseWeek 校验周一起始日期，并推导同一自然周的周日。
func ParseWeek(value string) (Week, error) {
	start, err := time.Parse(time.DateOnly, value)
	if err != nil || start.Year() < 1 || start.Weekday() != time.Monday {
		return Week{}, ErrInvalid
	}
	end := start.AddDate(0, 0, 6)
	if end.Year() > 9999 {
		return Week{}, ErrInvalid
	}
	return Week{Start: start, End: end}, nil
}

// CurrentWeekStart 将当前时间在北京时间所在自然周的周一转为日期。
func CurrentWeekStart(now time.Time) string {
	local := now.In(time.FixedZone("UTC+08:00", 8*60*60))
	daysSinceMonday := (int(local.Weekday()) + 6) % 7
	return local.AddDate(0, 0, -daysSinceMonday).Format(time.DateOnly)
}

// Draft 只包含可编辑正文。
type Draft struct {
	ProgressSummary string  `json:"progress_summary"`
	CompletedWork   string  `json:"completed_work"`
	PlannedWork     string  `json:"planned_work"`
	IssuesAndRisks  *string `json:"issues_and_risks"`
	NeedSupport     *string `json:"need_support"`
}

// DraftInput 是保存与提交请求体：自然周周一日期加可编辑正文。
type DraftInput struct {
	PeriodStart string `json:"period_start"`
	Draft
}

// Validate 检查正文能否由 PostgreSQL UTF-8 文本列保存。
func (d Draft) Validate() error {
	for _, value := range []string{d.ProgressSummary, d.CompletedWork, d.PlannedWork} {
		if !validText(value) {
			return ErrInvalid
		}
	}
	for _, value := range []*string{d.IssuesAndRisks, d.NeedSupport} {
		if value != nil && !validText(*value) {
			return ErrInvalid
		}
	}
	return nil
}

// Complete 判断所有必填正文是否都具备可提交的内容。
func (d Draft) Complete() bool {
	return strings.TrimSpace(d.ProgressSummary) != "" &&
		strings.TrimSpace(d.CompletedWork) != "" &&
		strings.TrimSpace(d.PlannedWork) != ""
}

func validText(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0)
}

// RowProjectCodes 提取完成与计划正文中 JSON 行内引用的项目编码，去重排序后返回；
// 正文不是 JSON 数组时视为纯文本，不产生编码。
func (d Draft) RowProjectCodes() []string {
	codes := map[string]struct{}{}
	for _, value := range []string{d.CompletedWork, d.PlannedWork} {
		var rows []struct {
			ProjectCode string `json:"project_code"`
		}
		if json.Unmarshal([]byte(value), &rows) != nil {
			continue
		}
		for _, row := range rows {
			if row.ProjectCode != "" {
				codes[row.ProjectCode] = struct{}{}
			}
		}
	}
	result := make([]string, 0, len(codes))
	for code := range codes {
		result = append(result, code)
	}
	slices.Sort(result)
	return result
}

// Report 是单个租户的用户周报和服务端审计信息；项目关联保存在正文事项行内。
type Report struct {
	ID               int64  `json:"id"`
	BusinessTenantID int64  `json:"business_tenant_id"`
	PeriodStart      string `json:"period_start"`
	PeriodEnd        string `json:"period_end"`
	Draft
	Status      string     `json:"status"`
	CreatedBy   int64      `json:"created_by"`
	SubmittedBy *int64     `json:"submitted_by"`
	SubmittedAt *time.Time `json:"submitted_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// EmployeeHours 保留员工工时小数精度。
type EmployeeHours struct {
	UserID int64  `json:"user_id"`
	Hours  string `json:"hours"`
}

// LaborSummary 是自然周内当前已批准的工时。
type LaborSummary struct {
	TotalHours string          `json:"total_hours"`
	Employees  []EmployeeHours `json:"employees"`
}

// View 组合项目周报和同一项目自然周的实时工时汇总。
type View struct {
	Report *Report      `json:"report"`
	Labor  LaborSummary `json:"labor"`
}
