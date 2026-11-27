/** 客户端待办模型：与宿主持久化结构一致的最小字段集。 */

/** 一条本地待办。 */
export interface TodoItem {
  readonly id: string
  readonly title: string
  readonly dueAt: string | null
  readonly note: string | null
  readonly done: boolean
  readonly remindedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** 允许客户端修改的字段。 */
export interface TodoPatch {
  readonly title?: string
  readonly dueAt?: string | null
  readonly note?: string | null
  readonly done?: boolean
  readonly reminded?: boolean
}
