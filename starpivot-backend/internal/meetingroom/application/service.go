// Package application 编排会议室与预约用例，负责输入校验后委托持久化。
package application

import (
	"context"
	"encoding/json"
	"strings"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/meetingroom/domain"
)

// Repository 抽象会议室与预约的持久化操作。
type Repository interface {
	ListRooms(ctx context.Context, tenant int64, query domain.RoomListQuery) (domain.RoomPage, error)
	CreateRoom(ctx context.Context, tenant, userID int64, draft domain.RoomDraft) (json.RawMessage, error)
	UpdateRoom(ctx context.Context, tenant, id int64, draft domain.RoomDraft) (json.RawMessage, error)
	DisableRoom(ctx context.Context, tenant, id int64) (json.RawMessage, error)
	ListBookings(ctx context.Context, tenant, userID int64, query domain.BookingListQuery) (domain.BookingPage, error)
	CreateBooking(ctx context.Context, tenant, userID int64, draft domain.BookingDraft) (json.RawMessage, error)
	CancelBooking(ctx context.Context, tenant, id, userID int64, admin bool, reason string) (json.RawMessage, error)
}

// Service 提供会议室维护与预约的用例入口。
type Service struct {
	repo Repository
}

// New 绑定会议室用例的持久化实现。
func New(repo Repository) *Service { return &Service{repo: repo} }

// ListRooms 返回当前租户的会议室列表。
func (s *Service) ListRooms(ctx context.Context, tenant int64, query domain.RoomListQuery) (domain.RoomPage, error) {
	if !query.Valid() {
		return domain.RoomPage{}, domain.ErrInvalid
	}
	return s.repo.ListRooms(ctx, tenant, query)
}

// CreateRoom 由管理员登记新会议室。
func (s *Service) CreateRoom(ctx context.Context, tenant, userID int64, draft domain.RoomDraft) (json.RawMessage, error) {
	draft, err := draft.Normalize()
	if err != nil {
		return nil, err
	}
	return s.repo.CreateRoom(ctx, tenant, userID, draft)
}

// UpdateRoom 更新会议室的可编辑字段。
func (s *Service) UpdateRoom(ctx context.Context, tenant, id int64, draft domain.RoomDraft) (json.RawMessage, error) {
	draft, err := draft.Normalize()
	if err != nil {
		return nil, err
	}
	return s.repo.UpdateRoom(ctx, tenant, id, draft)
}

// DisableRoom 停用会议室，停用后不可再预约。
func (s *Service) DisableRoom(ctx context.Context, tenant, id int64) (json.RawMessage, error) {
	return s.repo.DisableRoom(ctx, tenant, id)
}

// ListBookings 按日期、会议室或本人条件分页返回预约记录。
func (s *Service) ListBookings(ctx context.Context, tenant, userID int64, query domain.BookingListQuery) (domain.BookingPage, error) {
	if !query.Valid() {
		return domain.BookingPage{}, domain.ErrInvalid
	}
	return s.repo.ListBookings(ctx, tenant, userID, query)
}

// CreateBooking 预约会议室，同一时段重复预约将返回冲突错误。
func (s *Service) CreateBooking(ctx context.Context, tenant, userID int64, draft domain.BookingDraft) (json.RawMessage, error) {
	draft, err := draft.Normalize()
	if err != nil {
		return nil, err
	}
	return s.repo.CreateBooking(ctx, tenant, userID, draft)
}

// CancelBooking 取消预约，仅预约人或管理员可执行。
func (s *Service) CancelBooking(ctx context.Context, tenant, id, userID int64, admin bool, reason string) (json.RawMessage, error) {
	reason = strings.TrimSpace(reason)
	if !utf8.ValidString(reason) || utf8.RuneCountInString(reason) > 500 {
		return nil, domain.ErrInvalid
	}
	return s.repo.CancelBooking(ctx, tenant, id, userID, admin, reason)
}
