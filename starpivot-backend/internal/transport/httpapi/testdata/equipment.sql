-- 按云端设备表的字段类型、默认值、状态约束和来源外键构建隔离测试结构。
CREATE TABLE public.doc_source_objects (object_key text PRIMARY KEY);
CREATE TABLE public.eqp_equipments (
    id bigserial PRIMARY KEY,
    code varchar(50) NOT NULL UNIQUE,
    name varchar(200) NOT NULL,
    equipment_type varchar(50) NOT NULL DEFAULT '',
    workshop varchar(50) NOT NULL DEFAULT '',
    model varchar(100) DEFAULT '',
    manufacturer varchar(200) DEFAULT '',
    purchase_date date,
    status varchar(20) NOT NULL DEFAULT 'running',
    maint_interval_days integer NOT NULL DEFAULT 0,
    last_maint_date date,
    next_maint_date date,
    remark text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    source_object_key text NOT NULL DEFAULT '' REFERENCES public.doc_source_objects(object_key),
    review_status varchar(20) NOT NULL DEFAULT 'unreviewed',
    lifecycle_status varchar(20) NOT NULL DEFAULT 'active'
        CHECK (lifecycle_status IN ('active','inactive','scrapped','sealed')),
    runtime_status varchar(20) NOT NULL DEFAULT 'idle'
        CHECK (runtime_status IN ('running','idle','broken','maintenance','planned_stop')),
    serial_no varchar(100) NOT NULL DEFAULT '',
    qr_code varchar(200) NOT NULL DEFAULT '',
    responsible_user_id bigint,
    efficiency_enabled boolean NOT NULL DEFAULT false,
    business_tenant_id bigint NOT NULL CHECK (business_tenant_id > 0),
    arrival_date date,
    category_code varchar(64) NOT NULL DEFAULT '',
    category_name varchar(120) NOT NULL DEFAULT '',
    subcategory_code varchar(64) NOT NULL DEFAULT '',
    subcategory_name varchar(120) NOT NULL DEFAULT '',
    default_shift_code varchar(64) NOT NULL DEFAULT '',
    default_operator_user_id bigint,
    capability_tags jsonb NOT NULL DEFAULT '[]'
);
CREATE FUNCTION public.update_equipment_modified() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_eqp_update BEFORE UPDATE ON public.eqp_equipments
FOR EACH ROW EXECUTE FUNCTION public.update_equipment_modified();
CREATE TABLE public.eqp_equipment_attachments (
    equipment_id bigint NOT NULL REFERENCES public.eqp_equipments(id) ON DELETE CASCADE
);
INSERT INTO public.doc_source_objects VALUES ('imports/equipment');
INSERT INTO public.eqp_equipments (code, name, business_tenant_id, source_object_key)
VALUES ('E-A', '原设备', 3, 'imports/equipment'), ('E-X', '其他租户', 4, 'imports/equipment');
INSERT INTO public.eqp_equipment_attachments VALUES (1);
