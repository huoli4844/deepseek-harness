BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.prj_project_weekly_reports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_tenant_id bigint NOT NULL,
    project_id bigint NOT NULL REFERENCES public.prj_projects (id),
    period_start date NOT NULL,
    period_end date NOT NULL,
    progress_summary text NOT NULL,
    completed_work text NOT NULL,
    planned_work text NOT NULL,
    issues_and_risks text,
    need_support text,
    status varchar(20) NOT NULL DEFAULT 'draft',
    created_by bigint NOT NULL,
    submitted_by bigint,
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prj_project_weekly_reports_project_week_key UNIQUE (business_tenant_id, project_id, period_start),
    CONSTRAINT prj_project_weekly_reports_calendar_check CHECK (
        isfinite(period_start) AND isfinite(period_end) AND
        EXTRACT(ISODOW FROM period_start) = 1 AND period_end = period_start + 6
    ),
    CONSTRAINT prj_project_weekly_reports_status_check CHECK (status IN ('draft', 'submitted')),
    CONSTRAINT prj_project_weekly_reports_submission_check CHECK (
        (status = 'draft' AND submitted_by IS NULL AND submitted_at IS NULL) OR
        (status = 'submitted' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND
            progress_summary ~ '[^[:space:]]' AND completed_work ~ '[^[:space:]]' AND planned_work ~ '[^[:space:]]')
    )
);

COMMENT ON TABLE public.prj_project_weekly_reports IS '项目周报表，记录项目每周进展、风险和下周计划';
COMMENT ON COLUMN public.prj_project_weekly_reports.id IS '周报主键，由数据库生成';
COMMENT ON COLUMN public.prj_project_weekly_reports.business_tenant_id IS '所属业务租户 ID';
COMMENT ON COLUMN public.prj_project_weekly_reports.project_id IS '所属项目 ID，关联 public.prj_projects.id';
COMMENT ON COLUMN public.prj_project_weekly_reports.period_start IS '周报所属周的开始日期，按北京时间确定，周一';
COMMENT ON COLUMN public.prj_project_weekly_reports.period_end IS '周报所属周的结束日期，按北京时间确定，周日';
COMMENT ON COLUMN public.prj_project_weekly_reports.progress_summary IS '本周项目进展摘要，草稿可为空字符串';
COMMENT ON COLUMN public.prj_project_weekly_reports.completed_work IS '本周已完成工作，草稿可为空字符串';
COMMENT ON COLUMN public.prj_project_weekly_reports.planned_work IS '下周工作计划，草稿可为空字符串';
COMMENT ON COLUMN public.prj_project_weekly_reports.issues_and_risks IS '本周问题与风险，NULL 表示未填写';
COMMENT ON COLUMN public.prj_project_weekly_reports.need_support IS '需要协调的事项或支持，NULL 表示未填写';
COMMENT ON COLUMN public.prj_project_weekly_reports.status IS 'draft 表示草稿，可编辑，为默认值。submitted 表示已提交，正文锁定';
COMMENT ON COLUMN public.prj_project_weekly_reports.created_by IS '创建人的元枢用户 ID';
COMMENT ON COLUMN public.prj_project_weekly_reports.submitted_by IS '提交人的元枢用户 ID，NULL 表示尚未提交';
COMMENT ON COLUMN public.prj_project_weekly_reports.submitted_at IS '提交时间，NULL 表示尚未提交';
COMMENT ON COLUMN public.prj_project_weekly_reports.created_at IS '首次创建时间，默认当前时间';
COMMENT ON COLUMN public.prj_project_weekly_reports.updated_at IS '最近一次更新时间，创建时默认为当前时间，更新时由服务维护';

COMMIT;
