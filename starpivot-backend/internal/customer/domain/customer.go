// Package domain 定义客户数据和业务输入校验，不依赖 HTTP 或 PostgreSQL。
package domain

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalid 表示业务输入不符合字段要求。
	ErrInvalid = errors.New("客户参数无效")
	// ErrNotFound 表示当前租户没有可见的对应档案。
	ErrNotFound = errors.New("客户不存在")
	// ErrConflict 表示客户编码违反现有唯一约束。
	ErrConflict = errors.New("客户编码已存在")
)

var creditPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$`)

// Draft 是现有客户表单允许写入的字段，不包含系统审计字段。
type Draft struct {
	Code          string      `json:"code"`
	Name          string      `json:"name"`
	ShortName     string      `json:"short_name"`
	Industry      string      `json:"industry"`
	Level         string      `json:"level"`
	ContactPerson string      `json:"contact_person"`
	ContactPhone  string      `json:"contact_phone"`
	ContactEmail  string      `json:"contact_email"`
	Address       string      `json:"address"`
	CreditLimit   json.Number `json:"credit_limit"`
	Status        *int16      `json:"status"`
}

// Customer 包含业务字段和由服务端维护的审计信息。
type Customer struct {
	Draft
	ID         int64       `json:"id"`
	CreditUsed json.Number `json:"credit_used"`
	CreatedBy  int64       `json:"created_by"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
	IsDeleted  bool        `json:"is_deleted"`
	DeletedAt  *time.Time  `json:"deleted_at"`
}

// Page 是同一读取快照的分页明细与总数。
type Page struct {
	Items        []Customer `json:"items"`
	Total        int64      `json:"total"`
	ArchiveTotal int64      `json:"archive_total"`
	Page         int        `json:"page"`
	Size         int        `json:"page_size"`
}

// Normalize 规范文本并验证字段长度、状态和值域。
func (d Draft) Normalize() (Draft, error) {
	fields := []struct {
		value *string
		max   int
	}{{&d.Code, 50}, {&d.Name, 200}, {&d.ShortName, 100}, {&d.Industry, 100}, {&d.Level, 20},
		{&d.ContactPerson, 100}, {&d.ContactPhone, 50}, {&d.ContactEmail, 100}, {&d.Address, 500}}
	for _, f := range fields {
		*f.value = strings.TrimSpace(*f.value)
		if utf8.RuneCountInString(*f.value) > f.max || strings.ContainsRune(*f.value, 0) {
			return Draft{}, ErrInvalid
		}
	}
	if d.Level == "" {
		d.Level = "normal"
	}
	if d.CreditLimit == "" {
		d.CreditLimit = "0"
	}
	if d.Status == nil {
		value := int16(1)
		d.Status = &value
	}
	if d.Code == "" || d.Name == "" || !creditPattern.MatchString(d.CreditLimit.String()) || (*d.Status != 0 && *d.Status != 1) {
		return Draft{}, ErrInvalid
	}
	return d, nil
}
