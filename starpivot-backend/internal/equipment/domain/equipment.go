// Package domain 定义设备台账字段及输入约束，不依赖传输和持久化层。
package domain

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
)

var (
	// ErrInvalid 表示设备字段或查询参数不符合约束。
	ErrInvalid = errors.New("设备字段或查询参数无效")
	// ErrNotFound 表示当前租户没有该设备。
	ErrNotFound = errors.New("设备不存在")
	// ErrConflict 表示设备编码已被占用。
	ErrConflict = errors.New("设备编码已存在")
)

// Draft 是设备台账可编辑字段。日期仅表示业务日期。
type Draft struct {
	Code              string  `json:"code"`
	Name              string  `json:"name"`
	EquipmentType     string  `json:"equipment_type"`
	Workshop          string  `json:"workshop"`
	Model             *string `json:"model"`
	Manufacturer      *string `json:"manufacturer"`
	PurchaseDate      *string `json:"purchase_date"`
	ArrivalDate       *string `json:"arrival_date"`
	LifecycleStatus   string  `json:"lifecycle_status"`
	RuntimeStatus     string  `json:"runtime_status"`
	MaintIntervalDays int32   `json:"maint_interval_days"`
	SerialNo          string  `json:"serial_no"`
	QRCode            string  `json:"qr_code"`
	CategoryCode      string  `json:"category_code"`
	CategoryName      string  `json:"category_name"`
	SubcategoryCode   string  `json:"subcategory_code"`
	SubcategoryName   string  `json:"subcategory_name"`
	Remark            string  `json:"remark"`
}

var lifecycleStates = []string{"active", "inactive", "scrapped", "sealed"}
var runtimeStates = []string{"running", "idle", "broken", "maintenance", "planned_stop"}

// Normalize 清理文本并校验数据库字段及状态取值。
func (d Draft) Normalize() (Draft, error) {
	fields := []struct {
		target *string
		limit  int
	}{
		{&d.Code, 50}, {&d.Name, 200}, {&d.EquipmentType, 50}, {&d.Workshop, 50},
		{d.Model, 100}, {d.Manufacturer, 200}, {&d.SerialNo, 100}, {&d.QRCode, 200},
		{&d.CategoryCode, 64}, {&d.CategoryName, 120}, {&d.SubcategoryCode, 64},
		{&d.SubcategoryName, 120}, {&d.Remark, 4000},
	}
	for _, field := range fields {
		if field.target == nil {
			continue
		}
		value := strings.TrimSpace(*field.target)
		if !validText(value, field.limit) {
			return Draft{}, ErrInvalid
		}
		*field.target = value
	}
	if d.LifecycleStatus == "" {
		d.LifecycleStatus = "active"
	}
	if d.RuntimeStatus == "" {
		d.RuntimeStatus = "idle"
	}
	if d.Code == "" || d.Name == "" || d.MaintIntervalDays < 0 ||
		!slices.Contains(lifecycleStates, d.LifecycleStatus) ||
		!slices.Contains(runtimeStates, d.RuntimeStatus) ||
		!validDate(d.PurchaseDate) || !validDate(d.ArrivalDate) {
		return Draft{}, ErrInvalid
	}
	return d, nil
}

func validText(value string, limit int) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= limit
}

func validDate(value *string) bool {
	if value == nil {
		return true
	}
	parsed, err := time.Parse(time.DateOnly, *value)
	return err == nil && parsed.Year() >= 1
}

var sortable = []string{
	"id", "code", "name", "equipment_type", "workshop", "model", "manufacturer", "purchase_date", "arrival_date",
	"lifecycle_status", "runtime_status", "maint_interval_days", "serial_no", "qr_code", "category_code", "category_name",
	"subcategory_code", "subcategory_name", "remark", "last_maint_date", "next_maint_date", "created_at", "updated_at",
}

// ListQuery 描述设备台账的租户内搜索、排序和分页。
type ListQuery struct {
	archivequery.Query
	Page, PageSize int
}

// Valid 检查分页范围、搜索词和排序白名单。
func (q ListQuery) Valid() bool {
	return q.Page >= 1 && q.Page <= 1000000 && q.PageSize >= 1 && q.PageSize <= 200 &&
		validText(q.Keyword, 100) && q.ValidSort(sortable)
}

// Page 包含当前页、匹配记录总数和未应用搜索条件的档案总数。
type Page struct {
	Items        []json.RawMessage `json:"items"`
	Total        int64             `json:"total"`
	ArchiveTotal int64             `json:"archive_total"`
	Page         int               `json:"page"`
	PageSize     int               `json:"page_size"`
}
