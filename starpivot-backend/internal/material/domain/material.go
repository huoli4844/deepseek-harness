// Package domain 定义物料查询和分类数据，不依赖存储或传输层。
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
	// ErrInvalid 表示查询参数或分类数据无效。
	ErrInvalid = errors.New("物料查询参数或分类数据无效")
	// ErrNotFound 表示当前租户没有可用的上级分类。
	ErrNotFound = errors.New("上级物料分类不存在或已停用")
	// ErrConflict 表示分类编码违反已有唯一约束。
	ErrConflict = errors.New("物料分类编码已存在")
	// ErrMaterialNotFound 表示当前租户没有可编辑或删除的物料。
	ErrMaterialNotFound = errors.New("物料不存在")
	// ErrMaterialConflict 表示物料编码违反现有唯一约束。
	ErrMaterialConflict = errors.New("物料编码已存在")
)

// Category 是一条带父级引用的物料分类记录。
type Category struct {
	ID          int64     `json:"id"`
	ParentID    *int64    `json:"parent_id"`
	Code        string    `json:"code"`
	Name        string    `json:"name"`
	Level       int       `json:"level"`
	Path        string    `json:"path"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

// CategoryDraft 仅接收调用方可填写的分类字段。
type CategoryDraft struct {
	ParentID    *int64 `json:"parent_id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// MaterialDraft 仅包含界面允许编辑的物料业务字段。
type MaterialDraft struct {
	Code           string      `json:"code"`
	Name           string      `json:"name"`
	Spec           *string     `json:"spec"`
	MaterialType   string      `json:"material_type"`
	CategoryCode   string      `json:"category_code"`
	CategoryCode2  string      `json:"category_code2"`
	Unit           string      `json:"unit"`
	Brand          string      `json:"brand"`
	Model          string      `json:"model"`
	DrawingNo      *string     `json:"drawing_no"`
	PriceSuggested json.Number `json:"price_suggested"`
	SafetyStock    json.Number `json:"safety_stock"`
	LeadTimeDays   int64       `json:"lead_time_days"`
	CriticalLevel  string      `json:"critical_level"`
	Remark         string      `json:"remark"`
	Status         int64       `json:"status"`
}

var materialDecimal = regexp.MustCompile(`^(0|[1-9][0-9]*)(\.[0-9]{1,4})?$`)

// Normalize 清理业务文本，并校验必填项及非负数值。
func (d MaterialDraft) Normalize() (MaterialDraft, error) {
	d.Code = strings.TrimSpace(d.Code)
	d.Name = strings.TrimSpace(d.Name)
	d.MaterialType = strings.TrimSpace(d.MaterialType)
	d.CategoryCode = strings.TrimSpace(d.CategoryCode)
	d.CategoryCode2 = strings.TrimSpace(d.CategoryCode2)
	d.Unit = strings.TrimSpace(d.Unit)
	d.Brand = strings.TrimSpace(d.Brand)
	d.Model = strings.TrimSpace(d.Model)
	d.CriticalLevel = strings.TrimSpace(d.CriticalLevel)
	d.Remark = strings.TrimSpace(d.Remark)
	if d.Spec != nil {
		value := strings.TrimSpace(*d.Spec)
		d.Spec = &value
	}
	if d.DrawingNo != nil {
		value := strings.TrimSpace(*d.DrawingNo)
		d.DrawingNo = &value
	}
	fields := []struct {
		value string
		limit int
	}{{d.Code, 100}, {d.Name, 200}, {d.MaterialType, 30}, {d.CategoryCode, 50}, {d.CategoryCode2, 50},
		{d.Unit, 2000}, {d.Brand, 2000}, {d.Model, 2000}, {d.CriticalLevel, 20}, {d.Remark, 2000}}
	if d.Spec != nil {
		fields = append(fields, struct {
			value string
			limit int
		}{*d.Spec, 2000})
	}
	if d.DrawingNo != nil {
		fields = append(fields, struct {
			value string
			limit int
		}{*d.DrawingNo, 2000})
	}
	for _, field := range fields {
		if !ValidText(field.value, field.limit) {
			return MaterialDraft{}, ErrInvalid
		}
	}
	if d.Code == "" || d.Name == "" || d.MaterialType == "" || d.CriticalLevel == "" ||
		!materialDecimal.MatchString(d.PriceSuggested.String()) || !materialDecimal.MatchString(d.SafetyStock.String()) ||
		d.LeadTimeDays < 0 {
		return MaterialDraft{}, ErrInvalid
	}
	return d, nil
}

// Normalize 清理分类字段并校验数据库长度和路径分隔符。
func (d CategoryDraft) Normalize() (CategoryDraft, error) {
	d.Code = strings.TrimSpace(d.Code)
	d.Name = strings.TrimSpace(d.Name)
	d.Description = strings.TrimSpace(d.Description)
	if d.Code == "" || d.Name == "" || strings.ContainsRune(d.Name, '/') ||
		!ValidText(d.Code, 50) || !ValidText(d.Name, 100) || !ValidText(d.Description, 4000) ||
		(d.ParentID != nil && *d.ParentID <= 0) {
		return CategoryDraft{}, ErrInvalid
	}
	return d, nil
}

// ListQuery 描述同一租户内的物料过滤和稳定分页。
type ListQuery struct {
	Page          int
	PageSize      int
	CategoryID    int64
	Code          string
	Name          string
	MaterialType  string
	CriticalLevel string
	SortBy        string
	SortDir       string
}

// Page 包含匹配数、档案总数和当前租户可用的筛选值。
type Page struct {
	Items          []json.RawMessage `json:"items"`
	Total          int64             `json:"total"`
	ArchiveTotal   int64             `json:"archive_total"`
	Page           int               `json:"page"`
	PageSize       int               `json:"page_size"`
	MaterialTypes  []string          `json:"material_types"`
	CriticalLevels []string          `json:"critical_levels"`
}

// ValidText 校验可传给 PostgreSQL 的文本及最大字符数。
func ValidText(value string, limit int) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= limit
}
