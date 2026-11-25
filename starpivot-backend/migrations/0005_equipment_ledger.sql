-- 保留维修、保养和生产引用，同时允许人工登记没有导入文件的设备。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.eqp_equipments
    ADD COLUMN deleted_at timestamptz,
    ALTER COLUMN source_object_key DROP NOT NULL,
    ALTER COLUMN source_object_key DROP DEFAULT;

COMMENT ON COLUMN public.eqp_equipments.deleted_at IS
    '设备台账逻辑删除时间（带时区）；NULL 表示未删除，非 NULL 表示已删除';
COMMENT ON COLUMN public.eqp_equipments.source_object_key IS
    '导入来源的 RustFS 对象键，关联来源对象清单；NULL 表示人工录入，无导入文件';

COMMIT;
