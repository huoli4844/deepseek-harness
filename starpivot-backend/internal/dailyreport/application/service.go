// Package application 编排本人日报用例，不依赖 HTTP 或具体仓储。
package application

import (
	"context"
	"starpivot.local/deepseek-harness-backend/internal/dailyreport/domain"
)

// Repository 的每个操作必须同时限定租户、用户与业务日期。
type Repository interface {
	Get(context.Context, int64, int64, string) (*domain.Report, error)
	Save(context.Context, int64, int64, string, domain.Input) (*domain.Report, error)
}

// Service 不提供管理他人日报或模型代提交的特殊入口。
type Service struct{ repo Repository }

// New 绑定持久化依赖。
func New(repo Repository) *Service { return &Service{repo: repo} }

// Get 读取本人日报；尚未建立时返回 nil。
func (s *Service) Get(ctx context.Context, tenant, user int64, date string) (*domain.Report, error) {
	if _, err := domain.ParseDate(date); err != nil || tenant <= 0 || user <= 0 {
		return nil, domain.ErrInvalid
	}
	return s.repo.Get(ctx, tenant, user, date)
}

// Save 校验后原子保存或提交用户已确认的最终正文。
func (s *Service) Save(ctx context.Context, tenant, user int64, date string, input domain.Input) (*domain.Report, error) {
	if _, err := domain.ParseDate(date); err != nil || tenant <= 0 || user <= 0 {
		return nil, domain.ErrInvalid
	}
	if err := input.Validate(); err != nil {
		return nil, err
	}
	return s.repo.Save(ctx, tenant, user, date, input)
}
