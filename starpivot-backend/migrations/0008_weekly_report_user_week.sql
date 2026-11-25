BEGIN;
SET LOCAL lock_timeout = '5s';

-- 周报从「项目×周」改为「用户×周」：用户每周一份周报，头部不再绑定单一项目，
-- 完成事项与下周计划行内的 project_code 继续承担项目关联，由服务在保存与提交时校验。
ALTER TABLE public.prj_project_weekly_reports
    DROP CONSTRAINT prj_project_weekly_reports_project_week_key;
ALTER TABLE public.prj_project_weekly_reports DROP COLUMN project_id;
ALTER TABLE public.prj_project_weekly_reports
    ADD CONSTRAINT prj_project_weekly_reports_user_week_key
    UNIQUE (business_tenant_id, created_by, period_start);

-- 个人周报登记明细流已并入周报正文行，登记明细表不再使用。
DROP TABLE public.prj_project_weekly_report_items;

COMMENT ON TABLE public.prj_project_weekly_reports IS
    '项目周报表，按周记录每位用户的进展摘要、完成事项、下周计划与风险，事项行内通过项目编码关联具体项目';

COMMIT;
