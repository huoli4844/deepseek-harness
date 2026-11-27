// 本文件验证北京时间自然周的开始及边界。
package domain

import (
	"errors"
	"testing"
	"time"
)

func TestCurrentWeekStartUsesBeijingMonday(t *testing.T) {
	for _, test := range []struct{ input, start string }{
		{"2026-11-22T15:59:59Z", "2026-11-16"},
		{"2026-11-22T16:00:00Z", "2026-11-23"},
	} {
		now, err := time.Parse(time.RFC3339, test.input)
		if err != nil {
			t.Fatal(err)
		}
		if actual := CurrentWeekStart(now); actual != test.start {
			t.Fatalf("起始日期为 %s，预期 %s", actual, test.start)
		}
	}
}

func TestParseWeekRejectsNonMonday(t *testing.T) {
	for _, value := range []string{"2026-11-24", "2026-02-29", "0000-01-03", "9999-12-27"} {
		if _, err := ParseWeek(value); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%q 应拒绝，得到 %v", value, err)
		}
	}
	week, err := ParseWeek("2026-12-28")
	if err != nil || week.End.Format(time.DateOnly) != "2027-01-03" {
		t.Fatalf("跨年自然周周日应在次年：%+v / %v", week, err)
	}
}

func TestDraftValidatesStructuredWeeklyItems(t *testing.T) {
	valid := `[{"project_code":"P-8","work_type":"direct","description":"完成联调","completion_status":"completed","has_risk":false,"risk_details":null}]`
	if err := (Draft{CompletedWork: valid}).Validate(); err != nil {
		t.Fatalf("合法周报事项应通过校验：%v", err)
	}
	if err := (Draft{CompletedWork: "旧版纯文本事项"}).Validate(); err != nil {
		t.Fatalf("旧版纯文本记录应保持可读写兼容：%v", err)
	}
	for _, invalid := range []string{
		`[{"project_code":"P-8","work_type":"unknown","description":"完成联调","completion_status":"completed","has_risk":false,"risk_details":null}]`,
		`[{"project_code":"P-8","work_type":"direct","description":"完成联调","completion_status":"planned","has_risk":false,"risk_details":null}]`,
		`[{"project_code":"P-8","work_type":"direct","description":"完成联调","completion_status":"completed","has_risk":false,"risk_details":null,"made_up":"value"}]`,
		`[{"project_code":"P-8","work_type":"direct","description":"完成联调","completion_status":"completed","has_risk":false}]`,
		`[{"project_code":"P-8","work_type":"direct","description":"完成联调","completion_status":"completed","has_risk":false,"risk_details":"未登记风险"}]`,
		`[{"project_code":"bad code","work_type":"direct","description":"完成联调","completion_status":"completed","has_risk":false,"risk_details":null}] trailing`,
	} {
		if err := (Draft{CompletedWork: invalid}).Validate(); !errors.Is(err, ErrInvalid) {
			t.Errorf("无效事项应返回 ErrInvalid：%s，得到 %v", invalid, err)
		}
	}
}

func TestWeeklyDraftAllowsIncompleteItemsUntilSubmission(t *testing.T) {
	for _, body := range []string{"[]", `[{"project_code":"","work_type":"","description":"已记录","completion_status":"","has_risk":false,"risk_details":null}]`} {
		draft := Draft{CompletedWork: body}
		if err := draft.Validate(); err != nil {
			t.Fatalf("应允许保存草稿：%v", err)
		}
		if err := draft.ValidateForSubmit(); !errors.Is(err, ErrIncomplete) {
			t.Fatalf("应拒绝提交未填完的草稿：%v", err)
		}
	}
}
