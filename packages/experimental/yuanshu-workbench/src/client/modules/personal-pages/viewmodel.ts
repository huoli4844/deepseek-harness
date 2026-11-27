/** 把个人页的相对日期配置转换为本次查询范围。 */
import { beijingDate, moveDate, weekStart } from '../business-modules/project-registration-viewmodel.ts'
import type { PersonalPage } from './model.ts'

/** 每次打开时按北京时间重新计算周期。 */
export function personalLaborRange(page: PersonalPage) {
  const today = beijingDate()
  const dateFrom = page.period === 'week' ? weekStart(today) : today.slice(0, 7) + '-01'
  const dateTo = page.period === 'week' ? moveDate(dateFrom, 6)
    : new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return { projectCode: page.projectCode ?? '', dateFrom, dateTo }
}

/** 将页面向前或向后移动一位。 */
export function movePersonalPage(pages: readonly PersonalPage[], index: number, offset: -1 | 1): readonly PersonalPage[] {
  const target = index + offset
  const page = pages[index], neighbor = pages[target]
  if (!page || !neighbor) return pages
  const next = [...pages]
  next[index] = neighbor
  next[target] = page
  return next
}
