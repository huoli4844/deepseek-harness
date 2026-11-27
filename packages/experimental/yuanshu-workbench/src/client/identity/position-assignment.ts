/** 选择当前有效任职。只比较北京时间的业务日期，不访问网络。 */
import type { RawPositionAssignment } from './model.ts'

const beijingDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short' })

/** 多条有效任职时优先选主岗，同级取最近生效的一条。 */
export function selectCurrentAssignment(rows: readonly RawPositionAssignment[], timestamp: number) {
  const today = beijingDay.format(timestamp)
  return rows.filter((row) => {
    const from = row.startDate.slice(0, 10)
    const to = row.endDate.slice(0, 10)
    return (row.status === undefined || row.status === 1) && (!from || from <= today) && (!to || to >= today)
  }).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.startDate.localeCompare(a.startDate))[0]
}
