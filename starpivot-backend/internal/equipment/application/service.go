// Package application 实现设备台账用例，不依赖 HTTP 或 PostgreSQL。
package application

import (
	"context"
	"encoding/json"

	"starpivot.local/deepseek-harness-backend/internal/equipment/domain"
)

// Repository 定义租户内设备台账的持久化操作。
type Repository interface {
	List(context.Context, int64, domain.ListQuery) (domain.Page, error)
	Get(context.Context, int64, int64) (json.RawMessage, error)
	Create(context.Context, int64, domain.Draft) (json.RawMessage, error)
	Update(context.Context, int64, int64, domain.Draft) (json.RawMessage, error)
	Delete(context.Context, int64, int64) (json.RawMessage, error)
}

// Service 校验设备台账操作的租户、标识和业务字段。
type Service struct{ repo Repository }

// New 组装设备台账用例。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 返回指定租户的设备分页。
func (s *Service) List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error) {
	if tenant <= 0 || !query.Valid() {
		return domain.Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, tenant, query)
}

// Get 按设备 ID 查询当前租户的未删除档案。
func (s *Service) Get(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	if tenant <= 0 || id <= 0 {
		return nil, domain.ErrInvalid
	}
	return s.repo.Get(ctx, tenant, id)
}

// Create 登记当前租户的人工录入设备。
func (s *Service) Create(ctx context.Context, tenant int64, draft domain.Draft) (json.RawMessage, error) {
	normalized, err := draft.Normalize()
	if tenant <= 0 || err != nil {
		return nil, domain.ErrInvalid
	}
	return s.repo.Create(ctx, tenant, normalized)
}

// Update 替换设备台账可编辑的业务字段。
func (s *Service) Update(ctx context.Context, tenant, id int64, draft domain.Draft) (json.RawMessage, error) {
	normalized, err := draft.Normalize()
	if tenant <= 0 || id <= 0 || err != nil {
		return nil, domain.ErrInvalid
	}
	return s.repo.Update(ctx, tenant, id, normalized)
}

// Delete 软删除当前租户设备，保留设备关联的业务历史。
func (s *Service) Delete(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	if tenant <= 0 || id <= 0 {
		return nil, domain.ErrInvalid
	}
	return s.repo.Delete(ctx, tenant, id)
}
