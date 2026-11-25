// Package domain 定义项目工时数据和输入校验，不依赖传输与存储。
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/projectwork"
)

// ErrInvalid 表示输入不符合项目工时约定。
var ErrInvalid = errors.New("工时参数无效")

// ErrNotFound 表示当前租户或填报人范围内没有对应记录。
var ErrNotFound = errors.New("项目、任务或工时记录不存在")

// ErrConflict 表示记录当前状态不允许编辑或提交。
var ErrConflict = errors.New("当前工时状态不允许此操作")

var (
	projectCode  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	hoursPattern = regexp.MustCompile(`^[0-9]{1,3}(\.[0-9]{1,2})?$`)
	sorts        = map[string]bool{
		"id": true, "project_id": true, "user_id": true, "task_id": true, "work_date": true,
		"hours": true, "work_type": true, "description": true, "status": true, "created_at": true,
		"updated_at": true, "submitted_at": true, "approved_at": true, "approved_by": true,
		"completion_status": true,
	}
)

// Actor 是经过服务端鉴权的用户和租户。
type Actor struct {
	TenantID int64
	UserID   int64
	CanWrite bool
}

// Project 是项目选择器所需的租户内项目摘要。
type Project struct {
	ID   int64  `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

// ProjectPage 是项目选择器的分页响应。
type ProjectPage struct {
	Items    []Project `json:"items"`
	Total    int64     `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"page_size"`
}

// Task 是项目任务选择器使用的摘要。
type Task struct {
	ID     int64  `json:"id"`
	Code   string `json:"code"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

// TaskPage 是项目任务选择器的分页响应。
type TaskPage struct {
	Items    []Task `json:"items"`
	Total    int64  `json:"total"`
	Page     int    `json:"page"`
	PageSize int    `json:"page_size"`
}

// Record 包含工时记录与当前用户的行级操作权限。
type Record struct {
	ID               int64      `json:"id"`
	UserID           int64      `json:"user_id"`
	ProjectID        int64      `json:"project_id"`
	TaskID           *int64     `json:"task_id"`
	WorkDate         *string    `json:"work_date"`
	Hours            string     `json:"hours"`
	WorkType         string     `json:"work_type"`
	Description      string     `json:"description"`
	Status           string     `json:"status"`
	CompletionStatus *string    `json:"completion_status"`
	SubmittedAt      *time.Time `json:"submitted_at"`
	ApprovedAt       *time.Time `json:"approved_at"`
	ApprovedBy       *int64     `json:"approved_by"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	CanEdit          bool       `json:"can_edit"`
	CanSubmit        bool       `json:"can_submit"`
}

// SetPermissions 根据服务端身份和记录状态赋予行级操作权限。
func (r *Record) SetPermissions(actor Actor) {
	owner := actor.CanWrite && actor.UserID > 0 && actor.UserID == r.UserID
	r.CanEdit = owner && (r.Status == "draft" || r.Status == "rejected")
	r.CanSubmit = owner && r.Status == "draft"
}

// Page 是相同项目和访问范围下的分页响应。
type Page struct {
	Items        []Record `json:"items"`
	Total        int64    `json:"total"`
	ArchiveTotal int64    `json:"archive_total"`
	Page         int      `json:"page"`
	PageSize     int      `json:"page_size"`
}

// ListQuery 是工时筛选、排序和分页参数。
type ListQuery struct {
	Page, PageSize   int
	DateFrom, DateTo string
	Status           string
	UserID           int64
	SortBy, SortDir  string
}

// Validate 保证工时查询参数可以按白名单和日期范围使用。
func (q ListQuery) Validate() error {
	if !ValidPage(q.Page, q.PageSize) || q.UserID < 0 ||
		(q.DateFrom != "" && !validDate(q.DateFrom)) || (q.DateTo != "" && !validDate(q.DateTo)) ||
		(q.DateFrom != "" && q.DateTo != "" && q.DateFrom > q.DateTo) {
		return ErrInvalid
	}
	switch q.Status {
	case "", "draft", "submitted", "approved", "rejected":
	default:
		return ErrInvalid
	}
	if q.SortBy == "" && q.SortDir == "" {
		return nil
	}
	if !sorts[q.SortBy] || (q.SortDir != "asc" && q.SortDir != "desc") {
		return ErrInvalid
	}
	return nil
}

// Draft 是新增或更新工时时接受的业务字段。
type Draft struct {
	TaskID           *int64  `json:"task_id"`
	WorkDate         string  `json:"work_date"`
	Hours            string  `json:"hours"`
	WorkType         string  `json:"work_type"`
	Description      string  `json:"description"`
	CompletionStatus *string `json:"completion_status"`
}

// Validate 校验日期、数值精度和可填报的工时类型。
func (d Draft) Validate() error {
	if (d.TaskID != nil && *d.TaskID <= 0) || !validDate(d.WorkDate) ||
		!hoursPattern.MatchString(d.Hours) || strings.Trim(d.Hours, "0.") == "" ||
		!ValidText(d.Description, 12000) || !projectwork.ValidWorkType(d.WorkType) ||
		(d.CompletionStatus != nil && !projectwork.ValidCompletionStatus(*d.CompletionStatus)) {
		return ErrInvalid
	}
	return nil
}

// ValidProjectCode 校验可用于定位项目的业务编码。
func ValidProjectCode(s string) bool { return projectCode.MatchString(s) }

// ValidPage 限定列表页数和单页大小。
func ValidPage(page, size int) bool {
	return page >= 1 && page <= 1_000_000 && size >= 1 && size <= 200
}

// ValidText 保证 UTF-8 内容可安全写入 PostgreSQL 并限制字符数。
func ValidText(s string, limit int) bool {
	return utf8.ValidString(s) && utf8.RuneCountInString(s) <= limit && !strings.ContainsRune(s, 0)
}

func validDate(date string) bool {
	t, err := time.Parse(time.DateOnly, date)
	return err == nil && t.Year() >= 1 && t.Format(time.DateOnly) == date
}
