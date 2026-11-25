// Package projectwork 定义项目周报工作条目与工时填报共用的业务枚举。
package projectwork

// ValidCompletionStatus 检查元枢项目任务定义的完成状态。
func ValidCompletionStatus(value string) bool {
	switch value {
	case "blocked", "cancelled", "completed", "in_progress", "pending":
		return true
	default:
		return false
	}
}

// ValidWorkType 检查当前允许新增的工时类型。
func ValidWorkType(value string) bool {
	switch value {
	case "direct", "indirect", "meeting", "overtime", "training":
		return true
	default:
		return false
	}
}
