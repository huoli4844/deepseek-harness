-- 合同列表接口测试使用的隔离表结构与样例数据。
CREATE TABLE public.prj_projects (
	id bigint PRIMARY KEY,
	business_tenant_id bigint NOT NULL,
	code text NOT NULL,
	name text NOT NULL,
	deleted_at timestamptz
);

CREATE TABLE public.fin_contracts (
	id bigint PRIMARY KEY,
	business_tenant_id bigint NOT NULL,
	code text NOT NULL,
	contract_type text NOT NULL,
	counterparty_name text NOT NULL,
	project_id bigint,
	signed_date date,
	effective_date date,
	expiry_date date,
	total_amount numeric(18,2),
	tax_amount numeric(18,2),
	owed_amount numeric(18,2),
	warranty_amount numeric(18,2),
	status text NOT NULL,
	source_contract_no text NOT NULL DEFAULT '',
	updated_at timestamptz NOT NULL
);

INSERT INTO public.prj_projects (id, business_tenant_id, code, name, deleted_at) VALUES
	(10, 3, 'P-10', '项目甲', NULL),
	(11, 3, 'P-11', '项目乙（已删除）', now()),
	(12, 4, 'P-40', '其他租户项目', NULL);

INSERT INTO public.fin_contracts (id, business_tenant_id, code, contract_type, counterparty_name,
	project_id, signed_date, effective_date, expiry_date, total_amount, tax_amount, owed_amount,
	warranty_amount, status, source_contract_no, updated_at) VALUES
	(1, 3, 'C-A', 'purchase', '甲公司', 10, '2024-01-02', '2024-01-05', NULL,
		100.50, 10.00, 20.00, 5.00, 'active', 'SRC-A', '2024-03-02 10:00:00+08'),
	(2, 3, 'C-B', 'sales', '乙公司', 11, '2024-02-02', NULL, '2025-02-02',
		200.00, 0.00, 0.00, 0.00, 'draft', '', '2024-03-01 10:00:00+08'),
	(3, 3, 'C-C', 'service', '丙公司', NULL, NULL, NULL, NULL,
		NULL, NULL, NULL, NULL, 'closed', '', '2024-02-01 10:00:00+08'),
	(9, 4, 'T4-ONLY', 'purchase', '其他租户', 12, '2024-01-01', NULL, NULL,
		1.00, 0.00, 0.00, 0.00, 'active', '', '2024-01-01 10:00:00+08');
