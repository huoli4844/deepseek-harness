// Package domain 定义组织架构查询的模型、查询条件与业务错误。
package domain

import (
	"encoding/json"
	"errors"
)

// 组织架构查询错误，由 HTTP 层映射为对应状态码。
var (
	ErrInvalid      = errors.New("组织架构请求参数不合法")
	ErrUnauthorized = errors.New("未取得可信的登录身份")
	ErrUnavailable  = errors.New("元枢组织架构服务暂不可用")
)

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
	Keyword      string
	Page         int
	PageSize     int
}

// UserPage 是用户分页结果；List 保留上游原始字段，避免丢失角色等未声明数据。
type UserPage struct {
	List     []json.RawMessage `json:"list"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
	Total    int               `json:"total"`
}
