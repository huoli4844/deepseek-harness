/** 客户端读取宿主缓存的节假日数据，失败时由日历降级为仅周末判断。 */

/** 一年的节假日与调休补班日期。 */
export interface HolidayCalendar {
  /** 法定放假日期（YYYY-MM-DD）。 */
  readonly rests: ReadonlySet<string>
  /** 调休补班日期（YYYY-MM-DD），按工作日处理。 */
  readonly workdays: ReadonlySet<string>
  /** 宿主使用了磁盘过期缓存，数据非实时。 */
  readonly degraded: boolean
}

/** 按年缓存成功结果，失败不缓存，下次进入页面会重试。 */
const cache = new Map<number, HolidayCalendar>()

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

function strings(value: unknown, key: string): string[] | undefined {
  const found = field(value, key)
  if (!Array.isArray(found)) return undefined
  return found.filter((item): item is string => typeof item === 'string')
}

/** 读取指定年份的节假日；接口不可用或数据缺失时返回 undefined。 */
export async function loadHolidayCalendar(year: number, signal: AbortSignal): Promise<HolidayCalendar | undefined> {
  const cached = cache.get(year)
  if (cached !== undefined) return cached
  const token = localStorage.getItem('workbench-client-token')
  if (!token) return undefined
  try {
    const response = await fetch(`/yuanshu-workbench/holidays?year=${year}`, {
      headers: {
        authorization: `Bearer ${token}`,
        'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
      },
      signal,
    })
    if (!response.ok) return undefined
    const value = field(await response.json(), 'data')
    const rests = strings(value, 'rests')
    const workdays = strings(value, 'workdays')
    if (rests === undefined || workdays === undefined) return undefined
    const result: HolidayCalendar = {
      rests: new Set(rests), workdays: new Set(workdays), degraded: field(value, 'source') === 'stale',
    }
    cache.set(year, result)
    return result
  } catch {
    return undefined
  }
}
