// Package repository 通过元枢 HTTP 接口读取组织架构，不直接连接系统库。
package repository

import (
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
