BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.prj_project_weekly_report_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    report_id bigint NOT NULL REFERENCES public.prj_project_weekly_reports (id),
    user_id bigint NOT NULL CHECK (user_id > 0),
    task_id bigint NOT NULL REFERENCES public.prj_project_tasks (id),
    work_type varchar(30) NOT NULL CHECK (work_type IN ('direct', 'indirect', 'meeting', 'overtime', 'training')),
    completion_status varchar(20) NOT NULL CHECK (
        completion_status IN ('pending', 'in_progress', 'completed', 'blocked', 'cancelled')
    ),
    has_risk boolean NOT NULL,
    risk_details text CHECK (has_risk OR risk_details IS NULL)
);

CREATE INDEX prj_project_weekly_report_items_user_report_idx
    ON public.prj_project_weekly_report_items (user_id, report_id);

COMMENT ON TABLE public.prj_project_weekly_report_items IS '项目周报登记明细，按周报和员工记录项目任务进展及风险';
COMMENT ON COLUMN public.prj_project_weekly_report_items.id IS '周报登记明细主键，由数据库生成';
COMMENT ON COLUMN public.prj_project_weekly_report_items.report_id IS '所属项目周报 ID，关联 public.prj_project_weekly_reports.id，项目、租户与自然周由该周报确定';
COMMENT ON COLUMN public.prj_project_weekly_report_items.user_id IS '登记员工的元枢用户 ID，由可信登录身份确定';
COMMENT ON COLUMN public.prj_project_weekly_report_items.task_id IS '所选项目任务 ID，关联 public.prj_project_tasks.id，必须与周报属于同一项目及租户';
COMMENT ON COLUMN public.prj_project_weekly_report_items.work_type IS '工作类型：direct 为直接工时，indirect 为间接工时，meeting 为会议，overtime 为加班，training 为培训';
COMMENT ON COLUMN public.prj_project_weekly_report_items.completion_status IS '登记时填写的完成状态：pending 为待处理，in_progress 为进行中，completed 为已完成，blocked 为已阻塞，cancelled 为已取消';
COMMENT ON COLUMN public.prj_project_weekly_report_items.has_risk IS '风险标志：true 表示存在风险，false 表示无风险';
COMMENT ON COLUMN public.prj_project_weekly_report_items.risk_details IS '风险说明，NULL 表示未填写或无风险；无风险时必须为 NULL';

COMMIT;
