BEGIN;
CREATE TABLE public.tsk_daily_work_reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_tenant_id bigint NOT NULL CHECK (business_tenant_id>0),
 user_id bigint NOT NULL CHECK (user_id>0),
 work_date date NOT NULL,
 completed_work text NOT NULL DEFAULT '' CHECK (char_length(completed_work)<=10000),
 in_progress_work text NOT NULL DEFAULT '' CHECK (char_length(in_progress_work)<=10000),
 planned_work text NOT NULL DEFAULT '' CHECK (char_length(planned_work)<=10000),
 issues_and_risks text NOT NULL DEFAULT '' CHECK (char_length(issues_and_risks)<=10000),
 need_support text NOT NULL DEFAULT '' CHECK (char_length(need_support)<=10000),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs)='array' AND jsonb_array_length(evidence_refs)<=100),
 status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
 version bigint NOT NULL DEFAULT 1 CHECK (version>0),
 last_request_id uuid NOT NULL,
 last_request_hash varchar(64) NOT NULL,
 submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE (business_tenant_id,user_id,work_date),
 UNIQUE (business_tenant_id,user_id,last_request_id),
 CHECK ((status='draft' AND submitted_at IS NULL) OR (status='submitted' AND submitted_at IS NOT NULL)),
 CHECK (status='draft' OR btrim(completed_work||in_progress_work)<>'')
);
COMMENT ON TABLE public.tsk_daily_work_reports IS '个人工作日报表';
COMMENT ON COLUMN public.tsk_daily_work_reports.id IS '日报主键，由数据库生成';
COMMENT ON COLUMN public.tsk_daily_work_reports.business_tenant_id IS '所属业务租户 ID，由可信登录身份确定';
COMMENT ON COLUMN public.tsk_daily_work_reports.user_id IS '所属元枢用户 ID，由可信登录身份确定';
COMMENT ON COLUMN public.tsk_daily_work_reports.work_date IS '工作日期，按北京时间确定业务日期，同一租户同一用户每日一份';
COMMENT ON COLUMN public.tsk_daily_work_reports.completed_work IS '今日已完成工作，默认空字符串表示尚未填写';
COMMENT ON COLUMN public.tsk_daily_work_reports.in_progress_work IS '今日进行中工作，默认空字符串表示尚未填写';
COMMENT ON COLUMN public.tsk_daily_work_reports.planned_work IS '后续工作计划，默认空字符串表示尚未填写';
COMMENT ON COLUMN public.tsk_daily_work_reports.issues_and_risks IS '问题与风险，默认空字符串表示尚未填写，不等同于确认无风险';
COMMENT ON COLUMN public.tsk_daily_work_reports.need_support IS '需要协调和支持的事项，默认空字符串表示尚未填写';
COMMENT ON COLUMN public.tsk_daily_work_reports.evidence_refs IS '工作依据引用数组，元素为 session_id 和 seq；默认空数组表示未引用，不授予原会话访问权';
COMMENT ON COLUMN public.tsk_daily_work_reports.status IS '日报状态：draft=草稿，可编辑，默认值；submitted=已提交，正文锁定';
COMMENT ON COLUMN public.tsk_daily_work_reports.version IS '乐观锁版本，默认 1 表示首次保存，每次有效更新递增';
COMMENT ON COLUMN public.tsk_daily_work_reports.last_request_id IS '最近一次人工确认请求的幂等标识';
COMMENT ON COLUMN public.tsk_daily_work_reports.last_request_hash IS '最近一次请求正文的 SHA256 摘要，拒绝同标识不同正文';
COMMENT ON COLUMN public.tsk_daily_work_reports.submitted_at IS '提交时间，由数据库原子写入；NULL=尚未提交';
COMMENT ON COLUMN public.tsk_daily_work_reports.created_at IS '首次创建时间，默认当前时间，后续保存不变';
COMMENT ON COLUMN public.tsk_daily_work_reports.updated_at IS '最近保存时间，默认当前时间，更新由服务维护';
COMMIT;
