// Package application 编排物料查询和分类创建，不依赖 HTTP 或 PostgreSQL。
package application

import (
	"context"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/material/domain"
)

// Repository 的读写操作以可信租户 ID 为边界。
type Repository interface {
	List(context.Context, int64, domain.ListQuery) (domain.Page, error)
	Categories(context.Context, int64, string) ([]domain.Category, error)
	CreateCategory(context.Context, int64, domain.CategoryDraft) (domain.Category, error)
	UpdateMaterial(context.Context, int64, int64, domain.MaterialDraft) error
	DeleteMaterial(context.Context, int64, int64) error
}

// Service 提供物料后台用例。
type Service struct{ repo Repository }

// New 组装物料用例及其仓储。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 查询有效物料和租户范围内的统计信息。
func (s *Service) List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error) {
	query.Code = strings.TrimSpace(query.Code)
	query.Name = strings.TrimSpace(query.Name)
	query.MaterialType = strings.TrimSpace(query.MaterialType)
	query.CriticalLevel = strings.TrimSpace(query.CriticalLevel)
	if tenant <= 0 || query.Page < 1 || query.Page > 1_000_000 || query.PageSize < 1 || query.PageSize > 200 ||
		query.CategoryID < 0 || !domain.ValidText(query.Code, 100) || !domain.ValidText(query.Name, 200) ||
		!domain.ValidText(query.MaterialType, 30) || !domain.ValidText(query.CriticalLevel, 20) {
		return domain.Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, tenant, query)
}

// Categories 返回命中的分类节点及其同租户祖先。
func (s *Service) Categories(ctx context.Context, tenant int64, keyword string) ([]domain.Category, error) {
	keyword = strings.TrimSpace(keyword)
	if tenant <= 0 || !domain.ValidText(keyword, 100) {
		return nil, domain.ErrInvalid
	}
	return s.repo.Categories(ctx, tenant, keyword)
}

// CreateCategory 保存分类，父级归属在同一事务中验证。
func (s *Service) CreateCategory(ctx context.Context, tenant int64, draft domain.CategoryDraft) (domain.Category, error) {
	if tenant <= 0 {
		return domain.Category{}, domain.ErrInvalid
	}
	draft, err := draft.Normalize()
	if err != nil {
		return domain.Category{}, err
	}
	return s.repo.CreateCategory(ctx, tenant, draft)
}

// UpdateMaterial 更新当前租户未删除物料的业务字段。
func (s *Service) UpdateMaterial(ctx context.Context, tenant, id int64, draft domain.MaterialDraft) error {
	if tenant <= 0 || id <= 0 {
		return domain.ErrInvalid
	}
	draft, err := draft.Normalize()
	if err != nil {
		return err
	}
	return s.repo.UpdateMaterial(ctx, tenant, id, draft)
}

// DeleteMaterial 逻辑删除当前租户物料并保留业务引用。
func (s *Service) DeleteMaterial(ctx context.Context, tenant, id int64) error {
	if tenant <= 0 || id <= 0 {
		return domain.ErrInvalid
	}
	return s.repo.DeleteMaterial(ctx, tenant, id)
}
