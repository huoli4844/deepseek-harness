BEGIN;

ALTER TABLE public.fin_labor_hours
    ADD COLUMN completion_status varchar(20),
    ADD CONSTRAINT fin_labor_hours_completion_status_chk
        CHECK (completion_status IN ('blocked', 'cancelled', 'completed', 'in_progress', 'pending'));

COMMENT ON COLUMN public.fin_labor_hours.completion_status IS
    '填报工作完成状态，独立于工时审批状态。blocked=已阻塞，cancelled=已取消，completed=已完成，in_progress=进行中，pending=待处理/待审批。默认 NULL，表示尚未登记完成状态。';
COMMENT ON COLUMN public.fin_labor_hours.updated_at IS
    '最近修改时间，默认当前时间。仅将草稿提交并登记提交时间时保留原值，其他更新由触发器写入当前时间。';

CREATE FUNCTION public.set_fin_labor_hours_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF OLD.status = 'draft' AND NEW.status = 'submitted'
        AND NEW.submitted_at IS NOT NULL
        AND (to_jsonb(NEW) - ARRAY['status', 'submitted_at', 'updated_at'])
            = (to_jsonb(OLD) - ARRAY['status', 'submitted_at', 'updated_at'])
    THEN
        NEW.updated_at := OLD.updated_at;
    ELSE
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_labor_update ON public.fin_labor_hours;
CREATE TRIGGER trg_labor_update
    BEFORE UPDATE ON public.fin_labor_hours
    FOR EACH ROW EXECUTE FUNCTION public.set_fin_labor_hours_updated_at();

COMMIT;
