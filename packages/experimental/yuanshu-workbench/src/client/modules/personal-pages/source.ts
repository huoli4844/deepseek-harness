/** 按已验证的租户和员工保存本机页面定义；主存储是宿主固定目录文件，浏览器存储只作迁移兜底。 */
import type { PersonalPage, PersonalWidget } from './model.ts'

/** 通知同一窗口中的个人页重新读取。 */
export const personalPagesChanged = new EventTarget()

/** 宿主同源代理端点；与待办端点一致。 */
const BASE = '/yuanshu-workbench/personal-pages'

/** 浏览器兜底存储的键名；旧版本配置从这里迁移。 */
function key(account: string) {
  return 'dsh.yuanshu.personal-pages.v1.' + account
}

/** 组装请求头；缺少登录令牌时抛错。 */
function headers(): Headers {
  const token = localStorage.getItem('workbench-client-token')
  if (!token) throw Object.assign(new Error('YuanShu login required'), { kind: 'login' })
  return new Headers({ authorization: `Bearer ${token}` })
}

/** data-query 卡的接口路径：只允许目录前缀的站内路径（可含 {name} 占位符），杜绝外链与注入。 */
const QUERY_PATH_PATTERN = /^\/api\/v1\/[A-Za-z0-9/._{}-]{1,180}$/u

/** data-query 卡的参数表：键为短字符串，值允许字符串、有限数字与布尔（读取时归一为字符串）。 */
function isQueryParams(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length <= 10 && entries.every(([name, raw]) =>
    /^[A-Za-z0-9_-]{1,40}$/u.test(name)
    && (typeof raw === 'string' && raw.length <= 200
      || typeof raw === 'number' && Number.isFinite(raw)
      || typeof raw === 'boolean'))
}

/** 把参数值统一转成字符串，保证落盘与查询参数类型一致。 */
function normalizeQueryParams(params: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(params as Record<string, unknown>)
    .map(([name, raw]) => [name, String(raw)]))
}

/** data-query 卡的字段中文标签映射：字段名为短标识，标签为 1~20 字的展示文本。 */
function isQueryLabels(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entries = Object.entries(value)
  return entries.length <= 20 && entries.every(([name, raw]) =>
    /^[A-Za-z0-9_-]{1,40}$/u.test(name) && typeof raw === 'string' && raw.trim().length > 0 && raw.length <= 20)
}

/** 卡片编码是否合法；type 联合扩展后无需改这里。 */
function isWidget(value: unknown): value is PersonalWidget {
  if (typeof value !== 'object' || value === null) return false
  const { id, type, period, memberId, path, params, title, columns, labels, view, aggregate } = Object.fromEntries(Object.entries(value))
  if (typeof id !== 'string' || id === '') return false
  if (type !== 'labor-month' && type !== 'member-labor' && type !== 'headcount' && type !== 'data-query') return false
  if (period !== undefined && period !== 'week' && period !== 'month') return false
  if (memberId !== undefined && typeof memberId !== 'number') return false
  if (title !== undefined && (typeof title !== 'string' || title.length > 40)) return false
  if (view !== undefined && view !== 'table' && view !== 'stats' && view !== 'bar') return false
  if (aggregate !== undefined && aggregate !== 'sum' && aggregate !== 'avg'
    && aggregate !== 'max' && aggregate !== 'min' && aggregate !== 'count') return false
  if (labels !== undefined && !isQueryLabels(labels)) return false
  if (columns !== undefined && (!Array.isArray(columns) || columns.length > 8
    || columns.some(item => typeof item !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/u.test(item)))) return false
  if (type === 'data-query') {
    if (typeof path !== 'string' || !QUERY_PATH_PATTERN.test(path)) return false
    if (params !== undefined && !isQueryParams(params)) return false
  } else if (path !== undefined || params !== undefined) {
    return false
  }
  return true
}

/** 旧版单类型页面（kind 结构）归一化为单卡片页面；无法识别时丢弃。 */
function normalizePage(value: unknown): PersonalPage | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const entry = Object.fromEntries(Object.entries(value))
  const { id, name, hidden } = entry
  if (typeof id !== 'string' || id === '' || typeof name !== 'string'
    || name.trim().length === 0 || name.length > 40) return undefined
  if (Array.isArray(entry.widgets)) {
    // 读取校验通过后归一参数与标签（数字转字符串、标签去空白），保证卡片结构落盘后可原样读回。
    const widgets = entry.widgets.flatMap((widget) => {
      if (!isWidget(widget)) return []
      const cleaned = widget.params === undefined ? widget : { ...widget, params: normalizeQueryParams(widget.params) }
      const labels = widget.labels === undefined
        ? cleaned
        : { ...cleaned, labels: Object.fromEntries(Object.entries(widget.labels).map(([name, raw]) => [name, raw.trim()])) }
      return [labels]
    })
    return widgets.length > 0 ? { id, name, hidden: hidden === true, widgets } : undefined
  }
  const kind = entry.kind as unknown
  const period = entry.period as unknown
  if (kind !== 'project-labor' && kind !== 'headcount') return undefined
  const legacyPeriod = period === 'week' || period === 'month' ? period : undefined
  return {
    id, name, hidden: hidden === true,
    widgets: [{ id: `${id}-main`, type: kind === 'headcount' ? 'headcount' : 'labor-month',
      ...(legacyPeriod === undefined ? {} : { period: legacyPeriod }) }],
  }
}

/** 页面数组归一化；无法识别的条目丢弃。 */
function normalizePages(value: readonly unknown[]): readonly PersonalPage[] {
  return value.flatMap((item) => {
    const page = normalizePage(item)
    return page === undefined ? [] : [page]
  })
}

/** 从浏览器兜底存储读取旧配置；损坏时视为空。 */
function readLocal(account: string): readonly PersonalPage[] {
  const raw = localStorage.getItem(key(account))
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? normalizePages(value) : []
  } catch {
    return []
  }
}

/** 写入浏览器兜底存储，作为宿主端点不可用时的离线后备。 */
function writeLocal(account: string, pages: readonly PersonalPage[]): void {
  try {
    localStorage.setItem(key(account), JSON.stringify(pages))
  } catch { /* 配额或隐私模式失败可忽略 */ }
}

/** 向宿主固定目录写入页面定义；失败抛错，由调用方转为存储错误。 */
async function putPages(account: string, pages: readonly PersonalPage[]): Promise<void> {
  const head = headers()
  head.set('content-type', 'application/json')
  const response = await fetch(`${BASE}/${encodeURIComponent(account)}`, {
    method: 'PUT', headers: head, body: JSON.stringify({ pages }),
  })
  if (!response.ok) throw new Error(`personal-pages ${String(response.status)}`)
}

/** 从宿主固定目录恢复页面；宿主无文件时迁移浏览器旧配置，端点不可用时退回浏览器数据。 */
export async function readPersonalPages(account: string): Promise<readonly PersonalPage[]> {
  const local = readLocal(account)
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(account)}`, { headers: headers() })
    if (!response.ok) throw new Error(`personal-pages ${String(response.status)}`)
    const payload = await response.json() as { data?: readonly unknown[] | null }
    if (Array.isArray(payload.data)) return normalizePages(payload.data)
    // 宿主还没有该账号的文件：把浏览器里的旧配置迁移落盘，下次不再依赖浏览器存储。
    if (local.length > 0) await putPages(account, local)
    return local
  } catch {
    return local
  }
}

/** 发布新页面；重名时返回 undefined，存储失败抛错。 */
export async function savePersonalPage(account: string, page: PersonalPage): Promise<readonly PersonalPage[] | undefined> {
  if (page.widgets.length === 0) throw new Error('Invalid personal page')
  const pages = await readPersonalPages(account)
  if (pages.some(item => item.id === page.id)) return pages
  if (pages.some(item => item.name.toLowerCase() === page.name.toLowerCase())) return undefined
  return writePages(account, [...pages, page])
}

/** 更新排序和显示配置，保留编辑期间从对话发布的新页面；重名时返回 false。 */
export async function savePersonalPageSettings(account: string, settings: readonly PersonalPage[]): Promise<boolean> {
  const current = await readPersonalPages(account)
  const byId = new Map(current.map(page => [page.id, page]))
  const ordered = settings.flatMap(({ id, name, hidden }) => {
    const page = byId.get(id)
    if (!page) return []
    byId.delete(id)
    return [{ ...page, name: name.trim(), hidden: hidden === true }]
  })
  const next = [...ordered, ...byId.values()]
  if (new Set(next.map(page => page.name.toLowerCase())).size !== next.length) return false
  await writePages(account, next)
  return true
}

/** 写入宿主固定目录并同步浏览器兜底，随后通知同窗口刷新。 */
/** 卸载一个已发布页面，返回剩余页面；目标不存在时返回 undefined。 */
export function removePersonalPage(account: string, id: string): Promise<readonly PersonalPage[] | undefined> {
  return readPersonalPages(account).then((pages) => {
    if (!pages.some(page => page.id === id)) return undefined
    return writePages(account, pages.filter(page => page.id !== id))
  })
}

/** 卸载全部已发布页面，返回空列表。 */
export function clearPersonalPages(account: string): Promise<readonly PersonalPage[]> {
  return writePages(account, [])
}

async function writePages(account: string, pages: readonly PersonalPage[]): Promise<readonly PersonalPage[]> {
  await putPages(account, pages)
  writeLocal(account, pages)
  personalPagesChanged.dispatchEvent(new Event('change'))
  return pages
}
