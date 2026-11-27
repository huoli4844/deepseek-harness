/** 本地待确认日报缓存；只保存脱离登录令牌也无法直接调用后台的业务正文。 */
import { parseContent, type DailyContent, type EvidenceRef } from '../../../business-forms/model.ts'

const key = 'dsh.yuanshu.daily-report.pending.v1'
interface PendingRecord {
  readonly version: 1
  readonly account: string
  readonly work_date: string
  readonly content: DailyContent
  readonly evidence_refs: readonly EvidenceRef[]
  readonly request_id: string
  readonly action: 'save' | 'submit'
  readonly stored_at: number
}

function read(): PendingRecord | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    if (record.version !== 1 || typeof record.account !== 'string' || typeof record.work_date !== 'string'
      || typeof record.request_id !== 'string' || !/^[0-9a-f-]{36}$/u.test(record.request_id)
      || (record.action !== 'save' && record.action !== 'submit') || typeof record.stored_at !== 'number'
      || !Array.isArray(record.evidence_refs)) return
    return { version: 1, account: record.account, work_date: record.work_date,
      content: parseContent(record.content), evidence_refs: record.evidence_refs.map((item) => {
        if (typeof item !== 'object' || item === null) throw new Error('invalid evidence')
        const source = item as Record<string, unknown>
        if (typeof source.session_id !== 'string' || !Number.isSafeInteger(source.seq) || (source.seq as number) < 0) throw new Error('invalid evidence')
        return { session_id: source.session_id, seq: source.seq as number }
      }), request_id: record.request_id, action: record.action, stored_at: record.stored_at }
  } catch { return }
}

/** 计算不含登录令牌的本地账号分区标识。 */
export async function pendingAccountKey(): Promise<string | undefined> {
  const tenant = localStorage.getItem('yuanshu-active-tenant')
  const token = localStorage.getItem('workbench-client-token')
  if (!tenant || !token) return
  const bytes = new TextEncoder().encode(token)
  let digest: ArrayBuffer
  try { digest = await globalThis.crypto.subtle.digest('SHA-256', bytes) }
  catch { return tenant + ':' + String(token.length) }
  return tenant + ':' + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

/** 保存需要用户确认的最终请求，不保存凭证。 */
export function savePending(record: Omit<PendingRecord, 'version' | 'stored_at'>): void {
  localStorage.setItem(key, JSON.stringify({ ...record, version: 1, stored_at: Date.now() }))
}

/** 读取当前浏览器中的待处理记录。 */
export async function readPending(): Promise<PendingRecord | undefined> {
  const value = read(), account = await pendingAccountKey()
  return value?.account === account ? value : undefined
}

/** 删除已经确认成功或用户放弃的记录。 */
export function clearPending(): void { localStorage.removeItem(key) }

export type { PendingRecord }
