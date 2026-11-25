// Package application 编排项目和工时用例，不依赖 HTTP 或 PostgreSQL。
package application

import (
	"context"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/labor/domain"
)

// Repository 封装租户内项目访问和工时状态转换。
type Repository interface {
	Projects(context.Context, int64, string, int, int) (domain.ProjectPage, error)
	Tasks(context.Context, int64, string, string, int, int) (domain.TaskPage, error)
	List(context.Context, domain.Actor, string, domain.ListQuery) (domain.Page, error)
	Create(context.Context, domain.Actor, string, domain.Draft) (domain.Record, error)
	Update(context.Context, domain.Actor, string, int64, domain.Draft) (domain.Record, error)
	Submit(context.Context, domain.Actor, string, int64) (domain.Record, error)
}

// Tasks 返回当前租户指定项目的有效任务。
func (s *Service) Tasks(ctx context.Context, actor domain.Actor, code, keyword string, page, size int) (domain.TaskPage, error) {
	keyword = strings.TrimSpace(keyword)
	if actor.TenantID <= 0 || !domain.ValidProjectCode(code) || !domain.ValidPage(page, size) || !domain.ValidText(keyword, 100) {
		return domain.TaskPage{}, domain.ErrInvalid
	}
	return s.repo.Tasks(ctx, actor.TenantID, code, keyword, page, size)
}

// Service 是项目和工时用例的入口。
type Service struct{ repo Repository }

// New 组装用例及其仓储。
func New(repo Repository) *Service { return &Service{repo: repo} }

// Projects 返回租户内按编码或名称搜索的非删除项目。
func (s *Service) Projects(ctx context.Context, actor domain.Actor, keyword string, page, size int) (domain.ProjectPage, error) {
	keyword = strings.TrimSpace(keyword)
	if actor.TenantID <= 0 || !domain.ValidPage(page, size) || !domain.ValidText(keyword, 100) {
		return domain.ProjectPage{}, domain.ErrInvalid
	}
	return s.repo.Projects(ctx, actor.TenantID, keyword, page, size)
}

// List 分页查询个人工时与项目已批准工时。
func (s *Service) List(ctx context.Context, actor domain.Actor, code string, query domain.ListQuery) (domain.Page, error) {
	if actor.TenantID <= 0 || !domain.ValidProjectCode(code) {
		return domain.Page{}, domain.ErrInvalid
	}
	if err := query.Validate(); err != nil {
		return domain.Page{}, err
	}
	return s.repo.List(ctx, actor, code, query)
}

// Create 创建当前填报人的工时草稿。
func (s *Service) Create(ctx context.Context, actor domain.Actor, code string, draft domain.Draft) (domain.Record, error) {
	if !canChange(actor, code) {
		return domain.Record{}, domain.ErrInvalid
	}
	if err := draft.Validate(); err != nil {
		return domain.Record{}, err
	}
	return s.repo.Create(ctx, actor, code, draft)
}

// Update 重新保存本人可编辑的草稿或驳回记录。
func (s *Service) Update(ctx context.Context, actor domain.Actor, code string, id int64, draft domain.Draft) (domain.Record, error) {
	if !canChange(actor, code) || id <= 0 {
		return domain.Record{}, domain.ErrInvalid
	}
	if err := draft.Validate(); err != nil {
		return domain.Record{}, err
	}
	return s.repo.Update(ctx, actor, code, id, draft)
}

// Submit 锁定本人草稿并记录提交时间。
func (s *Service) Submit(ctx context.Context, actor domain.Actor, code string, id int64) (domain.Record, error) {
	if !canChange(actor, code) || id <= 0 {
		return domain.Record{}, domain.ErrInvalid
	}
	return s.repo.Submit(ctx, actor, code, id)
}

func canChange(actor domain.Actor, code string) bool {
	return actor.CanWrite && actor.TenantID > 0 && actor.UserID > 0 && domain.ValidProjectCode(code)
}
