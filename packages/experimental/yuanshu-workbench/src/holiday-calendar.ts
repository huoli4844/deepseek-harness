/** 法定节假日数据：宿主侧代理公开接口，按年缓存，失败时回退过期缓存或降级。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 一年的放假日期与调休补班日期。 */
export interface HolidayYear {
  readonly year: number
  /** 法定放假日期（YYYY-MM-DD）。 */
  readonly rests: readonly string[]
  /** 调休补班日期（YYYY-MM-DD），按工作日处理。 */
  readonly workdays: readonly string[]
  /** live=在线或新鲜缓存；stale=过期缓存兜底。 */
  readonly source: 'live' | 'stale'
}

/** 宿主日志的最小接口，便于隔离具体日志实现。 */
interface HolidayLogger {
  warn(message: string, detail?: unknown): void
}

const ENDPOINT = 'https://timor.tech/api/holiday/year'
/** 内存缓存有效期：6 小时；磁盘缓存只在接口失败时兜底。 */
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000
const CACHE_DIR = join(tmpdir(), 'dsh-holiday-calendar')

const memory = new Map<number, { readonly value: HolidayYear; readonly fetchedAt: number }>()
const inflight = new Map<number, Promise<HolidayYear>>()

interface DiskRecord {
  readonly fetchedAt: number
  readonly rests: readonly string[]
  readonly workdays: readonly string[]
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, key)) return undefined
  return (value as Record<string, unknown>)[key]
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 读取某年的节假日。
 *
 * 命中内存缓存直接返回；否则请求公开接口，失败时回退磁盘缓存（标记 stale），
 * 磁盘也没有时抛出，由调用方降级为“仅周六日=休”。
 */
export async function loadHolidayYear(year: number, logger: HolidayLogger): Promise<HolidayYear> {
  const cached = memory.get(year)
  if (cached !== undefined && Date.now() - cached.fetchedAt < MEMORY_TTL_MS) return cached.value
  const pending = inflight.get(year)
  if (pending !== undefined) return pending
  const task = refresh(year, logger).finally(() => { inflight.delete(year) })
  inflight.set(year, task)
  return task
}

async function refresh(year: number, logger: HolidayLogger): Promise<HolidayYear> {
  try {
    const value: HolidayYear = { year, ...await fetchYear(year), source: 'live' }
    memory.set(year, { value, fetchedAt: Date.now() })
    await saveDisk(year, value)
    return value
  } catch (error) {
    const stale = await readDisk(year)
    if (stale !== undefined) {
      logger.warn('节假日接口不可用，使用磁盘过期缓存兜底', { year, reason: reason(error) })
      const value: HolidayYear = { year, rests: stale.rests, workdays: stale.workdays, source: 'stale' }
      memory.set(year, { value, fetchedAt: Date.now() })
      return value
    }
    logger.warn('节假日接口不可用且无缓存，降级为仅周六日=休', { year, reason: reason(error) })
    throw error
  }
}

/** 请求公开接口并解析出放假与补班日期。 */
async function fetchYear(year: number): Promise<{ rests: string[]; workdays: string[] }> {
  const response = await fetch(`${ENDPOINT}/${year}`, {
    headers: {
      accept: 'application/json',
      // 该站点会拒绝缺少浏览器标识的请求（实测无 UA 返回 403）。
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      referer: 'https://timor.tech/',
    },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`holiday endpoint status ${response.status}`)
  const payload: unknown = await response.json()
  const holiday = field(payload, 'holiday')
  if (field(payload, 'code') !== 0 || typeof holiday !== 'object' || holiday === null) {
    throw new Error('holiday payload invalid')
  }
  const rests = new Set<string>()
  const workdays = new Set<string>()
  for (const entry of Object.values(holiday as Record<string, unknown>)) {
    const date = field(entry, 'date')
    const off = field(entry, 'holiday')
    if (typeof date !== 'string' || !date.startsWith(`${year}-`) || typeof off !== 'boolean') continue
    if (off) rests.add(date)
    else workdays.add(date)
  }
  // 该年份尚未公布时返回空集合，按不可用处理，避免把整年误判成普通工作日。
  if (rests.size === 0) throw new Error('holiday payload empty')
  return { rests: [...rests].sort(), workdays: [...workdays].sort() }
}

async function readDisk(year: number): Promise<DiskRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(CACHE_DIR, `${year}.json`), 'utf8'))
    const rests = field(parsed, 'rests')
    const workdays = field(parsed, 'workdays')
    const fetchedAt = field(parsed, 'fetchedAt')
    if (!Array.isArray(rests) || !Array.isArray(workdays) || typeof fetchedAt !== 'number') return undefined
    return {
      fetchedAt,
      rests: rests.filter((value): value is string => typeof value === 'string'),
      workdays: workdays.filter((value): value is string => typeof value === 'string'),
    }
  } catch {
    return undefined
  }
}

async function saveDisk(year: number, value: HolidayYear): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    const record: DiskRecord = { fetchedAt: Date.now(), rests: value.rests, workdays: value.workdays }
    await writeFile(join(CACHE_DIR, `${year}.json`), JSON.stringify(record))
  } catch {
    // 磁盘缓存写入失败不影响接口结果，下次仍会请求在线数据。
  }
}
