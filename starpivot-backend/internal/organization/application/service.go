// Package application 编排组织架构树与部门成员查询。
package application

import (
	"context"
	"encoding/json"

	"starpivot.local/deepseek-harness-backend/internal/organization/domain"
)

// 上游用户接口不支持按部门过滤，按部门查询时逐页拉取后再本地过滤。
const (
	upstreamPageSize = 200
	maxUpstreamPages = 20
)

// Repository 是组织架构数据的上游读取接口。
type Repository interface {
	// DepartmentTree 读取当前租户的部门层级树。
	DepartmentTree(ctx context.Context, credential domain.Credential) ([]domain.Department, error)
	// Users 分页读取当前租户的用户，keyword 为空表示不筛选。
	Users(ctx context.Context, credential domain.Credential, page, pageSize int, keyword string) (domain.UserPage, error)
}

// Service 提供组织架构树与成员列表查询。
type Service struct {
	repo Repository
}

// New 使用上游仓储构造服务。
func New(repo Repository) *Service {
	return &Service{repo: repo}
}

// Tree 返回当前租户的组织架构树，并给出每个节点的子树成员总数。
func (s *Service) Tree(ctx context.Context, credential domain.Credential) ([]domain.Department, error) {
	tree, err := s.repo.DepartmentTree(ctx, credential)
	if err != nil {
		return nil, err
	}
	counts, err := s.departmentCounts(ctx, credential)
	if err != nil {
		return nil, err
	}
	applyTotalMembers(tree, counts)
	return tree, nil
}

// departmentCounts 逐页读取全部用户并统计各部门的直属人数。
func (s *Service) departmentCounts(ctx context.Context, credential domain.Credential) (map[int64]int, error) {
	counts := make(map[int64]int)
	for page := 1; page <= maxUpstreamPages; page++ {
		result, err := s.repo.Users(ctx, credential, page, upstreamPageSize, "")
		if err != nil {
			return nil, err
		}
		for _, raw := range result.List {
			if id := departmentID(raw); id > 0 {
				counts[id]++
			}
		}
		if len(result.List) == 0 || page*upstreamPageSize >= result.Total {
			break
		}
	}
	return counts, nil
}

// applyTotalMembers 自底向上累加子树人数并写入节点，返回该层子树总人数。
func applyTotalMembers(nodes []domain.Department, counts map[int64]int) int {
	total := 0
	for index := range nodes {
		members := counts[nodes[index].ID] + applyTotalMembers(nodes[index].Children, counts)
		nodes[index].TotalMembers = members
		total += members
	}
	return total
}

// Users 返回组织成员分页；指定部门时包含其全部子部门。
func (s *Service) Users(ctx context.Context, credential domain.Credential, query domain.UsersQuery) (domain.UserPage, error) {
	if query.Page < 1 || query.PageSize < 1 || query.PageSize > upstreamPageSize {
		return domain.UserPage{}, domain.ErrInvalid
	}
	if query.DepartmentID <= 0 {
		return s.repo.Users(ctx, credential, query.Page, query.PageSize, query.Keyword)
	}
	tree, err := s.repo.DepartmentTree(ctx, credential)
	if err != nil {
		return domain.UserPage{}, err
	}
	scope := descendantIDs(tree, query.DepartmentID)
	if len(scope) == 0 {
		return domain.UserPage{List: []json.RawMessage{}, Page: query.Page, PageSize: query.PageSize}, nil
	}
	matched, err := s.scopedUsers(ctx, credential, query.Keyword, scope)
	if err != nil {
		return domain.UserPage{}, err
	}
	return slicePage(matched, query.Page, query.PageSize), nil
}

// scopedUsers 逐页拉取上游用户并按部门集合过滤。
func (s *Service) scopedUsers(
	ctx context.Context,
	credential domain.Credential,
	keyword string,
	scope map[int64]bool,
) ([]json.RawMessage, error) {
	matched := make([]json.RawMessage, 0, 32)
	for page := 1; page <= maxUpstreamPages; page++ {
		result, err := s.repo.Users(ctx, credential, page, upstreamPageSize, keyword)
		if err != nil {
			return nil, err
		}
		for _, raw := range result.List {
			if scope[departmentID(raw)] {
				matched = append(matched, raw)
			}
		}
		if len(result.List) == 0 || page*upstreamPageSize >= result.Total {
			break
		}
	}
	return matched, nil
}

// slicePage 按页切分已过滤结果，越界时返回空列表但保留总数。
func slicePage(matched []json.RawMessage, page, pageSize int) domain.UserPage {
	total := len(matched)
	start := (page - 1) * pageSize
	if start >= total {
		return domain.UserPage{List: []json.RawMessage{}, Page: page, PageSize: pageSize, Total: total}
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	return domain.UserPage{List: matched[start:end], Page: page, PageSize: pageSize, Total: total}
}

// descendantIDs 返回指定部门及其全部子部门的 ID 集合。
func descendantIDs(nodes []domain.Department, root int64) map[int64]bool {
	children := make(map[int64][]int64)
	var walk func([]domain.Department)
	walk = func(items []domain.Department) {
		for _, item := range items {
			if item.ParentID > 0 {
				children[item.ParentID] = append(children[item.ParentID], item.ID)
			}
			walk(item.Children)
		}
	}
	walk(nodes)
	scope := map[int64]bool{root: true}
	stack := []int64{root}
	for len(stack) > 0 {
		id := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, child := range children[id] {
			if !scope[child] {
				scope[child] = true
				stack = append(stack, child)
			}
		}
	}
	return scope
}

// departmentID 读取用户记录中的部门 ID，无法解析时返回 0。
func departmentID(raw json.RawMessage) int64 {
	var item struct {
		DepartmentID int64 `json:"department_id"`
	}
	if json.Unmarshal(raw, &item) != nil {
		return 0
	}
	return item.DepartmentID
}
