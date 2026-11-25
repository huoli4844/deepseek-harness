// 本文件注册会议室维护 HTTP 接口，写操作仅限管理员白名单用户。
package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"starpivot.local/deepseek-harness-backend/internal/meetingroom/application"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/domain"
)

const meetingRoomPath = "/api/v1/apps/deepseek-harness/meeting-rooms"

type meetingRoomHandler struct {
	service *application.Service
	auth    CustomerAuthorizer
	admins  []int64
}

// RegisterMeetingRooms 注册会议室的集合与单项操作。
func RegisterMeetingRooms(mux *http.ServeMux, service *application.Service, auth CustomerAuthorizer, admins []int64) {
	h := meetingRoomHandler{service: service, auth: auth, admins: admins}
	mux.HandleFunc("GET "+meetingRoomPath, h.list)
	mux.HandleFunc("POST "+meetingRoomPath, h.create)
	mux.HandleFunc("PUT "+meetingRoomPath+"/{id}", h.item)
	mux.HandleFunc("DELETE "+meetingRoomPath+"/{id}", h.item)
}

// authorize 校验可信身份；write 同时要求写权限与会议室管理员身份。
func (h meetingRoomHandler) authorize(w http.ResponseWriter, r *http.Request, write bool) (CustomerAccess, bool) {
	access, ok := h.auth.AuthorizeCustomer(r)
	if !ok || access.TenantID <= 0 || (write && access.UserID <= 0) {
		replyCustomer(w, r, http.StatusUnauthorized, "未取得可信的登录身份", nil)
		return CustomerAccess{}, false
	}
	if !write {
		return access, true
	}
	if !access.CanWrite {
		replyCustomer(w, r, http.StatusForbidden, "没有写权限", nil)
		return CustomerAccess{}, false
	}
	if !slices.Contains(h.admins, access.UserID) {
		replyCustomer(w, r, http.StatusForbidden, "没有会议室管理权限", nil)
		return CustomerAccess{}, false
	}
	return access, true
}

func (h meetingRoomHandler) list(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, false)
	if !ok {
		return
	}
	values := r.URL.Query()
	query := domain.RoomListQuery{
		Keyword: strings.TrimSpace(values.Get("keyword")),
		Status:  strings.TrimSpace(values.Get("status")),
	}
	for key := range map[string]bool{"keyword": true, "status": true} {
		if len(values[key]) > 1 {
			finishMeeting(w, r, nil, domain.ErrInvalid)
			return
		}
	}
	if !query.Valid() {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	page, err := h.service.ListRooms(r.Context(), access.TenantID, query)
	if err != nil {
		finishMeeting(w, r, nil, err)
		return
	}
	finishMeeting(w, r, struct {
		Items []json.RawMessage `json:"items"`
		Admin bool              `json:"admin"`
	}{page.Items, slices.Contains(h.admins, access.UserID)}, nil)
}

func (h meetingRoomHandler) create(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	draft, err := decodeMeetingRoom(w, r)
	if err != nil {
		finishMeeting(w, r, nil, err)
		return
	}
	data, err := h.service.CreateRoom(r.Context(), access.TenantID, access.UserID, draft)
	finishMeeting(w, r, data, err)
}

func (h meetingRoomHandler) item(w http.ResponseWriter, r *http.Request) {
	access, ok := h.authorize(w, r, true)
	if !ok {
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		finishMeeting(w, r, nil, domain.ErrInvalid)
		return
	}
	var data json.RawMessage
	switch r.Method {
	case http.MethodPut:
		var draft domain.RoomDraft
		draft, err = decodeMeetingRoom(w, r)
		if err == nil {
			data, err = h.service.UpdateRoom(r.Context(), access.TenantID, id, draft)
		}
	case http.MethodDelete:
		data, err = h.service.DisableRoom(r.Context(), access.TenantID, id)
	}
	finishMeeting(w, r, data, err)
}

func decodeMeetingRoom(w http.ResponseWriter, r *http.Request) (domain.RoomDraft, error) {
	var draft domain.RoomDraft
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
