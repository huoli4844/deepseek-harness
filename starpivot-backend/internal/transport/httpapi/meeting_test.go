// 本文件验证会议室与预约接口的路由、身份、管理员白名单和事务冲突行为。
package httpapi

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/application"
	"starpivot.local/deepseek-harness-backend/internal/meetingroom/repository"
)

const meetingTestKey = "11234567890123456789012345678901"

// meetingMux 组装会议室与预约路由，admins 为空时无人可维护会议室。
func meetingMux(service *application.Service, admins []int64) *http.ServeMux {
	mux := http.NewServeMux()
	gateway := NewLocalCustomerGateway([32]byte([]byte(meetingTestKey)))
	RegisterMeetingRooms(mux, service, WithTemporaryTenantReads(gateway, 3), admins)
	RegisterMeetingBookings(mux, service, WithTemporaryTenantReads(gateway, 3), admins)
	return mux
}

// meetingRequest 发送带网关身份的请求，校验状态码并返回响应 data 字段。
func meetingRequest(t *testing.T, mux *http.ServeMux, method, url, scope, body string, status int) json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(method, url, strings.NewReader(body))
	req.RemoteAddr = "127.0.0.1:34567"
	if scope != "" {
		req.Header.Set("X-Starpivot-Gateway-Key", meetingTestKey)
		req.Header.Set("X-Starpivot-Tenant-Id", "3")
		req.Header.Set("X-Starpivot-User-Id", "8")
		req.Header.Set("X-Starpivot-Customer-Access", scope)
	}
	res := httptest.NewRecorder()
	mux.ServeHTTP(res, req)
	if res.Code != status {
		t.Fatalf("%s %s 应返回 %d，实际为 %d %s", method, url, status, res.Code, res.Body.String())
	}
	if status != 200 {
		return nil
	}
	var envelope struct {
		Code int             `json:"code"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &envelope); err != nil || envelope.Code != 0 {
		t.Fatalf("成功响应格式错误：%s (%v)", res.Body.String(), err)
	}
	return envelope.Data
}

func TestMeetingRouteGuards(t *testing.T) {
	mux := meetingMux(application.New(nil), nil)
	meetingRequest(t, mux, "PATCH", meetingRoomPath, "", "", 405)
	meetingRequest(t, mux, "GET", meetingBookingPath+"/1", "", "", 404)
	meetingRequest(t, mux, "POST", meetingRoomPath, "", "", 401)
	meetingRequest(t, mux, "POST", meetingRoomPath, "read", `{"name":"X","capacity":1}`, 403)
	// 管理员身份依赖白名单，白名单为空时即使有写权限也不能维护会议室。
	adminMux := meetingMux(application.New(nil), []int64{8})
	meetingRequest(t, adminMux, "POST", meetingRoomPath, "write", `{"name":"","capacity":0}`, 400)
	meetingRequest(t, adminMux, "PUT", meetingRoomPath+"/1", "write", `{"name":"X"}`, 400)
	meetingRequest(t, adminMux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"t","meeting_date":"2026-03-05","start_time":"9:00","end_time":"10:00"}`, 400)
	meetingRequest(t, adminMux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"t","meeting_date":"2026-03-05","start_time":"10:00","end_time":"09:00"}`, 400)
	meetingRequest(t, adminMux, "POST", meetingBookingPath+"/0/cancel", "write", `{}`, 400)
	meetingRequest(t, adminMux, "GET", meetingRoomPath+"?status=bogus", "", "", 400)
	meetingRequest(t, adminMux, "GET", meetingBookingPath+"?date=2026/03/05", "", "", 400)
	meetingRequest(t, adminMux, "GET", meetingBookingPath+"?mine=2", "", "", 400)
}

func TestMeetingPostgresFlow(t *testing.T) {
	pool := meetingTestPool(t)
	mux := meetingMux(application.New(repository.New(pool)), []int64{8})
	rooms := meetingRequest(t, mux, "GET", meetingRoomPath, "", "", 200)
	var list struct {
		Items []json.RawMessage `json:"items"`
		Admin bool              `json:"admin"`
	}
	if err := json.Unmarshal(rooms, &list); err != nil || !list.Admin || len(list.Items) != 2 {
		t.Fatalf("会议室列表应含两间并标记管理员：%s (%v)", rooms, err)
	}
	added := meetingRequest(t, mux, "POST", meetingRoomPath, "write",
		`{"name":"新增厅","capacity":8,"location":" 研发楼 2F "}`, 200)
	var room struct {
		ID       int64  `json:"id"`
		Location string `json:"location"`
	}
	if err := json.Unmarshal(added, &room); err != nil || room.ID <= 3 || room.Location != "研发楼 2F" {
		t.Fatalf("新增会议室返回错误：%s (%v)", added, err)
	}
	meetingRequest(t, mux, "POST", meetingRoomPath, "write", `{"name":"湖畔厅","capacity":9}`, 409)
	meetingRequest(t, mux, "PUT", fmt.Sprintf("%s/%d", meetingRoomPath, room.ID), "write",
		`{"name":"改名厅","capacity":12}`, 200)
	// 预约流程：创建、重叠冲突、相邻时段不冲突、停用与其他租户会议室不可约。
	first := meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"评审会","meeting_date":"2026-03-05","start_time":"09:00","end_time":"10:00","attendee_count":6}`, 200)
	var booking struct {
		ID       int64  `json:"id"`
		RoomName string `json:"room_name"`
		Status   string `json:"status"`
	}
	if err := json.Unmarshal(first, &booking); err != nil || booking.ID == 0 ||
		booking.RoomName != "湖畔厅" || booking.Status != "booked" {
		t.Fatalf("预约返回错误：%s (%v)", first, err)
	}
	meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"重叠会","meeting_date":"2026-03-05","start_time":"09:30","end_time":"10:30"}`, 409)
	second := meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"衔接会","meeting_date":"2026-03-05","start_time":"10:00","end_time":"11:00"}`, 200)
	var adjacent struct{ ID int64 }
	if err := json.Unmarshal(second, &adjacent); err != nil || adjacent.ID == booking.ID {
		t.Fatalf("相邻时段应可预约：%s", second)
	}
	meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":2,"title":"停用室","meeting_date":"2026-03-05","start_time":"09:00","end_time":"10:00"}`, 409)
	meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":3,"title":"跨租户","meeting_date":"2026-03-05","start_time":"09:00","end_time":"10:00"}`, 404)
	// 取消权限与状态：预约人本人可取消，重复取消返回冲突。
	meetingRequest(t, mux, "POST", meetingBookingPath+"/1/cancel", "write", `{"cancel_reason":"跨租户"}`, 404)
	meetingRequest(t, mux, "POST", fmt.Sprintf("%s/%d/cancel", meetingBookingPath, booking.ID), "write",
		`{"cancel_reason":"改期"}`, 200)
	meetingRequest(t, mux, "POST", fmt.Sprintf("%s/%d/cancel", meetingBookingPath, booking.ID), "write", `{}`, 409)
	assertBookingQuery(t, mux, "?date=2026-03-05&room_id=1", 2)
	assertBookingQuery(t, mux, "?mine=1", 2)
	// 停用后不可再预约。
	meetingRequest(t, mux, "DELETE", fmt.Sprintf("%s/%d", meetingRoomPath, room.ID), "write", "", 200)
	meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		fmt.Sprintf(`{"room_id":%d,"title":"x","meeting_date":"2026-03-05","start_time":"15:00","end_time":"16:00"}`, room.ID), 409)
	meetingRequest(t, mux, "POST", meetingBookingPath, "write",
		`{"room_id":1,"title":"下午会","meeting_date":"2026-03-05","start_time":"15:00","end_time":"16:00"}`, 200)
}

func assertBookingQuery(t *testing.T, mux *http.ServeMux, query string, total int64) {
	t.Helper()
	data := meetingRequest(t, mux, "GET", meetingBookingPath+query, "", "", 200)
	var page struct {
		Items []struct {
			Title string `json:"title"`
		} `json:"items"`
		Total int64 `json:"total"`
	}
	if err := json.Unmarshal(data, &page); err != nil || page.Total != total || len(page.Items) != int(total) {
		t.Fatalf("预约分页错误：%s (%v)", data, err)
	}
}

func meetingTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DSH_MEETING_TEST_ADMIN_URL")
	if dsn == "" {
		t.Skip("未配置本机隔离测试数据库")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || !net.ParseIP(cfg.ConnConfig.Host).IsLoopback() || len(cfg.ConnConfig.Fallbacks) != 0 || cfg.ConnConfig.Database != "postgres" {
		t.Fatal("测试连接必须为禁用 TLS 的单一回环地址，管理库必须为 postgres")
	}
	pool, err := pgxpool.NewWithConfig(t.Context(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	for _, path := range []string{"../../../migrations/0006_meeting_rooms.sql", "testdata/meeting.sql"} {
		sql, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(t.Context(), string(sql)); err != nil {
			t.Fatalf("执行 %s 失败：%v", path, err)
		}
	}
	return pool
}
