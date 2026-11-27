BEGIN;
ALTER TABLE public.tsk_daily_work_reports
 ADD COLUMN evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tsk_daily_work_reports
 ADD CONSTRAINT tsk_daily_work_reports_evidence_refs_check
 CHECK (jsonb_typeof(evidence_refs)='array' AND jsonb_array_length(evidence_refs)<=100);
COMMENT ON COLUMN public.tsk_daily_work_reports.evidence_refs IS '工作依据引用数组，元素为 session_id 和 seq；默认空数组表示未引用，不授予原会话访问权限';
COMMIT;
