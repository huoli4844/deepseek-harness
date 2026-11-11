/** 元枢工作台的浏览器持久化：身份 token 与知识问答会话。
 *
 * 身份只有一份：登录页写入的元枢 token 就是工作台、网关和工具链路的
 * principal。这里不在插件启动时缓存 token，而是在每次请求前读取，避免
 * 用户先打开页面、后完成登录时界面继续使用空凭据。
 */

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

/** 浏览器 localStorage；在非浏览器环境或禁用存储时返回 undefined。 */
export function defaultStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** 读取当前元枢 token；空白值视为未登录。 */
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

/** 读取用户显式选择的租户；未选择时由网关回退到 token 的当前租户。 */
export function readActiveTenant(storage: KeyValueStorage | undefined = defaultStorage()): string | undefined {
  if (storage === undefined) return undefined
  try {
    const value = storage.getItem(TENANT_STORAGE_KEY)
    return value !== null && value.trim().length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/** 保存用户选择的租户；传 undefined 表示回到默认（当前）租户。 */
export function writeActiveTenant(tenantId: string | undefined, storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    if (tenantId === undefined || tenantId.length === 0) storage.removeItem(TENANT_STORAGE_KEY)
    else storage.setItem(TENANT_STORAGE_KEY, tenantId)
  } catch {
    // 存储不可用时仅失去刷新后的租户记忆，不影响本次会话。
  }
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

/** 读取已保存的问答会话；损坏或形状不符的数据按空会话处理。 */
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
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { messages: [] }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { messages: [] }
  const record = parsed as Record<string, unknown>
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

/** 保存问答会话；存储不可用时静默忽略，不影响会话本身。 */
export function saveQaSession(session: StoredQaSession, storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    storage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // 配额已满或被浏览器禁用时只失去刷新恢复能力，不阻断问答。
  }
}

/** 清除持久化的问答会话。 */
export function clearQaSession(storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    storage.removeItem(QA_SESSION_STORAGE_KEY)
  } catch {
    // 同 saveQaSession：存储不可用不构成业务错误。
  }
}
