// 本文件注册会议室预约 HTTP 接口，预约取消仅限预约人或管理员。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"

	"starpivot.local/deepseek-harness-backend/internal/meetingroom/application"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/domain"
)

const meetingBookingPath = "/api/v1/apps/deepseek-harness/meeting-room-bookings"

type meetingBookingHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
	admins  []int64
}

// RegisterMeetingBookings 注册预约的集合查询、创建与取消操作。
func RegisterMeetingBookings(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer, admins []int64) {
	h := meetingBookingHandler{service: service, auth: auth, admins: admins}
	mux.HandleFunc("GET "+meetingBookingPath, h.list)
	mux.HandleFunc("POST "+meetingBookingPath, h.create)
	mux.HandleFunc("POST "+meetingBookingPath+"/{id}/cancel", h.cancel)
}

// authorize 校验可信身份；write 额外要求写权限。
func (h meetingBookingHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if write && !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有预约写权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h meetingBookingHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	page, okPage := pageParam(r, "page", 1)
	size, okSize := pageParam(r, "page_size", 20)
	values := r.URL.Query()
	query := domain.BookingListQuery{
		Date:   values.Get("date"),
		RoomID: parseIDParam(values.Get("room_id")),
		Mine:   values.Get("mine") == "1",
	}
	if !okPage || !okSize || len(values["date"]) > 1 || len(values["room_id"]) > 1 ||
		len(values["mine"]) > 1 || values.Get("mine") != "" && values.Get("mine") != "1" {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	query.Page, query.PageSize = page, size
	data, err := h.service.ListBookings(r.Context(), access.TenantID, access.UserID, query)
	finishMeeting(w, r, data, err)
}

func (h meetingBookingHandler) create(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeMeetingBooking(w, r)
	if err != nil {
		finishMeeting(w, r, nil, err)
		return
	}
	data, err := h.service.CreateBooking(r.Context(), access.TenantID, access.UserID, draft)
	finishMeeting(w, r, data, err)
}

func (h meetingBookingHandler) cancel(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	var body struct {
		CancelReason string `json:"cancel_reason"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	admin := slices.Contains(h.admins, access.UserID)
	data, err := h.service.CancelBooking(r.Context(), access.TenantID, id, access.UserID, admin, body.CancelReason)
	finishMeeting(w, r, data, err)
}

func decodeMeetingBooking(w http.ResponseWriter, r *http.Request) (domain.BookingDraft, error) {
	var draft domain.BookingDraft
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&draft); err != nil {
		return draft, domain.ErrInvalid
	}
	var trailing json.RawMessage
	if err := dec.Decode(&trailing); !errors.Is(err, io.EOF) {
		return draft, domain.ErrInvalid
	}
	return draft, nil
}

func parseIDParam(value string) int64 {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0
	}
	return id
}

// finishMeeting 统一映射会议室域错误到 HTTP 状态码与响应信封。
func finishMeeting(w http.ResponseWriter, r *http.Request, data any, err error) {
	switch {
	case err == nil:
		replyCustomer(w, r, http.StatusOK, "成功", data)
	case errors.Is(err, domain.ErrInvalid):
		replyCustomer(w, r, http.StatusBadRequest, err.Error(), nil)
	case errors.Is(err, domain.ErrNotFound):
		replyCustomer(w, r, http.StatusNotFound, err.Error(), nil)
	case errors.Is(err, domain.ErrForbidden):
		replyCustomer(w, r, http.StatusForbidden, err.Error(), nil)
	case errors.Is(err, domain.ErrConflict), errors.Is(err, domain.ErrRoomDisabled), errors.Is(err, domain.ErrTimeConflict):
		replyCustomer(w, r, http.StatusConflict, err.Error(), nil)
	default:
		slog.ErrorContext(r.Context(), "会议室请求处理失败", "method", r.Method, "path", r.URL.Path)
		replyCustomer(w, r, http.StatusInternalServerError, "会议室服务暂不可用", nil)
	}
}
