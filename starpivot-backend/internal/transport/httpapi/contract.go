// 本文件注册合同台账 HTTP 接口，租户由现有可信网关机制确定。
package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
	"starpivot.local/deepseek-harness-backend/internal/contract/application"
	"starpivot.local/deepseek-harness-backend/internal/contract/domain"
)

const contractPath = "/api/v1/apps/deepseek-harness/contracts"

type contractHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
}

// RegisterContracts 注册合同台账的只读列表接口。
func RegisterContracts(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer) {
	h := contractHandler{service: service, auth: auth}
	mux.HandleFunc("GET "+contractPath, h.list)
}

func (h contractHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	values := r.URL.Query()
	query := archivequery.Query{}
	fields := map[string]*string{
		"keyword": &query.Keyword, "sort_by": &query.SortBy, "sort_direction": &query.SortDirection,
	}
	for key, target := range fields {
		if len(values[key]) > 1 {
			finishContract(w, r, nil, domain.ErrInvalid)
			return
		}
		*target = strings.TrimSpace(values.Get(key))
	}
	if !okPage || !okSize {
		finishContract(w, r, nil, domain.ErrInvalid)
		return
	}
	data, err := h.service.List(r.Context(), access.TenantID,
		domain.ListQuery{Query: query, Page: page, PageSize: size})
	finishContract(w, r, data, err)
}

func finishContract(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyCustomer(w, r, http.StatusBadRequest, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "合同台账请求处理失败", "method", r.Method, "path", r.URL.Path)
		replyCustomer(w, r, http.StatusInternalServerError, "合同台账暂不可用", nil)
	}
}
