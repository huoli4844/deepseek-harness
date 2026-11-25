// Package application 编排客户用例并校验数据访问范围，不依赖传输或存储实现。
package application

import (
	"context"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/customer/domain"
)

// Repository 的所有读写必须显式限定租户，删除只更新删除时间。
type Repository interface {
	List(context.Context, int64, int, int, archivequery.Query) (domain.Page, error)
	Get(context.Context, int64, int64) (domain.Customer, error)
	Create(context.Context, int64, int64, domain.Draft) (domain.Customer, error)
	Update(context.Context, int64, int64, domain.Draft) (domain.Customer, error)
	Delete(context.Context, int64, int64) (domain.Customer, error)
}

// Service 是客户用例的入口。
type Service struct{ repo Repository }

// New 组装客户用例与仓储。
func New(repo Repository) *Service { return &Service{repo: repo} }

// List 返回当前租户匹配的记录页、匹配总数和档案总数。
func (s *Service) List(ctx context.Context, tenant int64, page, size int, query archivequery.Query) (domain.Page, error) {
	if tenant <= 0 || page < 1 || page > 1_000_000 || size < 1 || size > 200 {
		return domain.Page{}, domain.ErrInvalid
	}
	return s.repo.List(ctx, tenant, page, size, query)
}

// Get 查询当前租户中的有效客户档案。
func (s *Service) Get(ctx context.Context, tenant, id int64) (domain.Customer, error) {
	if tenant <= 0 || id <= 0 {
		return domain.Customer{}, domain.ErrInvalid
	}
	return s.repo.Get(ctx, tenant, id)
}

// Create 使用可信登录用户 ID，而非用户输入，写入创建人。
func (s *Service) Create(ctx context.Context, tenant, actor int64, draft domain.Draft) (domain.Customer, error) {
	return s.write(ctx, tenant, actor, draft, s.repo.Create)
}

// Update 替换客户表单字段，不修改创建人、创建时间或已用额度。
func (s *Service) Update(ctx context.Context, tenant, id int64, draft domain.Draft) (domain.Customer, error) {
	return s.write(ctx, tenant, id, draft, s.repo.Update)
}

func (s *Service) write(ctx context.Context, tenant, id int64, draft domain.Draft,
	save func(context.Context, int64, int64, domain.Draft) (domain.Customer, error),
) (domain.Customer, error) {
	if tenant <= 0 || id <= 0 {
		return domain.Customer{}, domain.ErrInvalid
	}
	draft, err := draft.Normalize()
	if err != nil {
		return domain.Customer{}, err
	}
	return save(ctx, tenant, id, draft)
}

// Delete 标记当前租户中尚未删除的客户。
func (s *Service) Delete(ctx context.Context, tenant, id int64) (domain.Customer, error) {
	if tenant <= 0 || id <= 0 {
		return domain.Customer{}, domain.ErrInvalid
	}
	return s.repo.Delete(ctx, tenant, id)
}
