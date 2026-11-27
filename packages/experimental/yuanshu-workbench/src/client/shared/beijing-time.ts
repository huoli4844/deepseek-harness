/** 格式化带时区的时间戳，仅供客户端展示，不依赖 React 或设备时区。 */
const beijingDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/**
 * 将带时区的 ISO 时间戳转换为北京时间。
 * @param value 接口返回的时间戳。
 * @returns 北京时间字符串。无法确定时区或解析时返回空值。
 */
export function formatBeijingDateTime(value: string | undefined): string | undefined {
  if (value === undefined || !/(?:Z|[+-]\d{2}:\d{2})$/iu.test(value)) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? beijingDateTime.format(timestamp) : undefined
}
