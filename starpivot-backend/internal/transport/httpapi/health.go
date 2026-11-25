// 本包负责 HTTP 路由和响应编码，不访问业务数据或基础设施。
package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

type healthData struct {
	Status string `json:"status"`
}

type healthResponse struct {
	Code    int        `json:"code"`
	Message string     `json:"message"`
	Data    healthData `json:"data"`
}

// RegisterHealth 注册应用级存活探针，不执行数据库或其他依赖检查。
func RegisterHealth(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/apps/deepseek-harness/health", getHealth)
}

func getHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := json.NewEncoder(w).Encode(healthResponse{
		Code:    0,
		Message: "服务进程正常运行",
		Data:    healthData{Status: "ok"},
	}); err != nil {
		slog.WarnContext(r.Context(), "写入健康检查响应失败", "error", err)
	}
}
