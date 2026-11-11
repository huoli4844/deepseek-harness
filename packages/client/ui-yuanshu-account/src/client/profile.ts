/** 元枢账号资料的浏览器读取：登录页缓存 + 同源网关实时查询。
 *
 * 身份只有一份：登录页写入的元枢 token 是唯一凭据。这里不做登录，只把
 * “当前是谁”展示到侧栏；token 失效时静默降级，由工作台请求自行提示登录。
 */

/** 登录页写入的用户资料缓存键。 */
export const PROFILE_STORAGE_KEY = 'yuanshu-user'

/** 登录页可能写入 token 的键，按优先级从新到旧。 */
export const TOKEN_STORAGE_KEYS = ['yuanshu-token', 'workbench-client-token', 'yuanshu-login-token'] as const

/** 侧栏展示所需的元枢账号字段。 */
export interface YuanShuProfile {
  readonly username?: string
  readonly nickname?: string
}

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
 * 读取登录页缓存的账号资料；损坏或形状不符时返回 undefined。
 * @param storage - Browser storage to read; defaults to localStorage.
 * @returns Cached username and nickname, or undefined for unavailable or invalid data.
 */
export function readCachedProfile(storage: KeyValueStorage | undefined = defaultStorage()): YuanShuProfile | undefined {
  if (storage === undefined) return undefined
  let raw: string | null = null
  try {
    raw = storage.getItem(PROFILE_STORAGE_KEY)
  } catch {
    return undefined
  }
  if (raw === null) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  return toProfile(parsed)
}

/**
 * 展示名：昵称优先，其次账号名。
 * @param profile - Cached or fetched account fields.
 * @returns The trimmed nickname, then username, or undefined.
 */
export function displayName(profile: YuanShuProfile | undefined): string | undefined {
  const nickname = profile?.nickname?.trim()
  if (nickname !== undefined && nickname.length > 0) return nickname
  const username = profile?.username?.trim()
  return username !== undefined && username.length > 0 ? username : undefined
}

/**
 * 头像首字；无资料时用元枢的“元”。
 * @param name - Display name, when available.
 * @returns The first grapheme cluster, or the YuanShu fallback mark.
 */
export function avatarInitial(name: string | undefined): string {
  return name === undefined || name.length === 0
    ? '元'
    : new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)[Symbol.iterator]().next().value?.segment ?? '元'
}

/**
 * 同源网关查询当前账号；未登录、网络失败或非 2xx 都返回 undefined。
 * @param token - Bearer token; defaults to the stored token.
 * @param fetchImpl - HTTP implementation; defaults to global fetch.
 * @returns Current account fields, or undefined for unavailable credentials, request failures, or invalid responses.
 */
export async function fetchCurrentUser(
  token: string | undefined = readAuthToken(),
  fetchImpl: typeof fetch | undefined = globalThis.fetch,
): Promise<YuanShuProfile | undefined> {
  if (token === undefined || token.trim().length === 0) return undefined
  let response: Response
  try {
    response = await fetchImpl('/yuanshu-api/user/me', {
      method: 'GET',
      headers: { Accept: 'application/json', authorization: `Bearer ${token}` },
    })
  } catch {
    return undefined
  }
  if (!response.ok) return undefined
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return undefined
  }
  return toProfile(payload)
}

/** 兼容 `{ code, message, data }` 信封与扁平响应。 */
function toProfile(payload: unknown): YuanShuProfile | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  const value = 'data' in record ? record.data : record
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const user = value as Record<string, unknown>
  const username = typeof user.username === 'string' && user.username.length > 0 ? user.username : undefined
  const nickname = typeof user.nickname === 'string' && user.nickname.length > 0 ? user.nickname : undefined
  return username === undefined && nickname === undefined
    ? undefined
    : { ...(username === undefined ? {} : { username }), ...(nickname === undefined ? {} : { nickname }) }
}
