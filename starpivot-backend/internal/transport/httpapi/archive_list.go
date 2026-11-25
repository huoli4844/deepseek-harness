// 本文件解析客户及供应商共用的列表查询条件。
package httpapi

import (
	"net/url"
	"strings"
	"unicode/utf8"

	"starpivot.local/deepseek-harness-backend/internal/archivequery"
)

func archiveListQuery(values url.Values, allowCategory bool) (archivequery.Query, bool) {
	var query archivequery.Query
	fields := map[string]*string{
		"keyword": &query.Keyword, "code": &query.Code, "name": &query.Name, "contact_person": &query.ContactPerson,
		"sort_by": &query.SortBy, "sort_direction": &query.SortDirection,
	}
	if allowCategory {
		fields["category"] = &query.Category
	}
	for name, target := range fields {
		if !values.Has(name) {
			continue
		}
		raw := values[name]
		if len(raw) != 1 || !utf8.ValidString(raw[0]) || strings.ContainsRune(raw[0], 0) {
			return query, false
		}
		*target = strings.TrimSpace(raw[0])
		if utf8.RuneCountInString(*target) > 100 {
			return query, false
		}
	}
	return query, true
}
