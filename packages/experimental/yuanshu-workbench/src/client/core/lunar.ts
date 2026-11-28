/**
 * 农历显示工具：基于运行时内置 Intl 中历（`zh-CN-u-ca-chinese`）换算农历月日。
 * Chromium/Electron 与 Node 均随运行时内置完整 ICU 历法数据，无需自维护万年历数据表；
 * 运行时缺少中历支持时返回空串降级，调用方按无值处理。
 * 纯函数层：只做历法换算与历法固定名词输出，不依赖 React、fetch 与宿主 API；
 * 输出的月日名（正月/初五等）是历法名词，不属于界面文案 key。
 */

/** 中历格式化器：month=long 输出「正月」「闰六月」等月名，day=numeric 输出当月天数的数字。 */
const lunarFormat = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' })

/** 农历日 1–30 的中文日名；二十一至二十九按「廿」缩写。 */
const lunarDayNames: readonly string[] = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
]

/**
 * 取公历日期的农历显示名：初一显示月名（如「正月」「闰六月」），其余显示日名（如「十五」）。
 * @param date - 公历日期（本地时区）。
 * @returns 农历显示名；无法换算时为空串。
 */
export function lunarLabel(date: Date): string {
  try {
    const parts = lunarFormat.formatToParts(date)
    const month = parts.find(part => part.type === 'month')?.value ?? ''
    const day = Number(parts.find(part => part.type === 'day')?.value)
    if (month === '' || !Number.isInteger(day) || day < 1 || day > 30) return ''
    return day === 1 ? month : lunarDayNames[day - 1] ?? ''
  } catch {
    return ''
  }
}

/**
 * 取 ISO 日期串的农历显示名；格式非法或无法换算时返回空串。
 * @param iso - 形如 2026-11-28 的日期串。
 * @returns 农历显示名；无法换算时为空串。
 */
export function isoLunarLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return ''
  return lunarLabel(new Date(`${iso}T12:00:00`))
}
