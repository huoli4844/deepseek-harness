/** Browser display-cache ownership. Console JWTs authorize login only; enterprise access uses separate OAuth grants in the host vault. */
/** 登录页可能写入 token 的键，按优先级从新到旧。 */
export const TOKEN_STORAGE_KEYS = ['yuanshu-token', 'workbench-client-token', 'yuanshu-login-token'] as const

/** 知识问答会话（session_id + 已展示消息）的持久化键。 */
export const QA_SESSION_STORAGE_KEY = 'yuanshu-chat-qa-session'

/** 当前选中租户的持久化键。元枢要求多租户用户显式选择租户。 */
export const TENANT_STORAGE_KEY = 'yuanshu-active-tenant'

/** 只依赖 localStorage 的最小接口，便于在测试中注入内存实现。 */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * 浏览器 localStorage；在非浏览器环境或禁用存储时返回 undefined。
 * @returns Browser storage, or undefined when unavailable.
 */
export function defaultStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * 读取当前元枢 token；空白值视为未登录。
 * @param storage - Browser storage to read; defaults to localStorage.
 * @returns The first nonblank stored token, or undefined.
 */
export function readAuthToken(storage: KeyValueStorage | undefined = defaultStorage()): string | undefined {
  if (storage === undefined) return undefined
  for (const key of TOKEN_STORAGE_KEYS) {
    let value: string | null = null
    try {
      value = storage.getItem(key)
    } catch {
      return undefined
    }
    if (value !== null && value.trim().length > 0) return value
  }
  return undefined
}

/**
 * 读取用户显式选择的租户；未选择时企业授权与问答持久化不可用。
 * @param storage - Browser storage to read; defaults to localStorage.
 * @returns The selected tenant, or undefined when none is available.
 */
export function readActiveTenant(storage: KeyValueStorage | undefined = defaultStorage()): string | undefined {
  if (storage === undefined) return undefined
  try {
    const value = storage.getItem(TENANT_STORAGE_KEY)
    return value !== null && value.trim().length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 保存用户选择的租户；传 undefined 表示回到默认（当前）租户。
 * @param tenantId - Selected tenant; undefined clears the selection.
 * @param storage - Browser storage to update; defaults to localStorage.
 */
export function writeActiveTenant(tenantId: string | undefined, storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    if (tenantId === undefined || tenantId.length === 0) storage.removeItem(TENANT_STORAGE_KEY)
    else storage.setItem(TENANT_STORAGE_KEY, tenantId)
  } catch {
    // 存储不可用时仅失去刷新后的租户记忆，不影响本次会话。
  }
}

/**
 * Partition display-only cache by console subject and explicitly selected tenant.
 * JWT claims select a local cache only; the platform independently verifies authorization.
 * Opaque, missing or malformed login tokens disable persistence. Legacy unowned records are ignored.
 * @param storage - Login and tenant storage.
 * @returns Non-secret display-cache owner, or undefined when no subject is available.
 */
export function qaStorageIdentity(storage: KeyValueStorage | undefined = defaultStorage()): string | undefined {
  const token = readAuthToken(storage), selectedTenant = readActiveTenant(storage)
  if (token === undefined || selectedTenant === undefined) return undefined
  try {
    const part = token.split('.')[1]
    if (part === undefined) return undefined
    const payload: unknown = JSON.parse(atob(part.replace(/-/gu, '+').replace(/_/gu, '/')))
    if (payload === null || typeof payload !== 'object' || !('user_id' in payload) || !Number.isSafeInteger(payload.user_id) || Number(payload.user_id) <= 0) return undefined
    const issuer = 'iss' in payload && typeof payload.iss === 'string' ? payload.iss : ''
    return JSON.stringify([issuer, payload.user_id, selectedTenant])
  } catch { return undefined }
}

/** 一条可恢复的引用；只保存展示所需字段。 */
export interface StoredQaCitation {
  readonly evidence_id: string
  readonly document_id: string
  readonly title?: string
  readonly content_preview?: string
}

/** 一条可恢复的消息。 */
export interface StoredQaMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly citations?: readonly StoredQaCitation[]
}

/** 持久化的问答会话。session_id 用于服务端续接同一会话。 */
export interface StoredQaSession {
  readonly sessionId?: string
  readonly messages: readonly StoredQaMessage[]
}

/**
 * 读取已保存的问答会话；损坏或形状不符的数据按空会话处理。
 * @param storage - Browser storage to read; defaults to localStorage.
 * @returns Restorable session fields; invalid records become an empty session.
 */
export function loadQaSession(storage: KeyValueStorage | undefined = defaultStorage()): StoredQaSession {
  if (storage === undefined) return { messages: [] }
  let raw: string | null = null
  try {
    raw = storage.getItem(QA_SESSION_STORAGE_KEY)
  } catch {
    return { messages: [] }
  }
  if (raw === null) return { messages: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { messages: [] }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { messages: [] }
  const record = parsed as Record<string, unknown>
  const owner = qaStorageIdentity(storage)
  if (owner === undefined || record.owner !== owner) return { messages: [] }
  const sessionId = typeof record.sessionId === 'string' && record.sessionId.length > 0 ? record.sessionId : undefined
  const messages = Array.isArray(record.messages) ? record.messages.flatMap(readMessage) : []
  return { ...(sessionId === undefined ? {} : { sessionId }), messages }
}

function readMessage(value: unknown): StoredQaMessage[] {
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const role = record.role
  const content = record.content
  if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.length === 0) return []
  const citations = Array.isArray(record.citations) ? record.citations.flatMap(readCitation) : []
  return [{
    role,
    content,
    ...(citations.length === 0 ? {} : { citations }),
  }]
}

function readCitation(value: unknown): StoredQaCitation[] {
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const evidenceId = record.evidence_id
  const documentId = record.document_id
  if (typeof evidenceId !== 'string' || typeof documentId !== 'string') return []
  return [{
    evidence_id: evidenceId,
    document_id: documentId,
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
    ...(typeof record.content_preview === 'string' ? { content_preview: record.content_preview } : {}),
  }]
}

/**
 * 保存问答会话；存储不可用时静默忽略，不影响会话本身。
 * @param session - Question-and-answer session to persist.
 * @param storage - Browser storage to update; defaults to localStorage.
 */
export function saveQaSession(session: StoredQaSession, storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    const owner = qaStorageIdentity(storage)
    if (owner === undefined) return
    storage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify({ ...session, owner }))
  } catch {
    // 配额已满或被浏览器禁用时只失去刷新恢复能力，不阻断问答。
  }
}

/**
 * 清除持久化的问答会话。
 * @param storage - Browser storage to update; defaults to localStorage.
 */
export function clearQaSession(storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    storage.removeItem(QA_SESSION_STORAGE_KEY)
  } catch {
    // 同 saveQaSession：存储不可用不构成业务错误。
  }
}
