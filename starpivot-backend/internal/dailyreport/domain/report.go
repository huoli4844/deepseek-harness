// Package domain 定义本人工作日报契约与校验，不依赖 HTTP、数据库或模型。
package domain

import (
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// ErrInvalid 表示日期、字段或请求标识不合法。
var ErrInvalid = errors.New("日报字段不合法")

// ErrConflict 表示草稿版本已变更、已提交或请求标识被复用。
var ErrConflict = errors.New("日报已变更或已提交，请重新读取")

// Evidence 只保存出处引用，不赋予调用方访问该会话的权限。
type Evidence struct {
	SessionID string `json:"session_id"`
	Seq       int64  `json:"seq"`
}

// Content 是允许人工确认的正文白名单。
type Content struct {
	CompletedWork  string     `json:"completed_work"`
	InProgressWork string     `json:"in_progress_work"`
	PlannedWork    string     `json:"planned_work"`
	IssuesAndRisks string     `json:"issues_and_risks"`
	NeedSupport    string     `json:"need_support"`
	EvidenceRefs   []Evidence `json:"evidence_refs"`
}

// Input 不接受身份、审计时间或任意业务接口地址。
type Input struct {
	Content
	ExpectedVersion int64  `json:"expected_version"`
	Status          string `json:"status"`
	RequestID       string `json:"request_id"`
}

// Report 是当前用户指定业务日期的日报。
type Report struct {
	Content
	ID          int64      `json:"id"`
	WorkDate    string     `json:"work_date"`
	Status      string     `json:"status"`
	Version     int64      `json:"version"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	SubmittedAt *time.Time `json:"submitted_at"`
}

var uuid = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var sourceID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

// ParseDate 只接受完整业务日期，不做设备时区转换。
func ParseDate(value string) (time.Time, error) {
	date, err := time.Parse("2006-01-02", value)
	if err != nil || date.Format("2006-01-02") != value {
		return time.Time{}, ErrInvalid
	}
	return date, nil
}

// Validate 与表单契约保持一致，提交至少填写一项实际工作。
func (i Input) Validate() error {
	if i.ExpectedVersion < 0 || !uuid.MatchString(i.RequestID) || (i.Status != "draft" && i.Status != "submitted") {
		return ErrInvalid
	}
	for _, value := range []string{i.CompletedWork, i.InProgressWork, i.PlannedWork, i.IssuesAndRisks, i.NeedSupport} {
		if !utf8.ValidString(value) || utf8.RuneCountInString(value) > 10000 || strings.ContainsRune(value, 0) {
			return ErrInvalid
		}
	}
	if i.Status == "submitted" && strings.TrimSpace(i.CompletedWork+i.InProgressWork) == "" {
		return ErrInvalid
	}
	if len(i.EvidenceRefs) > 100 {
		return ErrInvalid
	}
	for _, ref := range i.EvidenceRefs {
		if !sourceID.MatchString(ref.SessionID) || ref.Seq < 0 {
			return ErrInvalid
		}
	}
	return nil
}
