// Package domain 定义会议室及预约字段与输入约束，不依赖传输和持久化层。
package domain

import (
	"encoding/json"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	// ErrInvalid 表示会议室或预约字段、查询参数不符合约束。
	ErrInvalid = errors.New("会议室字段或查询参数无效")
	// ErrNotFound 表示当前租户没有该会议室或预约记录。
	ErrNotFound = errors.New("会议室或预约记录不存在")
	// ErrConflict 表示会议室名称重复或预约状态不允许当前操作。
	ErrConflict = errors.New("会议室名称已存在或预约状态不允许当前操作")
	// ErrRoomDisabled 表示会议室已停用，不可新预约。
	ErrRoomDisabled = errors.New("会议室已停用，不可预约")
	// ErrTimeConflict 表示同一会议室在该日期时段已被预约。
	ErrTimeConflict = errors.New("该时间段已被预约")
	// ErrForbidden 表示无权执行该操作。
	ErrForbidden = errors.New("无权执行该操作")
)

// RoomDraft 是会议室可编辑字段。位置、设备与备注可留空。
type RoomDraft struct {
	Name      string  `json:"name"`
	Location  *string `json:"location"`
	Capacity  int32   `json:"capacity"`
	Equipment *string `json:"equipment"`
	Remark    *string `json:"remark"`
}

// Normalize 清理文本并校验会议室字段长度与容量取值。
func (d RoomDraft) Normalize() (RoomDraft, error) {
	fields := []struct {
		target *string
		limit  int
	}{
		{&d.Name, 100}, {d.Location, 200}, {d.Equipment, 500}, {d.Remark, 2000},
	}
	for _, field := range fields {
		if field.target == nil {
			continue
		}
		value := strings.TrimSpace(*field.target)
		if !validText(value, field.limit) {
			return RoomDraft{}, ErrInvalid
		}
		*field.target = value
	}
	if d.Name == "" || d.Capacity <= 0 {
		return RoomDraft{}, ErrInvalid
	}
	return d, nil
}

// BookingDraft 是会议室预约的可填写字段，时间按北京时间、不带时区。
type BookingDraft struct {
	RoomID        int64  `json:"room_id"`
	Title         string `json:"title"`
	MeetingDate   string `json:"meeting_date"`
	StartTime     string `json:"start_time"`
	EndTime       string `json:"end_time"`
	AttendeeCount *int32 `json:"attendee_count"`
}

// Normalize 校验会议主题、日期时间格式和参会人数，并保证结束时间晚于开始时间。
func (d BookingDraft) Normalize() (BookingDraft, error) {
	fields := []struct {
		target *string
		limit  int
	}{
		{&d.Title, 200}, {&d.MeetingDate, 10}, {&d.StartTime, 8}, {&d.EndTime, 8},
	}
	for _, field := range fields {
		value := strings.TrimSpace(*field.target)
		if !validText(value, field.limit) {
			return BookingDraft{}, ErrInvalid
		}
		*field.target = value
	}
	date, dateOK := strictTime(d.MeetingDate, time.DateOnly)
	start, startOK := strictTime(d.StartTime, "15:04")
	end, endOK := strictTime(d.EndTime, "15:04")
	if d.RoomID <= 0 || d.Title == "" || !dateOK || !startOK || !endOK ||
		!end.After(start) || date.Year() < 2000 {
		return BookingDraft{}, ErrInvalid
	}
	if d.AttendeeCount != nil && *d.AttendeeCount <= 0 {
		return BookingDraft{}, ErrInvalid
	}
	return d, nil
}

var roomStates = []string{"", "available", "disabled"}

// RoomListQuery 描述会议室列表的搜索与状态过滤。
type RoomListQuery struct {
	Keyword, Status string
}

// Valid 检查搜索词长度和状态取值。
func (q RoomListQuery) Valid() bool {
	return validText(q.Keyword, 100) && slices.Contains(roomStates, q.Status)
}

// BookingListQuery 描述预约列表的日期、会议室、本人过滤与分页。
type BookingListQuery struct {
	Date     string
	RoomID   int64
	Mine     bool
	Page     int
	PageSize int
}

// Valid 检查分页范围和日期格式。
func (q BookingListQuery) Valid() bool {
	if q.Page < 1 || q.Page > 1000000 || q.PageSize < 1 || q.PageSize > 200 {
		return false
	}
	if q.Date == "" {
		return true
	}
	_, ok := strictTime(q.Date, time.DateOnly)
	return ok
}

// strictTime 严格解析时间文本并要求补零格式，拒绝 "9:00" 等宽松写法。
func strictTime(value, layout string) (time.Time, bool) {
	parsed, err := time.Parse(layout, value)
	return parsed, err == nil && parsed.Format(layout) == value
}

// RoomPage 包含会议室列表。
type RoomPage struct {
	Items []json.RawMessage `json:"items"`
}

// BookingPage 包含当前页预约记录和匹配总数。
type BookingPage struct {
	Items    []json.RawMessage `json:"items"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

func validText(value string, limit int) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, 0) && utf8.RuneCountInString(value) <= limit
}
