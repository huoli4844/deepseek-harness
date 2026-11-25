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

// Repository 是组织架构数据的上游读取与写入接口。
type Repository interface {
	// DepartmentTree 读取当前租户的部门层级树。
	DepartmentTree(ctx context.Context, credential domain.Credential) ([]domain.Department, error)
	// Users 分页读取当前租户的用户，keyword 为空表示不筛选。
	Users(ctx context.Context, credential domain.Credential, page, pageSize int, keyword string) (domain.UserPage, error)
	// Roles 读取当前租户的角色列表，供成员编辑弹窗选择。
	Roles(ctx context.Context, credential domain.Credential) ([]domain.Role, error)
	// UpdateUser 按调用方凭证透传成员资料编辑到元枢。
	UpdateUser(ctx context.Context, credential domain.Credential, id int64, update domain.UserUpdate) error
	// UpdateUserStatus 按调用方凭证透传成员启用状态到元枢。
	UpdateUserStatus(ctx context.Context, credential domain.Credential, id int64, update domain.UserStatusUpdate) error
	// UpdateUserRoles 按调用方凭证透传成员角色分配到元枢。
	UpdateUserRoles(ctx context.Context, credential domain.Credential, id int64, update domain.UserRolesUpdate) error
	// DeleteUser 按调用方凭证透传成员删除到元枢。
	DeleteUser(ctx context.Context, credential domain.Credential, id int64) error
}

// Service 提供组织架构树与成员列表查询。
type Service struct {
	repo Repository
}

// New 使用上游仓储构造服务。
func New(repo Repository) *Service {
	return &Service{repo: repo}
}

// Tree 返回当前租户的组织架构树、各节点子树人数及未分配成员数量。
func (s *Service) Tree(ctx context.Context, credential domain.Credential) (domain.TreeSnapshot, error) {
	tree, err := s.repo.DepartmentTree(ctx, credential)
	if err != nil {
		return domain.TreeSnapshot{}, err
	}
	counts, unassigned, err := s.departmentCounts(ctx, credential)
	if err != nil {
		return domain.TreeSnapshot{}, err
	}
	applyTotalMembers(tree, counts)
	if tree == nil {
		tree = []domain.Department{}
	}
	return domain.TreeSnapshot{Departments: tree, UnassignedCount: unassigned}, nil
}

// departmentCounts 逐页读取全部用户，统计各部门直属人数与未分配部门的人数。
func (s *Service) departmentCounts(ctx context.Context, credential domain.Credential) (map[int64]int, int, error) {
	counts := make(map[int64]int)
	unassigned := 0
	for page := 1; page <= maxUpstreamPages; page++ {
		result, err := s.repo.Users(ctx, credential, page, upstreamPageSize, "")
		if err != nil {
			return nil, 0, err
		}
		for _, raw := range result.List {
			if id := departmentID(raw); id > 0 {
				counts[id]++
			} else {
				unassigned++
			}
		}
		if len(result.List) == 0 || page*upstreamPageSize >= result.Total {
			break
		}
	}
	return counts, unassigned, nil
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

// Users 返回组织成员分页；指定部门时包含其全部子部门，OnlyUnassigned 时只返回未分配成员。
func (s *Service) Users(ctx context.Context, credential domain.Credential, query domain.UsersQuery) (domain.UserPage, error) {
	if query.Page < 1 || query.PageSize < 1 || query.PageSize > upstreamPageSize {
		return domain.UserPage{}, domain.ErrInvalid
	}
	if query.OnlyUnassigned {
		matched, err := s.unassignedUsers(ctx, credential, query.Keyword)
		if err != nil {
			return domain.UserPage{}, err
		}
		return slicePage(matched, query.Page, query.PageSize), nil
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

// unassignedUsers 逐页拉取上游用户并保留部门 ID 为空或 0 的成员。
func (s *Service) unassignedUsers(
	ctx context.Context,
	credential domain.Credential,
	keyword string,
) ([]json.RawMessage, error) {
	matched := make([]json.RawMessage, 0, 8)
	for page := 1; page <= maxUpstreamPages; page++ {
		result, err := s.repo.Users(ctx, credential, page, upstreamPageSize, keyword)
		if err != nil {
			return nil, err
		}
		for _, raw := range result.List {
			if departmentID(raw) <= 0 {
				matched = append(matched, raw)
			}
		}
		if len(result.List) == 0 || page*upstreamPageSize >= result.Total {
			break
		}
	}
	return matched, nil
}

// UpdateUser 校验编辑字段后透传到元枢；权限由元枢按调用方角色判定。
func (s *Service) UpdateUser(ctx context.Context, credential domain.Credential, id int64, update domain.UserUpdate) error {
	if id <= 0 || !update.Validate() {
		return domain.ErrInvalid
	}
	return s.repo.UpdateUser(ctx, credential, id, update)
}

// UpdateUserStatus 校验状态取值后透传到元枢；权限由元枢按调用方角色判定。
func (s *Service) UpdateUserStatus(ctx context.Context, credential domain.Credential, id int64, update domain.UserStatusUpdate) error {
	if id <= 0 || !update.Validate() {
		return domain.ErrInvalid
	}
	return s.repo.UpdateUserStatus(ctx, credential, id, update)
}

// UpdateUserRoles 校验角色 ID 后透传到元枢；权限由元枢按调用方角色判定。
func (s *Service) UpdateUserRoles(ctx context.Context, credential domain.Credential, id int64, update domain.UserRolesUpdate) error {
	if id <= 0 || !update.Validate() {
		return domain.ErrInvalid
	}
	return s.repo.UpdateUserRoles(ctx, credential, id, update)
}

// Roles 返回当前租户的角色列表；仅保留启用状态的角色供编辑弹窗选择。
func (s *Service) Roles(ctx context.Context, credential domain.Credential) ([]domain.Role, error) {
	roles, err := s.repo.Roles(ctx, credential)
	if err != nil {
		return nil, err
	}
	enabled := make([]domain.Role, 0, len(roles))
	for _, role := range roles {
		if role.Status == 1 {
			enabled = append(enabled, role)
		}
	}
	return enabled, nil
}

// DeleteUser 透传成员删除到元枢；权限由元枢按调用方角色判定。
func (s *Service) DeleteUser(ctx context.Context, credential domain.Credential, id int64) error {
	if id <= 0 {
		return domain.ErrInvalid
	}
	return s.repo.DeleteUser(ctx, credential, id)
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
