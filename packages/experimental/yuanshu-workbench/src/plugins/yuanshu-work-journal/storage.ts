/** 按账号和北京时间半天持久化 JSONL，读写仅限宿主私有目录。 */
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { beijingDay, field, type DailyIdentity } from '../../business-forms/model.ts'
import type { JournalEntry } from './entries.ts'

const half = 43_200_000
const offset = 28_800_000
/** 只取经过鉴权的整数身份，不使用来源会话或客户端路径拼接目录。 */
export function accountKey(owner: DailyIdentity): string {
  if (![owner.tenant, owner.user].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('Invalid journal account')
  return `${owner.tenant}/${owner.user}`
}

/** 北京时间半天文件名；无需在关机期间启动定时任务。 */
export function segmentName(time: number): string {
  return `${beijingDay(time)}-${Math.floor((time + offset) / half) % 2 === 0 ? 'AM' : 'PM'}.jsonl`
}

/** 稳定事件键，同一条事件经两个窗口或恢复重放也只写一次。 */
export function entryKey(entry: { readonly session_id: string; readonly seq: number }): string {
  return `${entry.session_id}:${entry.seq}`
}

function missing(error: unknown): boolean { return field(error, 'code') === 'ENOENT' }

async function load(path: string): Promise<string> {
  try { return await readFile(path, 'utf8') } catch (error) { if (missing(error)) return ''; throw error }
}

function decode(raw: string): JournalEntry[] {
  return raw.split('\n').filter(Boolean).map((line) => {
    const value: unknown = JSON.parse(line)
    const session = field(value, 'session_id'), seq = field(value, 'seq'), time = field(value, 'time')
    const kind = field(value, 'kind'), outcome = field(value, 'outcome'), tool = field(value, 'tool'), paths = field(value, 'paths')
    const text = field(value, 'text')
    if (field(value, 'version') !== 1 || typeof session !== 'string' || typeof seq !== 'number' || !Number.isSafeInteger(seq)
      || typeof time !== 'string' || !Number.isFinite(Date.parse(time)) || typeof text !== 'string'
      || (kind !== 'user/message' && kind !== 'tool/result' && kind !== 'deliverable')
      || (outcome !== 'unverified' && outcome !== 'success' && outcome !== 'error')) throw new Error('Invalid journal record')
    return { version: 1, session_id: session, seq, time, kind, outcome, text, truncated: false,
      ...(typeof tool === 'string' ? { tool } : {}),
      ...(Array.isArray(paths) ? { paths: paths.filter((path): path is string => typeof path === 'string') } : {}) }
  })
}

/** 按序合并、刷盘并原子替换，崩溃时会话日志仍可重放。 */
export async function persistSegment(path: string, entries: readonly JournalEntry[]): Promise<void> {
  const persisted = await load(path)
  const known = new Set(decode(persisted).map(entryKey))
  const fresh = entries.filter((entry) => {
    const id = entryKey(entry)
    if (known.has(id)) return false
    known.add(id)
    return true
  })
  if (fresh.length === 0) return
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, persisted + fresh.map(entry => JSON.stringify(entry) + '\n').join(''), { flag: 'wx', mode: 0o600 })
    const handle = await open(temporary, 'r+')
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}

/** 写入同一账号的指定半天文件。 */
export async function writeSegment(root: string, owner: DailyIdentity, segment: string, entries: readonly JournalEntry[]): Promise<void> {
  const directory = join(root, accountKey(owner))
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await persistSegment(join(directory, segment), entries)
}

/** 同时读取时间窗口所覆盖的已归档和当前分段。 */
export async function readSegments(root: string, owner: DailyIdentity, from: number, to: number): Promise<JournalEntry[]> {
  const directory = join(root, accountKey(owner))
  const result: JournalEntry[] = []
  for (let cursor = Math.floor((from + offset) / half) * half - offset; cursor <= to; cursor += half) {
    const entries = decode(await load(join(directory, segmentName(cursor))))
    for (const item of entries) {
      const time = Date.parse(item.time)
      if (time >= from && time <= to) result.push(item)
    }
  }
  return result
}
