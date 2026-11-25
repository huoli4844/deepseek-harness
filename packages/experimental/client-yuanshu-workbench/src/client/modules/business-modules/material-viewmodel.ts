/** 整理物料分类层级和物料展示字段，不依赖 React 或请求。 */
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import { materialColumns, type MaterialCategory, type MaterialRecord, type MaterialSort } from './material-model.ts'

/** 分类树的节点与可展开的子节点。 */
export interface MaterialCategoryNode {
  readonly category: MaterialCategory
  readonly children: readonly MaterialCategoryNode[]
}

/** 将后端平铺列表转为树，单次展示每个分类。 */
export function materialCategoryTree(categories: readonly MaterialCategory[]): readonly MaterialCategoryNode[] {
  const identities = new Map(categories.map(category => [category.id, category]))
  const children = new Map<number | undefined, MaterialCategory[]>()
  for (const category of identities.values()) {
    const parentId = category.parentId !== undefined && identities.has(category.parentId) ? category.parentId : undefined
    const siblings = children.get(parentId) ?? []
    siblings.push(category)
    children.set(parentId, siblings)
  }

  const visited = new Set<number>()
  function build(category: MaterialCategory): MaterialCategoryNode | undefined {
    if (visited.has(category.id)) return undefined
    visited.add(category.id)
    return { category, children: (children.get(category.id) ?? []).flatMap(child => build(child) ?? []) }
  }
  const roots = (children.get(undefined) ?? []).flatMap(category => build(category) ?? [])
  return [...roots, ...[...identities.values()].flatMap(category => build(category) ?? [])]
}

/** 计算创建子分类后需要打开的父级路径。 */
export function materialCategoryAncestors(categories: readonly MaterialCategory[], parentId: number): ReadonlySet<number> {
  const parents = new Map(categories.map(category => [category.id, category.parentId]))
  const ancestors = new Set<number>()
  for (let id: number | undefined = parentId; id !== undefined && !ancestors.has(id); id = parents.get(id)) {
    ancestors.add(id)
  }
  return ancestors
}

/** 转换审计时间，保留普通字段及后端提供的数值。 */
export function materialCells(record: MaterialRecord): Readonly<Record<string, string | number | undefined>> {
  const { created_at: createdAt, updated_at: updatedAt } = record.values
  return {
    ...record.values,
    created_at: formatBeijingDateTime(typeof createdAt === 'string' ? createdAt : undefined),
    updated_at: formatBeijingDateTime(typeof updatedAt === 'string' ? updatedAt : undefined),
  }
}

/** 切换后端白名单中的排序项，同一表头按升序、降序切换。 */
export function nextMaterialSort(current: MaterialSort | undefined, key: string): MaterialSort | undefined {
  const column = materialColumns.find(column => column.key === key)
  if (column === undefined) return current
  return { key: column.key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' }
}
