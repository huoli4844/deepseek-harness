/** 定义档案查询条件及其 HTTP 参数，不依赖组件或网络请求。 */

/** 档案列表可以组合提交的过滤条件。 */
export interface RecordListFilters {
  readonly keyword?: string
  readonly code?: string
  readonly name?: string
  readonly contactPerson?: string
  readonly category?: string
}

/** 当前档案表格的排序栏和方向。 */
export interface RecordListSort {
  readonly key: string
  readonly direction: 'asc' | 'desc'
}

/** 生成列表请求的分页、过滤和排序参数。 */
export function recordListParams(page: number, size: number, filters: RecordListFilters, sort?: RecordListSort): URLSearchParams {
  const params = new URLSearchParams({ page: String(page), page_size: String(size) })
  const values = {
    keyword: filters.keyword, code: filters.code, name: filters.name, contact_person: filters.contactPerson,
    category: filters.category, sort_by: sort?.key.replace(/[A-Z]/gu, letter => `_${letter.toLowerCase()}`),
    sort_direction: sort?.direction,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value)
  }
  return params
}
