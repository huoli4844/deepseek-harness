// 本文件查询物料分类树，并在事务中校验分类父级和写入条件。
package repository

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"starpivot.local/deepseek-harness-backend/internal/material/domain"
)

const categoryColumns = `id, parent_id, code, name, level, path, description, status, created_at`
const categorySearch = `WITH RECURSIVE tree AS (
	SELECT ` + categoryColumns + ` FROM public.md_material_categories
	WHERE business_tenant_id=$1 AND ($2='' OR strpos(lower(code), lower($2)) > 0 OR strpos(lower(name), lower($2)) > 0)
	UNION
	SELECT p.id, p.parent_id, p.code, p.name, p.level, p.path, p.description, p.status, p.created_at
	FROM public.md_material_categories p JOIN tree child ON p.id=child.parent_id WHERE p.business_tenant_id=$1
) SELECT ` + categoryColumns + ` FROM tree ORDER BY level, path, id`

// Categories 返回所有分类或按编码、名称匹配的分类及祖先。
func (p *Postgres) Categories(ctx context.Context, tenant int64, keyword string) ([]domain.Category, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer rollback(tx)
	rows, err := tx.Query(ctx, categorySearch, tenant, keyword)
	if err != nil {
		return nil, err
	}
	categories, err := pgx.CollectRows(rows, pgx.RowToStructByPos[domain.Category])
	if err != nil {
		return nil, err
	}
	return categories, tx.Commit(ctx)
}

// CreateCategory 增加根分类或当前租户有效父级下的子分类。
func (p *Postgres) CreateCategory(ctx context.Context, tenant int64, draft domain.CategoryDraft) (domain.Category, error) {
	tx, err := p.begin(ctx, tenant, pgx.TxOptions{})
	if err != nil {
		return domain.Category{}, err
	}
	defer rollback(tx)
	level, path, err := categoryPosition(ctx, tx, tenant, draft)
	if err != nil {
		return domain.Category{}, err
	}
	row := tx.QueryRow(ctx, `INSERT INTO public.md_material_categories (business_tenant_id, parent_id, code, name, level, path, description)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING `+categoryColumns,
		tenant, draft.ParentID, draft.Code, draft.Name, level, path, draft.Description)
	var category domain.Category
	err = row.Scan(&category.ID, &category.ParentID, &category.Code, &category.Name, &category.Level, &category.Path,
		&category.Description, &category.Status, &category.CreatedAt)
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) && pgerr.Code == "23505" && pgerr.ConstraintName == "md_material_categories_code_key" {
		return domain.Category{}, domain.ErrConflict
	}
	if err != nil {
		return domain.Category{}, err
	}
	return category, tx.Commit(ctx)
}

func categoryPosition(ctx context.Context, tx pgx.Tx, tenant int64, draft domain.CategoryDraft) (int, string, error) {
	if draft.ParentID == nil {
		return 1, "/" + draft.Name, nil
	}
	var level int
	var path, name string
	err := tx.QueryRow(ctx, `SELECT level, path, name FROM public.md_material_categories
		WHERE business_tenant_id=$1 AND id=$2 AND status='active' FOR SHARE`, tenant, *draft.ParentID).Scan(&level, &path, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, "", domain.ErrNotFound
	}
	if err != nil {
		return 0, "", err
	}
	path = strings.TrimRight(path, "/")
	if path == "" {
		path = "/" + name
	}
	path += "/" + draft.Name
	if !domain.ValidText(path, 500) || level < 1 || level >= 2147483647 {
		return 0, "", domain.ErrInvalid
	}
	return level + 1, path, nil
}
