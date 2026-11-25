// Package repository 通过元枢 HTTP 接口读取组织架构，不直接连接系统库。
package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"starpivot.local/deepseek-harness-backend/internal/organization/domain"
)

const upstreamBodyLimit = 8 << 20

// Client 复用同一份元枢凭证读取部门树与用户列表。
type Client struct {
	tree  *url.URL
	users *url.URL
	roles *url.URL
	http  *http.Client
}

// New 根据元枢接口根地址构造读取客户端；地址不可用时返回错误。
func New(apiBase string, client *http.Client) (*Client, error) {
	base, err := url.Parse(strings.TrimRight(apiBase, "/"))
	if err != nil || (base.Scheme != "http" && base.Scheme != "https") || base.Host == "" {
		return nil, errors.New("元枢组织架构接口地址不可用")
	}
	if client == nil {
		client = &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &Client{
		tree:  base.JoinPath("api/v1/departments/tree"),
		users: base.JoinPath("api/v1/users"),
		roles: base.JoinPath("api/v1/roles"),
		http:  client,
	}, nil
}

// envelope 是元枢接口的统一响应信封。
type envelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// DepartmentTree 读取当前租户的部门层级树。
func (c *Client) DepartmentTree(ctx context.Context, credential domain.Credential) ([]domain.Department, error) {
	var data []domain.Department
	if err := c.fetch(ctx, c.tree, credential, &data); err != nil {
		return nil, err
	}
	if data == nil {
		data = []domain.Department{}
	}
	return data, nil
}

// Users 分页读取用户列表，keyword 为空时不附加筛选条件。
func (c *Client) Users(
	ctx context.Context,
	credential domain.Credential,
	page, pageSize int,
	keyword string,
) (domain.UserPage, error) {
	target := *c.users
	query := url.Values{}
	query.Set("page", strconv.Itoa(page))
	query.Set("page_size", strconv.Itoa(pageSize))
	if keyword != "" {
		query.Set("keyword", keyword)
	}
	target.RawQuery = query.Encode()
	var data domain.UserPage
	if err := c.fetch(ctx, &target, credential, &data); err != nil {
		return domain.UserPage{}, err
	}
	if data.List == nil {
		data.List = []json.RawMessage{}
	}
	return data, nil
}

// fetch 使用调用方凭证请求元枢接口，并校验响应信封。
func (c *Client) fetch(ctx context.Context, target *url.URL, credential domain.Credential, into any) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return domain.ErrUnavailable
	}
	request.Header.Set("Authorization", "Bearer "+credential.Token)
	request.Header.Set("Accept", "application/json")
	if credential.TenantCode != "" {
		request.Header.Set("X-Active-Tenant", credential.TenantCode)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return domain.ErrUnavailable
	}
	defer response.Body.Close()
	body := io.LimitReader(response.Body, upstreamBodyLimit)
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		_, _ = io.Copy(io.Discard, body)
		return domain.ErrUnauthorized
	}
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, body)
		return domain.ErrUnavailable
	}
	var result envelope
	if err := json.NewDecoder(body).Decode(&result); err != nil {
		return domain.ErrUnavailable
	}
	if result.Code == http.StatusUnauthorized || result.Code == http.StatusForbidden {
		return domain.ErrUnauthorized
	}
	if result.Code != http.StatusOK || len(result.Data) == 0 {
		return domain.ErrUnavailable
	}
	if err := json.Unmarshal(result.Data, into); err != nil {
		return domain.ErrUnavailable
	}
	return nil
}

// UpdateUser 透传成员资料编辑到元枢 PUT /api/v1/users/{id}，字段语义与元枢契约一致。
func (c *Client) UpdateUser(ctx context.Context, credential domain.Credential, id int64, update domain.UserUpdate) error {
	payload := map[string]string{"nickname": update.Nickname, "email": update.Email}
	if update.Phone != "" {
		payload["phone"] = update.Phone
	}
	return c.write(ctx, http.MethodPut, c.userPath(id), credential, payload)
}

// UpdateUserStatus 透传成员启用状态到元枢 PUT /api/v1/users/{id}/status。
func (c *Client) UpdateUserStatus(ctx context.Context, credential domain.Credential, id int64, update domain.UserStatusUpdate) error {
	return c.write(ctx, http.MethodPut, c.userPath(id).JoinPath("status"), credential, map[string]int{"status": update.Status})
}

// UpdateUserRoles 透传成员角色分配到元枢 POST /api/v1/users/{id}/roles。
func (c *Client) UpdateUserRoles(ctx context.Context, credential domain.Credential, id int64, update domain.UserRolesUpdate) error {
	return c.write(ctx, http.MethodPost, c.userPath(id).JoinPath("roles"), credential, map[string][]int64{"role_ids": update.RoleIDs})
}

// rolesPageLimit 是角色列表单页规模；租户角色数量有限，单页即可取全。
const rolesPageLimit = 100

// Roles 分页读取当前租户的角色列表，供成员编辑弹窗选择。
func (c *Client) Roles(ctx context.Context, credential domain.Credential) ([]domain.Role, error) {
	var collected []domain.Role
	for page := 1; page <= maxRolePages; page++ {
		target := *c.roles
		query := url.Values{}
		query.Set("page", strconv.Itoa(page))
		query.Set("page_size", strconv.Itoa(rolesPageLimit))
		target.RawQuery = query.Encode()
		var data struct {
			List  []domain.Role `json:"list"`
			Total int           `json:"total"`
		}
		if err := c.fetch(ctx, &target, credential, &data); err != nil {
			return nil, err
		}
		collected = append(collected, data.List...)
		if len(data.List) == 0 || page*rolesPageLimit >= data.Total {
			break
		}
	}
	if collected == nil {
		collected = []domain.Role{}
	}
	return collected, nil
}

// maxRolePages 限制角色列表最多翻页数，防止异常上游导致无限拉取。
const maxRolePages = 5

// DeleteUser 透传成员删除到元枢 DELETE /api/v1/users/{id}。
func (c *Client) DeleteUser(ctx context.Context, credential domain.Credential, id int64) error {
	return c.write(ctx, http.MethodDelete, c.userPath(id), credential, nil)
}

// userPath 构造单个用户的元枢接口地址。
func (c *Client) userPath(id int64) *url.URL {
	return c.users.JoinPath(strconv.FormatInt(id, 10))
}

// write 发送写请求：2xx 视为成功，401/403 映射为鉴权错误，其余状态码携带上游信息透传。
func (c *Client) write(
	ctx context.Context,
	method string,
	target *url.URL,
	credential domain.Credential,
	payload any,
) error {
	var reader io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return domain.ErrUnavailable
		}
		reader = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, target.String(), reader)
	if err != nil {
		return domain.ErrUnavailable
	}
	request.Header.Set("Authorization", "Bearer "+credential.Token)
	request.Header.Set("Accept", "application/json")
	if payload != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if credential.TenantCode != "" {
		request.Header.Set("X-Active-Tenant", credential.TenantCode)
	}
	response, err := c.http.Do(request)
	if err != nil {
		return domain.ErrUnavailable
	}
	defer response.Body.Close()
	message := upstreamMessage(io.LimitReader(response.Body, upstreamBodyLimit))
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return domain.ErrUnauthorized
	}
	if response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices {
		return nil
	}
	return &domain.UpstreamError{Status: response.StatusCode, Message: message}
}

// upstreamMessage 尽力读取元枢错误信封中的中文提示，读取失败时返回空串。
func upstreamMessage(body io.Reader) string {
	var result envelope
	if json.NewDecoder(body).Decode(&result) != nil {
		return ""
	}
	return strings.TrimSpace(result.Message)
}
