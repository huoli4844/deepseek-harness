// 本文件验证日报输入边界，不访问数据库。
package domain

import (
	"strings"
	"testing"
)

func TestInputValidation(t *testing.T) {
	valid := Input{Status: "draft", RequestID: "00000000-0000-4000-8000-000000000001"}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*Input){
		func(i *Input) { i.Status = "approved" }, func(i *Input) { i.Status = "submitted" },
		func(i *Input) { i.ExpectedVersion = -1 }, func(i *Input) { i.RequestID = "invalid" },
		func(i *Input) { i.CompletedWork = strings.Repeat("文", 10001) },
		func(i *Input) { i.NeedSupport = "\x00" },
		func(i *Input) { i.EvidenceRefs = []Evidence{{SessionID: "../../other", Seq: 0}} },
	} {
		input := valid
		mutate(&input)
		if input.Validate() == nil {
			t.Fatalf("应拒绝非法输入：%+v", input)
		}
	}
	valid.Status = "submitted"
	valid.InProgressWork = "继续联调"
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for _, date := range []string{"2026-02-30", "2026-1-1", "invalid"} {
		if _, err := ParseDate(date); err == nil {
			t.Fatal("应拒绝非法日期", date)
		}
	}
}
