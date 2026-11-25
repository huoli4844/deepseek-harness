// Package domain 定义供应商资源边界，不依赖 HTTP 或 PostgreSQL。
package domain

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	// ErrInvalid 表示供应商请求参数无效。
	ErrInvalid = errors.New("供应商参数无效")
	// ErrNotFound 表示当前租户内资源不存在。
	ErrNotFound = errors.New("供应商资源不存在")
)

// Kind 标识允许访问的供应商资源表。
type Kind string

const (
	// Supplier 是供应商主档资源。
	Supplier Kind = "supplier"
	// Contact 是供应商联系人资源。
	Contact Kind = "contact"
	// BankAccount 是供应商银行账号资源。
	BankAccount Kind = "bank-account"
	// Qualification 是供应商资质资源。
	Qualification Kind = "qualification"
)

// Spec 限定表名、父级关系和允许写入的业务字段。
type Spec struct {
	Table        string
	ParentColumn string
	Fields       []string
}

var specs = map[Kind]Spec{
	Supplier: {Table: "md_suppliers", Fields: []string{
		"code", "name", "short_name", "supplier_type", "category", "contact_person", "contact_phone",
		"contact_email", "address", "bank_info", "payment_terms", "quality_rating", "delivery_rating",
		"price_rating", "service_rating", "total_score", "admission_status", "owner_user_id", "remark", "status",
	}},
	Contact: {Table: "md_supplier_contacts", ParentColumn: "supplier_id", Fields: []string{
		"name", "role", "department", "phone", "mobile", "email", "is_primary", "responsibility", "status", "remark",
	}},
	BankAccount: {Table: "md_supplier_bank_accounts", ParentColumn: "supplier_id", Fields: []string{
		"account_name", "bank_name", "branch_name", "account_no", "account_type", "currency", "taxpayer_no",
		"is_default", "status", "effective_from", "effective_to", "remark",
	}},
	Qualification: {Table: "md_supplier_qualifications", ParentColumn: "supplier_id", Fields: []string{
		"qual_type", "cert_no", "issuing_authority", "issue_date", "expire_date", "scope", "file_url", "status",
		"file_name", "file_key", "document_id", "remark",
	}},
}

// SpecFor 返回固定资源白名单，不接受调用方提供表名。
func SpecFor(kind Kind) (Spec, bool) {
	spec, ok := specs[kind]
	return spec, ok
}

// DecodeFields 校验 JSON 对象并拒绝系统字段及未知业务字段。
func DecodeFields(raw json.RawMessage, kind Kind) (map[string]json.RawMessage, error) {
	spec, ok := SpecFor(kind)
	if !ok || len(raw) == 0 || len(raw) > 32<<10 {
		return nil, ErrInvalid
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil || fields == nil {
		return nil, ErrInvalid
	}
	allowed := make(map[string]struct{}, len(spec.Fields))
	for _, field := range spec.Fields {
		allowed[field] = struct{}{}
	}
	for field, value := range fields {
		if _, ok := allowed[field]; !ok || len(value) == 0 || !json.Valid(value) {
			return nil, fmt.Errorf("%w：字段 %s 不可写入", ErrInvalid, strings.TrimSpace(field))
		}
	}
	return fields, nil
}

