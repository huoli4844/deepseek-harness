/** 计算周报月份范围内的周选项，不依赖界面或服务。 */
import { moveDate, weekStart } from './project-registration-viewmodel.ts'

/** 以与月份相交的周一至周日为每周选项。 */
export function weeksInMonth(month: string): readonly string[] {
  const weeks: string[] = []
  let week = weekStart(`${month}-01`)
  while (week.slice(0, 7) <= month) {
    weeks.push(week)
    week = moveDate(week, 7)
  }
  return weeks
}
