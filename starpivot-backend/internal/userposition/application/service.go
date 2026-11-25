// Package application 编排用户任职用例，负责输入校验后委托持久化。
package application

import (
	"context"
	"encoding/json"

	"starpivot.local/deepseek-harness-backend/internal/userposition/domain"
)

// Repository 抽象任职记录的持久化操作。
type Repository interface {
	List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error)
	Create(ctx context.Context, tenant int64, draft domain.Draft) (json.RawMessage, error)
	Update(ctx context.Context, tenant, id int64, draft domain.Draft) (json.RawMessage, error)
	Delete(ctx context.Context, tenant, id int64) (json.RawMessage, error)
}

// Service 提供任职记录的用例入口。
type Service struct{ repo Repository }

// New 绑定任职用例的持久化实现。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 返回当前租户的任职记录，可按用户或岗位过滤。
func (s *Service) List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error) {
	if !query.Valid() {
		return domain.Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, tenant, query)
}

// Create 登记新的任职记录。
func (s *Service) Create(ctx context.Context, tenant int64, draft domain.Draft) (json.RawMessage, error) {
	draft, err := draft.Normalize()
	if err != nil {
		return nil, err
	}
	return s.repo.Create(ctx, tenant, draft)
}

// Update 替换任职记录的可编辑字段。
func (s *Service) Update(ctx context.Context, tenant, id int64, draft domain.Draft) (json.RawMessage, error) {
	draft, err := draft.Normalize()
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, tenant, id, draft)
}

// Delete 删除任职记录。
func (s *Service) Delete(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return s.repo.Delete(ctx, tenant, id)
}
