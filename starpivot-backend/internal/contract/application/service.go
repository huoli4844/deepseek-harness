// Package application 实现合同列表查询用例，不依赖 HTTP 或 PostgreSQL。
package application

import (
	"context"

	"starpivot.local/deepseek-harness-backend/internal/contract/domain"
)

// Repository 定义租户内合同的分页查询。
type Repository interface {
	List(context.Context, int64, domain.ListQuery) (domain.Page, error)
}

// Service 校验合同查询的租户与参数。
type Service struct{ repo Repository }

// New 组装合同查询用例。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 返回指定租户的合同分页。
func (s *Service) List(ctx context.Context, tenant int64, query domain.ListQuery) (domain.Page, error) {
	if tenant <= 0 || !query.Valid() {
		return domain.Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, tenant, query)
}
