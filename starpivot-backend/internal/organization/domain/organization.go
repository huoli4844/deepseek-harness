// Package domain 定义组织架构查询的模型、查询条件与业务错误。
package domain

import (
	"encoding/json"
	"errors"
	"fmt"
)

// 组织架构查询错误，由 HTTP 层映射为对应状态码。
var (
	ErrInvalid      = errors.New("组织架构请求参数不合法")
	ErrUnauthorized = errors.New("未取得可信的登录身份")
	ErrUnavailable  = errors.New("元枢组织架构服务暂不可用")
)

// UpstreamError 携带上游响应状态码与错误信息，HTTP 层原样透传给客户端。
type UpstreamError struct {
	Status  int
	Message string
}

// Error 实现error接口，返回上游错误信息。
func (e *UpstreamError) Error() string {
	if e.Message == "" {
		return fmt.Sprintf("元枢接口返回状态码 %d", e.Status)
	}
	return e.Message
}

// Credential 是调用元枢组织架构接口所需的原始登录凭证。
type Credential struct {
	Token      string
	TenantCode string
}

// Department 是组织架构树节点，字段与元枢部门接口保持一致。
type Department struct {
	ID       int64  `json:"id"`
	TenantID int64  `json:"tenant_id"`
	Name     string `json:"name"`
	Code     string `json:"code"`
	ParentID int64  `json:"parent_id"`
	Leader   string `json:"leader"`
	Sort     int    `json:"sort"`
	Status   int    `json:"status"`
	// TotalMembers 是本部门及其全部子部门的成员总数，由本服务按用户列表统计。
	TotalMembers int          `json:"total_members"`
	Children     []Department `json:"children,omitempty"`
}

// UsersQuery 是部门用户列表的查询条件。
type UsersQuery struct {
	// DepartmentID 大于 0 时按该部门及其子部门过滤，否则查询全部成员。
	DepartmentID int64
	// OnlyUnassigned 为 true 时只返回未分配部门（部门 ID 为空或 0）的成员。
	OnlyUnassigned bool
	Keyword        string
	Page           int
	PageSize       int
}

// UserPage 是用户分页结果；List 保留上游原始字段，避免丢失角色等未声明数据。
type UserPage struct {
	List     []json.RawMessage `json:"list"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Total    int               `json:"total"`
}

// TreeSnapshot 是组织架构树及未分配成员统计；Departments 与元枢部门树结构一致。
type TreeSnapshot struct {
	Departments []Department `json:"departments"`
	// UnassignedCount 是部门 ID 为空或 0 的成员数量，这些成员不出现在任何部门子树统计中。
	UnassignedCount int `json:"unassigned_count"`
}

// UserUpdate 是成员资料编辑允许修改的字段，字段语义与元枢 PUT /api/v1/users/{id} 保持一致。
type UserUpdate struct {
	// Nickname 是成员姓名，不能为空白。
	Nickname string
	// Email 是成员邮箱；元枢要求该字段必填且必须为合法邮箱，即使原本为空也需补填。
	Email string
	// Phone 是成员手机号；元枢不支持清空，留空表示保持原值不变。
	Phone string
}

// Validate 校验编辑字段；昵称与邮箱必填，长度限制防止透传异常负载。
func (u UserUpdate) Validate() bool {
	return u.Nickname != "" && u.Email != "" && len(u.Nickname) <= 100 &&
		len(u.Email) <= 200 && len(u.Phone) <= 50
}

// UserStatusUpdate 是成员启用状态编辑负载；状态语义与元枢 PUT /api/v1/users/{id}/status 保持一致。
type UserStatusUpdate struct {
	// Status 取 1 表示启用、0 表示停用，其余值元枢拒绝。
	Status int
}

// Validate 校验状态取值。
func (u UserStatusUpdate) Validate() bool {
	return u.Status == 0 || u.Status == 1
}

// UserRolesUpdate 是成员角色分配负载，语义与元枢 POST /api/v1/users/{id}/roles 保持一致。
type UserRolesUpdate struct {
	// RoleIDs 是要授予的角色 ID 集合；空集合表示清空该成员的全部角色。
	RoleIDs []int64
}

// Validate 校验角色 ID 均为正数且数量不超过元枢单租户角色规模。
func (u UserRolesUpdate) Validate() bool {
	if len(u.RoleIDs) > 64 {
		return false
	}
	for _, id := range u.RoleIDs {
		if id <= 0 {
			return false
		}
	}
	return true
}

// Role 是元枢角色列表条目，仅保留编辑弹窗展示所需字段。
type Role struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Code   string `json:"code"`
	Status int    `json:"status"`
}
