BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.md_customers
    ADD COLUMN is_deleted boolean GENERATED ALWAYS AS (deleted_at IS NOT NULL) STORED;

COMMENT ON COLUMN public.md_customers.is_deleted IS '逻辑删除标志：false 表示未删除，true 表示已删除；由删除时间计算，不允许直接写入。';
COMMENT ON COLUMN public.md_customers.created_by IS '创建人的元枢用户 ID；大于 0 为实际用户 ID，0 为历史或旧系统未记录创建人。';
COMMENT ON COLUMN public.md_customers.created_at IS '客户档案创建时间，带时区；数据库默认取当前时间。';
COMMENT ON COLUMN public.md_customers.updated_at IS '客户档案最近更新时间，带时区；创建、更新和逻辑删除时记录。';
COMMENT ON COLUMN public.md_customers.deleted_at IS '客户档案逻辑删除时间，带时区；NULL 表示未删除，非 NULL 表示已删除。';

COMMIT;
