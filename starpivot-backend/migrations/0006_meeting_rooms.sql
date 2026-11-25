-- 新建会议室主数据表和会议室预约记录表，供会议室管理及预约功能使用。
-- 时间重叠防重由应用层在同一事务内校验后写入，数据库不做排他约束。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.mtg_meeting_rooms (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_tenant_id bigint NOT NULL,
    name varchar(100) NOT NULL,
    location varchar(200),
    capacity integer NOT NULL,
    equipment text,
    status varchar(20) NOT NULL DEFAULT 'available',
    remark text,
    created_by bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mtg_meeting_rooms_tenant_name_key UNIQUE (business_tenant_id, name),
    CONSTRAINT mtg_meeting_rooms_capacity_check CHECK (capacity > 0),
    CONSTRAINT mtg_meeting_rooms_status_check CHECK (status IN ('available', 'disabled'))
);

CREATE TABLE public.mtg_room_bookings (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_tenant_id bigint NOT NULL,
    room_id bigint NOT NULL REFERENCES public.mtg_meeting_rooms (id),
    title varchar(200) NOT NULL,
    meeting_date date NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    organizer_id bigint NOT NULL,
    attendee_count integer,
    status varchar(20) NOT NULL DEFAULT 'booked',
    cancel_reason text,
    created_by bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT mtg_room_bookings_room_time_check CHECK (end_time > start_time AND isfinite(meeting_date)),
    CONSTRAINT mtg_room_bookings_attendee_check CHECK (attendee_count IS NULL OR attendee_count > 0),
    CONSTRAINT mtg_room_bookings_status_check CHECK (status IN ('booked', 'cancelled', 'completed'))
);

CREATE INDEX mtg_room_bookings_room_date_idx
    ON public.mtg_room_bookings (business_tenant_id, room_id, meeting_date);

COMMENT ON TABLE public.mtg_meeting_rooms IS '会议室主数据表，登记各租户的会议室名称、位置、容纳人数和可用状态';
COMMENT ON COLUMN public.mtg_meeting_rooms.id IS '会议室主键，由数据库生成';
COMMENT ON COLUMN public.mtg_meeting_rooms.business_tenant_id IS '所属业务租户 ID';
COMMENT ON COLUMN public.mtg_meeting_rooms.name IS '会议室名称，同一租户内唯一';
COMMENT ON COLUMN public.mtg_meeting_rooms.location IS '会议室位置（园区、楼层或房间号），NULL 表示未填写';
COMMENT ON COLUMN public.mtg_meeting_rooms.capacity IS '会议室可容纳人数，必须大于 0';
COMMENT ON COLUMN public.mtg_meeting_rooms.equipment IS '配套设备说明（投影、视频会议、白板等），NULL 表示未填写';
COMMENT ON COLUMN public.mtg_meeting_rooms.status IS 'available 表示可用、可预约（默认值），disabled 表示已停用、不可新预约';
COMMENT ON COLUMN public.mtg_meeting_rooms.remark IS '备注说明，NULL 表示未填写';
COMMENT ON COLUMN public.mtg_meeting_rooms.created_by IS '创建人的元枢用户 ID';
COMMENT ON COLUMN public.mtg_meeting_rooms.created_at IS '首次创建时间，默认当前时间';
COMMENT ON COLUMN public.mtg_meeting_rooms.updated_at IS '最近一次更新时间，创建时默认为当前时间，更新时由服务维护';

COMMENT ON TABLE public.mtg_room_bookings IS '会议室预约记录表，登记会议室的会议主题、起止时间、预约人和状态';
COMMENT ON COLUMN public.mtg_room_bookings.id IS '预约记录主键，由数据库生成';
COMMENT ON COLUMN public.mtg_room_bookings.business_tenant_id IS '所属业务租户 ID';
COMMENT ON COLUMN public.mtg_room_bookings.room_id IS '预约的会议室 ID，关联 public.mtg_meeting_rooms.id';
COMMENT ON COLUMN public.mtg_room_bookings.title IS '会议主题';
COMMENT ON COLUMN public.mtg_room_bookings.meeting_date IS '会议日期，按北京时间确定';
COMMENT ON COLUMN public.mtg_room_bookings.start_time IS '会议开始时间（不含日期、不带时区），按北京时间填写，须早于结束时间';
COMMENT ON COLUMN public.mtg_room_bookings.end_time IS '会议结束时间（不含日期、不带时区），按北京时间填写，须晚于开始时间';
COMMENT ON COLUMN public.mtg_room_bookings.organizer_id IS '预约人的元枢用户 ID';
COMMENT ON COLUMN public.mtg_room_bookings.attendee_count IS '参会人数，NULL 表示未填写';
COMMENT ON COLUMN public.mtg_room_bookings.status IS 'booked 表示已预约（默认值），cancelled 表示已取消，completed 表示会议已结束';
COMMENT ON COLUMN public.mtg_room_bookings.cancel_reason IS '取消原因，NULL 表示未取消或未填写';
COMMENT ON COLUMN public.mtg_room_bookings.created_by IS '创建人的元枢用户 ID';
COMMENT ON COLUMN public.mtg_room_bookings.created_at IS '首次创建时间，默认当前时间';
COMMENT ON COLUMN public.mtg_room_bookings.updated_at IS '最近一次更新时间，创建时默认为当前时间，更新时由服务维护';

COMMIT;
