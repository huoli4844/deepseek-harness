// Package config 读取后台进程配置，不包含业务规则和数据库操作。
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

const defaultPath = "config/local.json"

// Config 是后台进程运行配置。
type Config struct {
	Address               string `json:"address"`
	DatabaseURL           string `json:"database_url"`
	GatewayKey            string `json:"gateway_key"`
	DatabaseSSLMode       string `json:"database_ssl_mode"`
	TemporaryReadTenantID int64  `json:"temporary_read_tenant_id"`
	// IdentityAPI 是元枢身份接口根地址，用于本机宿主直连时校验 Bearer 凭证。
	IdentityAPI string `json:"identity_api"`
	// MeetingRoomAdminIDs 是允许维护会议室的管理员用户 ID 白名单，为空表示无人可维护。
	MeetingRoomAdminIDs []int64 `json:"meeting_room_admin_ids"`
}

// Load 从配置文件加载配置，并允许环境变量覆盖部署相关字段。
func Load() (Config, error) {
	path := os.Getenv("DSH_BACKEND_CONFIG")
	if path == "" {
		path = defaultPath
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) && os.Getenv("DSH_BACKEND_DATABASE_URL") == "" {
			return Config{Address: "127.0.0.1:3081"}, nil
		}
		return Config{}, fmt.Errorf("读取后台配置失败：%w", err)
	}
	var value Config
	if err := json.Unmarshal(content, &value); err != nil {
		return Config{}, fmt.Errorf("解析后台配置失败：%w", err)
	}
	if value.Address == "" {
		value.Address = "127.0.0.1:3081"
	}
	if override := os.Getenv("DSH_BACKEND_ADDR"); override != "" {
		value.Address = override
	}
	if override := os.Getenv("DSH_BACKEND_DATABASE_URL"); override != "" {
		value.DatabaseURL = override
	}
	if override := os.Getenv("DSH_BACKEND_GATEWAY_KEY"); override != "" {
		value.GatewayKey = override
	}
	if override := os.Getenv("DSH_BACKEND_IDENTITY_API"); override != "" {
		value.IdentityAPI = override
	}
	admins, err := parseAdminIDs(os.Getenv("DSH_BACKEND_MEETING_ROOM_ADMINS"))
	if err != nil {
		return Config{}, err
	}
	if len(admins) > 0 {
		value.MeetingRoomAdminIDs = admins
	}
	if value.DatabaseSSLMode == "" {
		value.DatabaseSSLMode = "disable"
	}
	return value, nil
}

// parseAdminIDs 解析逗号分隔的管理员用户 ID，未配置时返回空列表。
func parseAdminIDs(raw string) ([]int64, error) {
	if raw == "" {
		return nil, nil
	}
	parts := strings.Split(raw, ",")
	ids := make([]int64, 0, len(parts))
	for _, part := range parts {
		id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
		if err != nil || id <= 0 {
			return nil, fmt.Errorf("环境变量 DSH_BACKEND_MEETING_ROOM_ADMINS 只接受正整数 ID 列表：%q", raw)
		}
		ids = append(ids, id)
	}
	return ids, nil
}
