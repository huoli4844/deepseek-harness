/** 本地待办的领域类型与输入校验；不依赖 IO 与 UI。 */

/** 单条待办；时间为 ISO 8601 字符串，未设置为 null。 */
export interface TodoItem {
  readonly id: string
  readonly title: string
  /** 截止时间；null 表示没有时间节点。 */
  readonly dueAt: string | null
  /** 补充说明；null 表示没有。 */
  readonly note: string | null
  readonly done: boolean
  /** 桌面提醒已发出的时间；null 表示尚未提醒。 */
  readonly remindedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** 新建待办的输入。 */
export interface TodoDraft {
  readonly title: string
  readonly dueAt: string | null
  readonly note: string | null
}

/** 允许修改的字段；未出现的字段保持不变。 */
export interface TodoPatch {
  readonly title?: string
  readonly dueAt?: string | null
  readonly note?: string | null
  readonly done?: boolean
}

/** 标题长度上限。 */
export const TODO_TITLE_MAX = 120

/** 说明长度上限。 */
export const TODO_NOTE_MAX = 500

/**
 * 校验并规范化标题。
 * @param raw - 模型或界面传入的标题。
 * @returns 去掉首尾空白后的标题。
 */
export function normalizeTodoTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('待办标题必须是文本')
  const title = raw.trim()
  if (title === '') throw new Error('待办标题不能为空')
  if (title.length > TODO_TITLE_MAX) throw new Error(`待办标题最多 ${TODO_TITLE_MAX} 个字符`)
  return title
}

/**
 * 校验时间节点；只接受可解析的 ISO 8601 字符串。
 * @param raw - 截止时间。
 * @returns 规范化后的 ISO 字符串，空值返回 null。
 */
export function normalizeTodoDueAt(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') throw new Error('截止时间必须是文本')
  const time = Date.parse(raw)
  if (Number.isNaN(time)) throw new Error('截止时间无法识别，请使用 ISO 8601 格式')
  return new Date(time).toISOString()
}

/**
 * 校验说明文本。
 * @param raw - 说明。
 * @returns 去掉首尾空白的说明，空值返回 null。
 */
export function normalizeTodoNote(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') throw new Error('待办说明必须是文本')
  const note = raw.trim()
  if (note === '') return null
  if (note.length > TODO_NOTE_MAX) throw new Error(`待办说明最多 ${TODO_NOTE_MAX} 个字符`)
  return note
}
