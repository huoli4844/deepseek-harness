// Package application 编排项目周报用例，不依赖传输或 PostgreSQL。
package application

import (
	"context"

	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

// Repository 用可信租户限定项目查找、周报和工时查询。
type Repository interface {
	Get(context.Context, int64, string, domain.Week) (domain.View, error)
	Save(context.Context, int64, int64, string, domain.Week, domain.Draft) (domain.View, error)
	Submit(context.Context, int64, int64, string, domain.Week) (domain.View, error)
}

// Service 提供周报读取、保存和提交用例。
type Service struct{ repository Repository }

// New 组装项目周报用例和仓储。
func New(repository Repository) *Service { return &Service{repository: repository} }

func validate(tenant int64, code, start string) (domain.Week, error) {
	if tenant <= 0 || !domain.ValidProjectCode(code) {
		return domain.Week{}, domain.ErrInvalid
	}
	return domain.ParseWeek(start)
}

// Get 返回指定项目周报和实时已批准工时。
func (s *Service) Get(ctx context.Context, tenant int64, code, start string) (domain.View, error) {
	week, err := validate(tenant, code, start)
	if err != nil {
		return domain.View{}, err
	}
	return s.repository.Get(ctx, tenant, code, week)
}

// Save 保存可编辑正文及由可信身份确定的创建人。
func (s *Service) Save(ctx context.Context, tenant, actor int64, code, start string, draft domain.Draft) (domain.View, error) {
	week, err := validate(tenant, code, start)
	if err != nil || actor <= 0 || draft.Validate() != nil {
		return domain.View{}, domain.ErrInvalid
	}
	return s.repository.Save(ctx, tenant, actor, code, week, draft)
}

// Submit 原子提交现有草稿，并在重试时返回原有的提交结果。
func (s *Service) Submit(ctx context.Context, tenant, actor int64, code, start string) (domain.View, error) {
	week, err := validate(tenant, code, start)
	if err != nil || actor <= 0 {
		return domain.View{}, domain.ErrInvalid
	}
	return s.repository.Submit(ctx, tenant, actor, code, week)
}
