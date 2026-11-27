/** 计算列表分页的页数和页码分组，不依赖请求或组件。 */

/** 列表每次请求的记录数。 */
export const RECORD_PAGE_SIZE = 20

/** 根据后台匹配数和分页大小计算总页数。 */
export function recordPageCount(total: number | undefined, pageSize: number): number | undefined {
  return total === undefined ? undefined : Math.max(1, Math.ceil(total / pageSize))
}

/** 返回当前组的可点击页码，每组至多十个。 */
export function recordPageNumbers(page: number, pageCount: number | undefined): readonly number[] {
  if (pageCount === undefined) return [page]
  const start = Math.floor((page - 1) / 10) * 10 + 1
  return Array.from({ length: Math.min(10, pageCount - start + 1) }, (_, index) => start + index)
}
