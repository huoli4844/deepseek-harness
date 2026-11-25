// Package archivequery 定义客户和供应商档案查询条件，不依赖传输和存储实现。
package archivequery

// Query 包含可同时生效的过滤条件和排序。
type Query struct {
	Keyword, Code, Name, ContactPerson, Category string
	SortBy, SortDirection                        string
}

// ValidSort 检查排序方向和所属资源允许的排序字段。
func (q Query) ValidSort(columns []string) bool {
	if q.SortBy == "" {
		return q.SortDirection == ""
	}
	if q.SortDirection != "asc" && q.SortDirection != "desc" {
		return false
	}
	for _, column := range columns {
		if q.SortBy == column {
			return true
		}
	}
	return false
}
