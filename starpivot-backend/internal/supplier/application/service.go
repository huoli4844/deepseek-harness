// Package application 编排供应商资源用例，不依赖 HTTP 或存储实现。
package application

import (
	"context"
	"encoding/json"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/supplier/domain"
)

// Repository 按租户操作供应商主档及关联资源。
type Repository interface {
	List(context.Context, domain.Kind, int64, int64, int, int, archivequery.Query) (Page, error)
	Get(context.Context, domain.Kind, int64, int64) (json.RawMessage, error)
	Create(context.Context, domain.Kind, int64, int64, int64, map[string]json.RawMessage) (json.RawMessage, error)
	Update(context.Context, domain.Kind, int64, int64, map[string]json.RawMessage) (json.RawMessage, error)
	Delete(context.Context, domain.Kind, int64, int64) (json.RawMessage, error)
	Categories(context.Context, int64) ([]string, int64, error)
}

// Page 包含资源分页结果与筛选后的总数。
type Page struct {
	Items        []json.RawMessage `json:"items"`
	Total        int64             `json:"total"`
	ArchiveTotal int64             `json:"archive_total"`
	Page         int               `json:"page"`
	Size         int               `json:"page_size"`
}

// Service 是供应商资源用例入口。
type Service struct{ repo Repository }

// New 组装供应商用例与仓储。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 查询租户范围内的资源分页和总数。
func (s *Service) List(ctx context.Context, kind domain.Kind, tenant, parent int64, page, size int, query archivequery.Query) (Page, error) {
	if tenant <= 0 || (kind != domain.Supplier && (parent <= 0 || query != (archivequery.Query{}))) || page < 1 || page > 1_000_000 || size < 1 || size > 200 {
		return Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, kind, tenant, parent, page, size, query)
}

// Get 查询租户范围内的单条供应商资源。
func (s *Service) Get(ctx context.Context, kind domain.Kind, tenant, id int64) (json.RawMessage, error) {
	if tenant <= 0 || id <= 0 {
		return nil, domain.ErrInvalid
	}
	return s.repo.Get(ctx, kind, tenant, id)
}

// Create 新建供应商资源并由可信身份写入审计人。
func (s *Service) Create(ctx context.Context, kind domain.Kind, tenant, actor, parent int64, raw json.RawMessage) (json.RawMessage, error) {
	if tenant <= 0 || actor <= 0 || (kind != domain.Supplier && parent <= 0) {
		return nil, domain.ErrInvalid
	}
	fields, err := domain.DecodeFields(raw, kind)
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, kind, tenant, actor, parent, fields)
}

// Update 只更新资源白名单中的业务字段。
func (s *Service) Update(ctx context.Context, kind domain.Kind, tenant, id int64, raw json.RawMessage) (json.RawMessage, error) {
	if tenant <= 0 || id <= 0 {
		return nil, domain.ErrInvalid
	}
	fields, err := domain.DecodeFields(raw, kind)
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, kind, tenant, id, fields)
}

// Delete 软删除租户范围内的供应商资源。
func (s *Service) Delete(ctx context.Context, kind domain.Kind, tenant, id int64) (json.RawMessage, error) {
	if tenant <= 0 || id <= 0 {
		return nil, domain.ErrInvalid
	}
	return s.repo.Delete(ctx, kind, tenant, id)
}

// Categories 查询当前租户供应商主档中已使用的分类和总数。
func (s *Service) Categories(ctx context.Context, tenant int64) (Page, error) {
	if tenant <= 0 {
		return Page{}, domain.ErrInvalid
	}
	items, total, err := s.repo.Categories(ctx, tenant)
	encoded := make([]json.RawMessage, 0, len(items))
	for _, item := range items {
		value, _ := json.Marshal(map[string]string{"category": item})
		encoded = append(encoded, value)
	}
	return Page{Items: encoded, Total: total, Page: 1, Size: 20}, err
}
