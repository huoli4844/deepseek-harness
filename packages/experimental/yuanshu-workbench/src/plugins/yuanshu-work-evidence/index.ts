/** 工作依据插件：只读取已绑定账号的会话正文和工具结果，不读取系统提示、思维过程或任意文件。 */
import type { Context } from '@deepseek-ai/cordis'
import { appendPluginRecord, pluginRecordOf, type Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import { beijingDay, field, type DailyIdentity, type WorkEvidence } from '../../business-forms/model.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** 企业账号归属；只由宿主在空白、非派生会话中写入。 */
    'plugin:yuanshu-workbench/account-owner': { readonly user: number; readonly tenant: number }
  }
}

/** 账号归属相同才允许恢复日报能力。 */
export function sameOwner(left: DailyIdentity, right: DailyIdentity): boolean {
  return left.user === right.user && left.tenant === right.tenant
}

/** 读取唯一的会话归属记录；无归属或不一致时不允许恢复。 */
export function recordedOwners(events: readonly SessionEvent[]) {
  return events.flatMap((event) => {
    const record = pluginRecordOf(event)
    // 旧会话沿用原归属记录，避免插件更名后丢失账号边界。
    if (record?.type !== 'plugin:yuanshu-workbench/account-owner'
      && record?.type !== 'plugin:client-yuanshu-workbench/account-owner') return []
    return [{ user: field(record.data, 'user'), tenant: field(record.data, 'tenant') }]
  })
}

/** 仅表示此会话必须另开；基础设施失败不应被误报为归属冲突。 */
export class SessionOwnershipError extends Error {}

/** 验证持久化归属；旧的无归属历史会话必须新建，不能自动认领。 */
export async function bindOwner(ctx: Context, session: Session, identity: DailyIdentity): Promise<void> {
  if (session.header.isSeeded || session.header.origin === 'subagent') throw new SessionOwnershipError('Derived sessions cannot bind enterprise accounts')
  const snapshot = await ctx.sessionQuery.readSession(session.id)
  const owners = recordedOwners(snapshot.events)
  if (owners.length !== 0) {
    if (owners.length !== 1 || owners[0]?.user !== identity.user || owners[0].tenant !== identity.tenant) throw new SessionOwnershipError('Account ownership mismatch')
    return
  }
  if (snapshot.events.some(event => event.type === 'user/message' || event.type === 'turn/start')) {
    throw new SessionOwnershipError('Unowned nonblank session')
  }
  if (session.seq !== snapshot.events.length) throw new Error('Session changed during account binding')
  appendPluginRecord(session, 'plugin:yuanshu-workbench/account-owner', { user: identity.user, tenant: identity.tenant })
  await ctx.sessions.flush(session)
}

function visibleText(event: SessionEvent): string {
  const message = event.type === 'user/message' ? event.data
    : event.type === 'assistant/message' || event.type === 'tool/result' ? event.data.message : undefined
  const content = field(message, 'content')
  if (!Array.isArray(content)) return ''
  return content.flatMap(item => field(item, 'type') === 'text' && typeof field(item, 'text') === 'string' ? [String(field(item, 'text'))] : [])
    .join('\n')
    .replace(/Bearer\s+[a-z0-9._~+\/-]+=*/giu, 'Bearer [REDACTED]')
    .replace(/((?:access_token|refresh_token|api[_-]?key|password|secret)["']?\s*[:=]\s*["']?)[^\s,"'}]+/giu, '$1[REDACTED]')
}

function sessionEvidence(id: string, events: readonly SessionEvent[], from: number, to: number): WorkEvidence[] {
  const calls = new Map<string, string>()
  const evidence: WorkEvidence[] = []
  for (const event of events) {
    if (event.time > to) continue
    if (event.type === 'tool/call') {
      calls.set(event.data.callId, event.data.name)
      continue
    }
    if (event.time < from) continue
    if (event.type === 'user/message' && event.data.source.kind !== 'user') continue
    if (event.type !== 'user/message' && event.type !== 'assistant/message' && event.type !== 'tool/result') continue
    const tool = event.type === 'tool/result' ? calls.get(event.data.message.toolCallId) : undefined
    // 日报整理本身的结果不能再次被卷入下一次整理。
    if (tool?.startsWith('work_evidence_') || tool?.startsWith('work_records_')) continue
    const text = visibleText(event)
    if (!text && tool === undefined) continue
    evidence.push({ session_id: id, seq: event.seq, kind: event.type, time: new Date(event.time).toISOString(),
      ...(tool === undefined ? {} : { tool }),
      outcome: event.type === 'tool/result' ? event.data.message.isError === true ? 'error' : 'success'
        : event.type === 'assistant/message' && event.data.interrupted === true ? 'interrupted' : 'unverified',
      text: text.slice(0, 4000), truncated: text.length > 4000 })
  }
  return evidence
}

/** 扫描本机归属于同一租户和账号的工作台会话，分页返回指定周期的可见内容。 */
export async function readWeeklyConversationPage(ctx: Context, owner: DailyIdentity, from: number, to: number,
  offset: number, signal: AbortSignal) {
  const records = (await ctx.sessionQuery.filterSessions([], signal)).sort((a, b) => a.header.id.localeCompare(b.header.id))
  const selected: WorkEvidence[] = []
  let position = 0
  let unreadable = 0
  for (const { header } of records) {
    signal.throwIfAborted()
    if (header.isSeeded || header.origin === 'subagent') continue
    const snapshot = await ctx.sessionQuery.readSession(header.id).catch(() => null)
    signal.throwIfAborted()
    if (snapshot === null) { unreadable++; continue }
    const [recorded, ...others] = recordedOwners(snapshot.events)
    if (others.length || recorded?.user !== owner.user || recorded.tenant !== owner.tenant) continue
    for (const entry of sessionEvidence(header.id, snapshot.events.slice(snapshot.inheritedEventCount), from, to)) {
      if (position++ < offset) continue
      if (selected.length === 20) return { entries: selected, next_offset: position - 1, unreadable }
      selected.push(entry)
    }
  }
  return { entries: selected, next_offset: null, unreadable }
}

/** 读取已验证会话的当日依据；保留来源种类，不能把模型陈述等同于完成证明。 */
export async function readDailyEvidence(ctx: Context, sessions: readonly Session[], signal: AbortSignal,
  lookbackMinutes?: number, now = Date.now()): Promise<{
  readonly work_date: string
  readonly range_start: string
  readonly range_end: string
  readonly evidence: readonly WorkEvidence[]
  readonly truncated: boolean
}> {
  const date = beijingDay(now)
  if (lookbackMinutes !== undefined && (!Number.isSafeInteger(lookbackMinutes) || lookbackMinutes < 1 || lookbackMinutes > 1440)) {
    throw new RangeError('日报回看分钟数须为 1 到 1440 的整数')
  }
  const from = lookbackMinutes === undefined ? Date.parse(`${date}T00:00:00+08:00`) : now - lookbackMinutes * 60_000
  const evidence: WorkEvidence[] = []
  for (const session of sessions) {
    signal.throwIfAborted()
    const snapshot = await ctx.sessionQuery.readSession(session.id)
    signal.throwIfAborted()
    for (const item of sessionEvidence(session.id, snapshot.events.slice(snapshot.inheritedEventCount), from, now)) evidence.push(item)
  }
  // 全部入选会话按时间统一取最近记录，避免某个会话独占额度。
  const selected = evidence.sort((a, b) => a.time.localeCompare(b.time)).slice(-100)
  return { work_date: date, range_start: new Date(from).toISOString(), range_end: new Date(now).toISOString(),
    evidence: selected, truncated: selected.length < evidence.length || selected.some(item => item.truncated) }
}
