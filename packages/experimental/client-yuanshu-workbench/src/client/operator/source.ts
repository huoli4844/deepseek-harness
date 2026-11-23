/**
 * 运营者工作台的数据层。
 *
 * 这是唯一知道如何抓取投影的模块。它不依赖任何 React 代码，
 * 也不包含展示文案或占位符字符串：只返回校验后的原始记录，
 * 或在某个 section 不可用时返回 `undefined`。
 * 把这些记录转换为展示字段（包括占位符规则）
 * 完全是 `viewmodel.ts` 的职责。
 */

/** host 适配层中 `fields()` 返回的通用两列记录。 */
export interface RawRow {
  readonly title: string
  readonly detail: string
}

/** host 适配层中 `items()` 返回的工作项（风险或任务）。 */
export interface RawItem {
  readonly kind: 'risk' | 'task'
  readonly id: number
  readonly title: string
  readonly code?: string | undefined
  readonly project?: string | undefined
  readonly owner?: string | undefined
  readonly deadline?: string | undefined
  readonly status?: string | undefined
}

/** 从线上 Home 端点抓取的、未经解释的原始投影。 */
export interface RawProjections {
  /** `workbench_briefing` → section `dashboard`：四类异常计数。 */
  readonly briefing: readonly RawRow[] | undefined
  /** `workbench_decisions` → section `priorities`。 */
  readonly decisions: readonly RawRow[] | undefined
  /** `workbench_home.projects` → section `project-operations`。 */
  readonly projects: readonly RawRow[] | undefined
  /** `workbench_home.risks` → section `assistant`。 */
  readonly risks: readonly RawItem[] | undefined
  /** `workbench_home.my_tasks` → sections `assistant` / `tasks`。 */
  readonly tasks: readonly RawItem[] | undefined
  /** `workbench_home.milestones` → section `calendar`。 */
  readonly milestones: readonly RawRow[] | undefined
  /** 成功抓取的 epoch 时间戳，用于数据新鲜度展示。 */
  readonly fetchedAt: number | undefined
  /** 投影提供的工作台显示名称（若存在）。 */
  readonly workbenchName: string | undefined
}

/** 全缺失快照：让所有 A 档字段回退为占位符。 */
export const EMPTY_PROJECTIONS: RawProjections = {
  briefing: undefined,
  decisions: undefined,
  projects: undefined,
  risks: undefined,
  tasks: undefined,
  milestones: undefined,
  fetchedAt: undefined,
  workbenchName: undefined,
}

/** 投影加载失败的原因（由外壳映射为界面文案）。 */
export type ProjectionFailure = 'login' | 'connecting' | 'denied' | 'unavailable'

/** 来自数据源的可恢复加载失败。 */
export class ProjectionError extends Error {
  constructor(readonly reason: ProjectionFailure) {
    super(`Operator projection unavailable: ${reason}`)
  }
}

/** 容器消费的契约；测试中可注入假实现。 */
export interface ProjectionSource {
  load(signal: AbortSignal): Promise<RawProjections>
}

interface HomePayload {
  readonly name: string
  readonly rows: readonly RawRow[]
  readonly items: readonly RawItem[]
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** 校验并规范化 Home 端点响应，不信任其结构。 */
export function parseHomePayload(body: unknown): HomePayload | undefined {
  const root = record(body)
  if (root === undefined) return undefined
  const rawRows = Array.isArray(root.rows) ? root.rows : []
  const rawItems = Array.isArray(root.items) ? root.items : []
  const rows: RawRow[] = []
  for (const entry of rawRows) {
    const row = record(entry)
    if (row === undefined || typeof row.title !== 'string') continue
    rows.push({ title: row.title, detail: typeof row.detail === 'string' ? row.detail : '' })
  }
  const items: RawItem[] = []
  for (const entry of rawItems) {
    const row = record(entry)
    if (row === undefined || typeof row.title !== 'string' || typeof row.id !== 'number'
        || (row.kind !== 'risk' && row.kind !== 'task')) continue
    const item: {
      kind: 'risk' | 'task'
      id: number
      title: string
      code?: string | undefined
      project?: string | undefined
      owner?: string | undefined
      deadline?: string | undefined
      status?: string | undefined
    } = { kind: row.kind, id: row.id, title: row.title }
    for (const key of ['code', 'project', 'owner', 'deadline', 'status'] as const) {
      const value = row[key]
      if (typeof value === 'string') item[key] = value
    }
    items.push(item)
  }
  return { name: typeof root.name === 'string' ? root.name : '', rows, items }
}

/** A 档数据可被 host `/home` 端点接受的 section 标识。 */
const SECTIONS = ['dashboard', 'priorities', 'project-operations', 'assistant', 'calendar'] as const
type Section = typeof SECTIONS[number]

/**
 * 基于已鉴权的同源 Home 路由的线上投影数据源。
 * 单个 section 失败时降级为该 section 的 `undefined`，
 * 避免某一项投影不可用就把整个工作台清空。
 */
export function createLiveProjectionSource(): ProjectionSource {
  const loadSection = async (section: Section, headers: Record<string, string>, signal: AbortSignal): Promise<HomePayload | undefined> => {
    const response = await fetch(`/yuanshu-workbench/home?section=${encodeURIComponent(section)}`, { headers, signal })
    if (response.status === 401) throw new ProjectionError('login')
    if (response.status === 424) throw new ProjectionError('connecting')
    if (response.status === 403) throw new ProjectionError('denied')
    if (!response.ok) return undefined
    return parseHomePayload(await response.json() as unknown)
  }

  return {
    async load(signal: AbortSignal): Promise<RawProjections> {
      const token = localStorage.getItem('workbench-client-token')
      if (token === null || token === '') throw new ProjectionError('login')
      const headers = {
        authorization: `Bearer ${token}`,
        'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
      }
      const settled = await Promise.allSettled(
        SECTIONS.map(section => loadSection(section, headers, signal)),
      )
      const fatal = settled.find((result): result is PromiseRejectedResult =>
        result.status === 'rejected' && result.reason instanceof ProjectionError)
      if (fatal !== undefined && fatal.reason instanceof ProjectionError) throw fatal.reason
      const payloads = settled.map(result => result.status === 'fulfilled' ? result.value : undefined)
      const [dashboard, priorities, projects, assistant, calendar] = payloads
      const risks = assistant?.items.filter(item => item.kind === 'risk')
      const tasks = assistant?.items.filter(item => item.kind === 'task')
      const hasAny = payloads.some(value => value !== undefined)
      return {
        briefing: dashboard?.rows,
        decisions: priorities?.rows,
        projects: projects?.rows,
        risks,
        tasks,
        milestones: calendar?.rows,
        fetchedAt: hasAny ? Date.now() : undefined,
        workbenchName: dashboard?.name ?? projects?.name,
      }
    },
  }
}
