// 本文件编排个人周报登记用例，身份由调用层验证。
package application

import (
	"context"

	"starpivot.local/deepseek-harness-backend/internal/weekly/domain"
)

// WorkspaceRepository 按可信租户及用户读取和更新周登记。
type WorkspaceRepository interface {
	GetWorkspace(context.Context, int64, int64, domain.Week) (domain.Workspace, error)
	SaveWorkspace(context.Context, int64, int64, domain.Week, []domain.ItemDraft) (domain.Workspace, error)
}

// WorkspaceService 提供本人周登记的读取和批量保存用例。
type WorkspaceService struct{ repository WorkspaceRepository }

// NewWorkspace 组装个人周报登记用例和仓储。
func NewWorkspace(repository WorkspaceRepository) *WorkspaceService {
	return &WorkspaceService{repository: repository}
}

// Get 查询当前员工在目标自然周的登记。
func (s *WorkspaceService) Get(ctx context.Context, tenant, user int64, start string) (domain.Workspace, error) {
	week, err := domain.ParseWeek(start)
	if err != nil || tenant <= 0 || user <= 0 {
		return domain.Workspace{}, domain.ErrInvalid
	}
	return s.repository.GetWorkspace(ctx, tenant, user, week)
}

// Save 原子替换当前员工在目标周的未提交登记。
func (s *WorkspaceService) Save(ctx context.Context, tenant, user int64, start string, items []domain.ItemDraft) (domain.Workspace, error) {
	week, err := domain.ParseWeek(start)
	if err != nil || tenant <= 0 || user <= 0 || len(items) > 200 {
		return domain.Workspace{}, domain.ErrInvalid
	}
	drafts := make([]domain.ItemDraft, len(items))
	for index, item := range items {
		draft, err := item.Normalize()
		if err != nil {
			return domain.Workspace{}, err
		}
		drafts[index] = draft
	}
	return s.repository.SaveWorkspace(ctx, tenant, user, week, drafts)
}
