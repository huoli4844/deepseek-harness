-- 为会议室预约测试准备跨租户的种子数据；表结构由迁移 0006 建立后再执行。
INSERT INTO public.mtg_meeting_rooms (business_tenant_id, name, location, capacity, equipment, status, remark, created_by)
VALUES
    (3, '湖畔厅', '研发楼 3F', 10, '投影、白板', 'available', NULL, 1),
    (3, '山景厅', '研发楼 5F', 20, '视频会议', 'disabled', '装修中', 1),
    (4, '其他租户厅', 'B 座 1F', 5, NULL, 'available', NULL, 2);
INSERT INTO public.mtg_room_bookings (business_tenant_id, room_id, title, meeting_date, start_time, end_time, organizer_id, attendee_count, created_by)
VALUES (4, 3, '其他租户例会', '2026-03-05', '10:00', '11:00', 2, 4, 2);
