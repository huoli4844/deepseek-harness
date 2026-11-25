// Package domain 定义合同列表查询条件与分页结果，不依赖传输和持久化层。
package domain

import (
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
)

// ErrInvalid 表示合同查询参数不符合约束。
var ErrInvalid = errors.New("合同查询参数无效")

// ListQuery 描述租户内合同的关键字搜索、排序和分页。
type ListQuery struct {
	archivequery.Query
	Page, PageSize int
}

// sortable 是合同列表允许的排序字段，与仓储的固定 SQL 表达式一一对应。
var sortable = []string{
	"id", "code", "contract_type", "counterparty_name", "project_code", "project_name",
	"signed_date", "effective_date", "expiry_date", "total_amount", "tax_amount",
	"owed_amount", "warranty_amount", "status", "updated_at",
}

// Valid 检查分页范围、搜索词和排序白名单。
func (q ListQuery) Valid() bool {
	return q.Page >= 1 && q.Page <= 1000000 && q.PageSize >= 1 && q.PageSize <= 200 &&
		utf8.ValidString(q.Keyword) && !strings.ContainsRune(q.Keyword, 0) &&
		utf8.RuneCountInString(q.Keyword) <= 100 && q.ValidSort(sortable)
}

// Page 包含当前页、匹配总数和未应用搜索条件的合同档案总数。
type Page struct {
	Items        []json.RawMessage `json:"items"`
	Total        int64             `json:"total"`
	ArchiveTotal int64             `json:"archive_total"`
	Page         int               `json:"page"`
	PageSize     int               `json:"page_size"`
}
