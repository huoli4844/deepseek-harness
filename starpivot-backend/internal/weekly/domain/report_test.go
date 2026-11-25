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
