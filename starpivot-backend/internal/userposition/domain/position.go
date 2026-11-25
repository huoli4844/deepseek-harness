// Package domain 定义用户任职记录的字段约束与查询条件，不依赖传输和持久化层。
package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalid 表示任职记录字段或查询参数不符合约束。
	ErrInvalid = errors.New("任职记录字段或查询参数无效")
	// ErrNotFound 表示当前租户没有该任职记录。
	ErrNotFound = errors.New("任职记录不存在")
	// ErrConflict 表示任职引用的岗位、用户或项目不存在。
	ErrConflict = errors.New("任职引用的岗位、用户或项目不存在")
)

// Draft 是任职记录的可编辑字段；日期按 YYYY-MM-DD 文本、可留空。
type Draft struct {
	UserID        int64   `json:"user_id"`
	PositionID    int64   `json:"position_id"`
	ProjectID     *int64  `json:"project_id"`
	RoleInProject string  `json:"role_in_project"`
	StartDate     *string `json:"start_date"`
	EndDate       *string `json:"end_date"`
	IsPrimary     bool    `json:"is_primary"`
	Status        int16   `json:"status"`
}

// Normalize 校验引用 ID、职能角色文本与起止日期顺序；状态默认 1 表示在任。
func (d Draft) Normalize() (Draft, error) {
	d.RoleInProject = strings.TrimSpace(d.RoleInProject)
	if d.UserID <= 0 || d.PositionID <= 0 || d.RoleInProject == "" ||
		!validText(d.RoleInProject, 100) || d.Status < 0 || d.Status > 9 {
		return Draft{}, ErrInvalid
	}
	if d.Status == 0 {
		d.Status = 1
	}
	if d.ProjectID != nil && *d.ProjectID <= 0 {
		return Draft{}, ErrInvalid
	}
	for _, date := range []**string{&d.StartDate, &d.EndDate} {
		if *date == nil {
			continue
		}
		trimmed := strings.TrimSpace(**date)
		if trimmed == "" {
			*date = nil
			continue
		}
		parsed, err := time.Parse(time.DateOnly, trimmed)
		if err != nil || parsed.Year() < 2000 {
			return Draft{}, ErrInvalid
		}
		**date = trimmed
	}
	if d.StartDate != nil && d.EndDate != nil && *d.EndDate < *d.StartDate {
		return Draft{}, ErrInvalid
	}
	return d, nil
}

// ListQuery 描述任职列表的用户、岗位过滤条件。
type ListQuery struct {
	UserID     int64
	PositionID int64
}

// Valid 检查过滤 ID 取值。
func (q ListQuery) Valid() bool {
	return q.UserID >= 0 && q.PositionID >= 0
}

// Page 包装任职记录列表，字段与线上 user-positions 语义对齐。
type Page struct {
	Items []json.RawMessage `json:"items"`
}

func validText(value string, limit int) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= limit
}
