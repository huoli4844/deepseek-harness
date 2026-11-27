/**
 * 本地待办存储：单文件 JSON，按写入串行化，原子替换。
 *
 * 边界：只读写本机 DSH 主目录，不连接后台、不感知身份；调用方负责输入校验。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  normalizeTodoDueAt, normalizeTodoNote, normalizeTodoTitle,
  type TodoDraft, type TodoItem, type TodoPatch,
} from './model.ts'

/** 磁盘格式版本；结构变化时递增并迁移。 */
const VERSION = 1

/** 磁盘上的待办集合。 */
interface TodoFile {
  readonly version: number
  readonly items: readonly TodoItem[]
}

/** 本地待办读写；同一实例内的写操作按到达顺序执行。 */
export class TodoStore {
  private readonly file = join(resolveHarnessHome(), 'yuanshu-workbench', 'todos.json')
  private queue: Promise<unknown> = Promise.resolve()

  /**
   * 读取全部待办；文件不存在或损坏时返回空列表。
   * @returns 按创建时间升序的待办。
   */
  async list(): Promise<TodoItem[]> {
    return [...(await this.read()).items]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  /**
   * 新增待办；标题与截止时间完全相同且未完成时复用已有条目，避免重复整理。
   * @param draft - 已校验的输入。
   * @returns 新建或复用的条目。
   */
  async add(draft: TodoDraft): Promise<TodoItem> {
    return this.exclusive(async () => {
      const file = await this.read()
      const existing = file.items.find(item =>
        !item.done && item.title === draft.title && item.dueAt === draft.dueAt)
      if (existing !== undefined) return existing
      const now = new Date().toISOString()
      const item: TodoItem = {
        id: randomUUID(), title: draft.title, dueAt: draft.dueAt, note: draft.note,
        done: false, remindedAt: null, createdAt: now, updatedAt: now,
      }
      await this.write({ version: VERSION, items: [...file.items, item] })
      return item
    })
  }

  /**
   * 修改一条待办。
   * @param id - 待办标识。
   * @param patch - 需要修改的字段。
   * @returns 修改后的条目；不存在时返回 undefined。
   */
  async update(id: string, patch: TodoPatch & { readonly reminded?: boolean }): Promise<TodoItem | undefined> {
    return this.exclusive(async () => {
      const file = await this.read()
      const index = file.items.findIndex(item => item.id === id)
      if (index < 0) return undefined
      const current = file.items[index] as TodoItem
      const now = new Date().toISOString()
      const next: TodoItem = {
        ...current,
        title: patch.title === undefined ? current.title : normalizeTodoTitle(patch.title),
        dueAt: patch.dueAt === undefined ? current.dueAt : normalizeTodoDueAt(patch.dueAt),
        note: patch.note === undefined ? current.note : normalizeTodoNote(patch.note),
        done: patch.done === undefined ? current.done : patch.done,
        remindedAt: patch.reminded === true ? now : current.remindedAt,
        updatedAt: now,
      }
      const items = [...file.items]
      items[index] = next
      await this.write({ version: VERSION, items })
      return next
    })
  }

  /**
   * 删除一条待办。
   * @param id - 待办标识。
   * @returns 是否删除。
   */
  async remove(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      const file = await this.read()
      const items = file.items.filter(item => item.id !== id)
      if (items.length === file.items.length) return false
      await this.write({ version: VERSION, items })
      return true
    })
  }

  /**
   * 串行执行一次写操作。
   * @param run - 读改写逻辑。
   * @returns 逻辑结果。
   */
  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }

  /**
   * 读取磁盘内容；缺失或解析失败时视为空集合。
   * @returns 已校验的文件内容。
   */
  private async read(): Promise<TodoFile> {
    try {
      const text = await readFile(this.file, 'utf8')
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null) return { version: VERSION, items: [] }
      const items = (parsed as { items?: unknown }).items
      if (!Array.isArray(items)) return { version: VERSION, items: [] }
      return { version: VERSION, items: items.filter(isTodoItem) }
    } catch {
      return { version: VERSION, items: [] }
    }
  }

  /**
   * 原子写入：先写同目录临时文件再替换，避免中途退出留下半个文件。
   * @param file - 待写入内容。
   */
  private async write(file: TodoFile): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(file, undefined, 2), 'utf8')
    await rename(temporary, this.file)
  }
}

/**
 * 解析 Harness 主目录：优先 DSH_HOME，其次用户目录下的 .dsh。
 * 这里不引用 home-paths 包，避免宿主打包后多一个外部依赖。
 * @returns 主目录绝对路径。
 */
function resolveHarnessHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  return configured === undefined || configured === '' ? join(homedir(), '.dsh') : configured
}

/**
 * 判断磁盘条目是否满足当前结构。 * @param value - 单个数组元素。
 * @returns 是否为可用待办。
 */
function isTodoItem(value: unknown): value is TodoItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.title === 'string'
    && typeof item.done === 'boolean' && typeof item.createdAt === 'string'
}
