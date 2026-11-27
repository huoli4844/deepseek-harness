/** 管理采集队列、会话回放与日报读取；不依赖浏览器、后端写入或远端查询。 */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session/types'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DailyIdentity } from '../../business-forms/model.ts'
import { recordedOwners, sameOwner } from '../yuanshu-work-evidence/index.ts'
import { JournalProjection, type JournalEntry } from './entries.ts'
import { accountKey, readSegments, segmentName, writeSegment } from './storage.ts'

type Batch = { owner: DailyIdentity; segment: string; rows: JournalEntry[] }

/** 每个宿主实例管理一个写队列，按租户、账号和分段保存。 */
export class WorkJournal {
  private readonly pending = new Map<string, Batch>()
  private readonly live = new Map<Session, { owner: DailyIdentity; projection: JournalProjection; next: number }>()
  private readonly recoveries = new Map<string, Promise<void>>()
  private writing: Promise<void> | undefined
  private closing = false

  constructor(private readonly ctx: Context,
    private readonly root = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'workbench-journal')) {}

  /** 监听已提交事件，并在会话检查点和宿主卸载时刷盘。 */
  install(): void {
    const ctx = this.ctx
    ctx.on('session/event', (session, event) => { this.capture(session, event) })
    ctx.on('session/disposed', (session) => { this.live.delete(session) })
    ctx.on('session/flush', async () => { await this.flush().catch(() => { this.warn() }) })
    ctx.effect(() => {
      const timer = setInterval(() => { void this.flush().catch(() => { this.warn() }) }, 2000)
      timer.unref()
      return async () => {
        this.closing = true
        clearInterval(timer)
        await this.flush().catch(() => { this.warn() })
      }
    }, 'work-journal: flush local records')
  }

  /** 绑定通过校验后回放当前会话，并异步补齐最近本地持久会话。 */
  async follow(session: Session, owner: DailyIdentity): Promise<void> {
    if (this.closing || this.ctx.sessions.get(session.id) !== session
      || session.header.isSeeded || session.header.origin === 'subagent') throw new Error('Invalid journal session')
    const key = accountKey(owner)
    if (this.live.get(session) === undefined) {
      // 读取归属的同时暂存新事件；快照已包含的事件由序号去重。
      const buffered: SessionEvent[] = []
      const dispose = this.ctx.on('session/event', (target, event) => { if (target === session) buffered.push(event) })
      try {
        const snapshot = await this.ctx.sessionQuery.readSession(session.id)
        if (!this.accepting() || this.ctx.sessions.get(session.id) !== session || !this.owned(snapshot.events, owner)) {
          throw new Error('Invalid journal owner')
        }
        if (!this.live.has(session)) {
          for (const [target, previous] of this.live) if (!sameOwner(previous.owner, owner)) this.live.delete(target)
          this.live.set(session, { owner, projection: new JournalProjection(session.id, session.header.cwd), next: 0 })
          for (const event of snapshot.events) this.capture(session, event)
          for (const event of buffered) this.capture(session, event)
        }
      } finally { dispose() }
    }
    const live = this.live.get(session)
    if (live === undefined || !sameOwner(live.owner, owner)) throw new Error('Invalid journal owner')
    if (this.recoveries.has(key)) return
    const recovery = this.recover(owner, session.id).catch(() => {
      this.recoveries.delete(key)
      this.warn()
    })
    this.recoveries.set(key, recovery)
  }

  /** 读取当前账号的本地时间窗口，并纳入刷盘前的新事件。 */
  async read(owner: DailyIdentity, from: number, to: number, signal: AbortSignal): Promise<JournalEntry[]> {
    await this.recoveries.get(accountKey(owner))
    signal.throwIfAborted()
    await this.flush()
    signal.throwIfAborted()
    return readSegments(this.root, owner, from, to)
  }

  /** 串行写盘；失败批次保留到下一次重试。 */
  async flush(): Promise<void> {
    while (this.writing !== undefined) await this.writing
    if (this.pending.size === 0) return
    const writing = this.drain()
    this.writing = writing
    try { await writing } finally { this.writing = undefined }
  }

  private capture(session: Session, event: SessionEvent): void {
    const lens = this.live.get(session)
    if (this.closing || lens === undefined || event.seq < lens.next) return
    lens.next = event.seq + 1
    const row = lens.projection.event(event)
    if (row !== undefined) this.enqueue(lens.owner, row)
  }

  private owned(events: readonly SessionEvent[], owner: DailyIdentity): boolean {
    const owners = recordedOwners(events)
    return owners.length === 1 && owners[0]?.user === owner.user && owners[0].tenant === owner.tenant
  }

  private async recover(owner: DailyIdentity, current: SessionId): Promise<void> {
    const records = await this.ctx.sessionQuery.filterSessions([])
    const earliest = Date.now() - 172_800_000
    for (const { header } of records.slice(0, 100)) {
      if (this.closing) return
      if (header.id === current || header.isSeeded || header.origin === 'subagent') continue
      try {
        const snapshot = await this.ctx.sessionQuery.readSession(header.id)
        if (!this.accepting() || !this.owned(snapshot.events, owner)) continue
        const projection = new JournalProjection(header.id, header.cwd)
        for (const event of snapshot.events) {
          const row = projection.event(event)
          if (row !== undefined && event.time >= earliest) this.enqueue(owner, row)
        }
      } catch { this.warn() }
    }
  }

  private enqueue(owner: DailyIdentity, row: JournalEntry): void {
    const segment = segmentName(Date.parse(row.time)), key = `${accountKey(owner)}/${segment}`
    const batch = this.pending.get(key)
    if (batch === undefined) this.pending.set(key, { owner, segment, rows: [row] })
    else batch.rows.push(row)
  }

  private async drain(): Promise<void> {
    for (const [key, batch] of [...this.pending]) {
      const rows = batch.rows.splice(0)
      try { await writeSegment(this.root, batch.owner, batch.segment, rows) }
      catch (error) { batch.rows.unshift(...rows); throw error }
      if (batch.rows.length === 0) this.pending.delete(key)
    }
  }

  private warn(): void { this.ctx.logger.warn('工作记录处理失败；原会话日志仍保留') }
  private accepting(): boolean { return !this.closing }
}
