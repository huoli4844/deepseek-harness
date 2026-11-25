// 本文件集中管理日报参数化写入，不依赖传输或模型。
package repository

import "strconv"

func fmtOwner(tenant, user int64) string {
	return "daily:" + strconv.FormatInt(tenant, 10) + ":" + strconv.FormatInt(user, 10)
}

const saveSQL = `INSERT INTO public.tsk_daily_work_reports AS report
 (business_tenant_id,user_id,work_date,completed_work,in_progress_work,planned_work,issues_and_risks,
 need_support,evidence_refs,status,last_request_id,last_request_hash,submitted_at)
 SELECT $1,$2,$3::date,$4,$5,$6,$7,$8,$9::jsonb,$10::varchar(20),$11::uuid,$12,
 CASE WHEN $10::varchar(20)='submitted' THEN statement_timestamp() ELSE NULL END
 WHERE $13::bigint=0 OR EXISTS (SELECT 1 FROM public.tsk_daily_work_reports
 WHERE business_tenant_id=$1 AND user_id=$2 AND work_date=$3::date)
 ON CONFLICT (business_tenant_id,user_id,work_date) DO UPDATE SET
 completed_work=EXCLUDED.completed_work,in_progress_work=EXCLUDED.in_progress_work,
 planned_work=EXCLUDED.planned_work,issues_and_risks=EXCLUDED.issues_and_risks,
 need_support=EXCLUDED.need_support,evidence_refs=EXCLUDED.evidence_refs,status=EXCLUDED.status,
 version=report.version+1,updated_at=statement_timestamp(),submitted_at=EXCLUDED.submitted_at,
 last_request_id=EXCLUDED.last_request_id,last_request_hash=EXCLUDED.last_request_hash
 WHERE report.status='draft' AND report.version=$13
 RETURNING ` + columns
