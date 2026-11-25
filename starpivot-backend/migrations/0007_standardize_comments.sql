-- 统一本工作区新建/编辑表的备注格式：
-- 表备注统一为「XXXXXXX 表」，不在表备注中追加其他说明文字；
-- 状态、枚举、标志位字段备注统一为「值=含义」格式，布尔字段用 true=肯定态，false=否定态 写法。
-- 仅调整本工作区新建或编辑过的表与字段，不改动其他系统的表；备注变更不影响数据与约束。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 表备注：去掉「XXX表」之后的说明尾巴
COMMENT ON TABLE public.prj_project_weekly_reports IS '项目周报表';
COMMENT ON TABLE public.prj_project_weekly_report_items IS '项目周报登记明细表';
COMMENT ON TABLE public.mtg_meeting_rooms IS '会议室表';
COMMENT ON TABLE public.mtg_room_bookings IS '会议室预约记录表';

-- 项目周报表：周报状态改为「值=含义」格式
COMMENT ON COLUMN public.prj_project_weekly_reports.status IS '周报状态：draft=草稿（默认值，可编辑），submitted=已提交（正文锁定）';

-- 项目周报登记明细表：工作类型、完成状态、风险标志改为「值=含义」格式
COMMENT ON COLUMN public.prj_project_weekly_report_items.work_type IS '工作类型：direct=直接工时，indirect=间接工时，meeting=会议，overtime=加班，training=培训';
COMMENT ON COLUMN public.prj_project_weekly_report_items.completion_status IS '登记时填写的完成状态：pending=待处理，in_progress=进行中，completed=已完成，blocked=已阻塞，cancelled=已取消';
COMMENT ON COLUMN public.prj_project_weekly_report_items.has_risk IS '风险标志：true=存在风险，false=不存在风险';

-- 会议室表与预约记录表：状态改为「值=含义」格式
COMMENT ON COLUMN public.mtg_meeting_rooms.status IS '会议室状态：available=可用（默认值，可预约），disabled=停用（不可新预约）';
COMMENT ON COLUMN public.mtg_room_bookings.status IS '预约状态：booked=已预约（默认值），cancelled=已取消，completed=会议已结束';

-- 客户表（本工作区编辑过的字段）：逻辑删除标志改为 true=肯定态，false=否定态
COMMENT ON COLUMN public.md_customers.is_deleted IS '逻辑删除标志：true=已删除，false=未删除；由删除时间计算，不允许直接写入';

COMMIT;
