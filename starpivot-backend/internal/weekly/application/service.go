// Package application 编排周报用例，负责周键与草稿校验后委托持久化。
package application

import (
	"context"

	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

// Repository 抽象周报的持久化操作。
type Repository interface {
	Get(ctx context.Context, tenant, user int64, week domain.Week) (domain.View, error)
	Save(ctx context.Context, tenant, actor int64, week domain.Week, draft domain.Draft) (domain.View, error)
	Submit(ctx context.Context, tenant, actor int64, week domain.Week) (domain.View, error)
}

// Service 提供周报用例入口。
type Service struct{ repo Repository }

// New 绑定周报用例的持久化实现。
func New(repo Repository) *Service { return &Service{repo: repo} }

// Get 返回当前用户指定自然周的周报与工时汇总。
func (s *Service) Get(ctx context.Context, tenant, user int64, periodStart string) (domain.View, error) {
	if tenant <= 0 || user <= 0 {
		return domain.View{}, domain.ErrInvalid
	}
	week, err := domain.ParseWeek(periodStart)
	if err != nil {
		return domain.View{}, domain.ErrInvalid
	}
	return s.repo.Get(ctx, tenant, user, week)
}

// Save 新增或更新当前用户的周报草稿，并校验正文行内项目归属。
func (s *Service) Save(ctx context.Context, tenant, user int64, periodStart string, draft domain.Draft) (domain.View, error) {
	if tenant <= 0 || user <= 0 {
		return domain.View{}, domain.ErrInvalid
	}
	week, err := domain.ParseWeek(periodStart)
	if err != nil {
		return domain.View{}, domain.ErrInvalid
	}
	if err := draft.Validate(); err != nil {
		return domain.View{}, err
	}
	return s.repo.Save(ctx, tenant, user, week, draft)
}

// Submit 提交当前用户指定自然周的周报。
func (s *Service) Submit(ctx context.Context, tenant, user int64, periodStart string) (domain.View, error) {
	if tenant <= 0 || user <= 0 {
		return domain.View{}, domain.ErrInvalid
	}
	week, err := domain.ParseWeek(periodStart)
	if err != nil {
		return domain.View{}, domain.ErrInvalid
	}
	return s.repo.Submit(ctx, tenant, user, week)
}
