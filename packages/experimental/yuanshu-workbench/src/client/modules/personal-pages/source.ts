/** 按已验证的租户和员工保存本机页面定义。 */
import type { PersonalPage } from './model.ts'

/** 通知同一窗口中的个人页重新读取。 */
export const personalPagesChanged = new EventTarget()

function key(account: string) {
  return 'dsh.yuanshu.personal-pages.v1.' + account
}

function isPage(value: unknown): value is PersonalPage {
  if (typeof value !== 'object' || value === null) return false
  const { id, name, kind, projectCode, period } = Object.fromEntries(Object.entries(value))
  return typeof id === 'string' && typeof name === 'string' && name.trim().length > 0
    && name.length <= 40 && kind === 'project-labor'
    // projectCode 缺省表示全部项目；给出时必须是合法项目编码
    && (projectCode === undefined
      || (typeof projectCode === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(projectCode)))
    && (period === 'week' || period === 'month')
}

/** 从当前员工的存储区恢复页面。 */
export function readPersonalPages(account: string): readonly PersonalPage[] {
  const raw = localStorage.getItem(key(account))
  const value: unknown = raw === null ? [] : JSON.parse(raw)
  return Array.isArray(value) ? value.filter(isPage) : []
}

/** 写入前重新读取，尽量保留其他窗口已注册的页面。 */
export function savePersonalPage(account: string, page: PersonalPage): readonly PersonalPage[] | undefined {
  if (!isPage(page)) throw new Error('Invalid personal page')
  const pages = readPersonalPages(account)
  if (pages.some(item => item.id === page.id)) return pages
  if (pages.some(item => item.name.toLowerCase() === page.name.toLowerCase())) return
  const next = [...pages, page]
  return writePages(account, next)
}

/** 更新排序和显示配置，保留编辑期间从对话发布的新页面。 */
export function savePersonalPageSettings(account: string, settings: readonly PersonalPage[]): boolean {
  const current = readPersonalPages(account)
  const byId = new Map(current.map(page => [page.id, page]))
  const ordered = settings.flatMap(({ id, name, hidden }) => {
    const page = byId.get(id)
    if (!page) return []
    byId.delete(id)
    return [{ ...page, name: name.trim(), hidden: hidden === true }]
  })
  const next = [...ordered, ...byId.values()]
  if (!next.every(isPage)) throw new Error('Invalid personal page')
  if (new Set(next.map(page => page.name.toLowerCase())).size !== next.length) return false
  writePages(account, next)
  return true
}

function writePages(account: string, pages: readonly PersonalPage[]) {
  localStorage.setItem(key(account), JSON.stringify(pages))
  personalPagesChanged.dispatchEvent(new Event('change'))
  return pages
}
