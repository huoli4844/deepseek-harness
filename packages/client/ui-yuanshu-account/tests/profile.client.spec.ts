// @vitest-environment jsdom
/** 元枢账号资料读取：token 优先级、缓存容错与网关响应归一化。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROFILE_STORAGE_KEY,
  avatarInitial,
  displayName,
  fetchCurrentUser,
  readAuthToken,
  readCachedProfile,
} from '../src/client/profile.ts'

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('readAuthToken', () => {
  it('prefers the newest login key and ignores blank values', () => {
    window.localStorage.setItem('yuanshu-login-token', 'legacy')
    window.localStorage.setItem('workbench-client-token', '  ')
    window.localStorage.setItem('yuanshu-token', 'current')
    expect(readAuthToken()).toBe('current')
    window.localStorage.removeItem('yuanshu-token')
    expect(readAuthToken()).toBe('legacy')
  })

  it('returns undefined without storage', () => {
    expect(readAuthToken(undefined)).toBeUndefined()
  })
})

describe('readCachedProfile', () => {
  it('reads the login-page cache and ignores malformed values', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ username: 'admin', nickname: '管理员' }))
    expect(readCachedProfile()).toEqual({ username: 'admin', nickname: '管理员' })
    window.localStorage.setItem(PROFILE_STORAGE_KEY, '{')
    expect(readCachedProfile()).toBeUndefined()
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ other: 1 }))
    expect(readCachedProfile()).toBeUndefined()
  })
})

describe('fetchCurrentUser', () => {
  it('sends the bearer token and unwraps the response envelope', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ code: 0, message: 'success', data: { id: 1, username: 'admin', nickname: '管理员' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as unknown as typeof fetch
    await expect(fetchCurrentUser('token-1', fetchImpl)).resolves.toEqual({ username: 'admin', nickname: '管理员' })
    expect(fetchImpl).toHaveBeenCalledWith('/yuanshu-api/user/me', {
      method: 'GET',
      headers: { Accept: 'application/json', authorization: 'Bearer token-1' },
    })
  })

  it('degrades to undefined without a token, on non-2xx and on network failure', async () => {
    const unauthorized = vi.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch
    const rejected = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    expect(await fetchCurrentUser(undefined, unauthorized)).toBeUndefined()
    expect(await fetchCurrentUser('token', unauthorized)).toBeUndefined()
    expect(await fetchCurrentUser('token', rejected)).toBeUndefined()
  })
})

describe('identity labels', () => {
  it('prefers the nickname and falls back to the username, then to the YuanShu mark', () => {
    expect(displayName({ username: 'admin', nickname: '管理员' })).toBe('管理员')
    expect(displayName({ username: 'admin', nickname: ' ' })).toBe('admin')
    expect(displayName(undefined)).toBeUndefined()
    expect(avatarInitial('管理员')).toBe('管')
    expect(avatarInitial(undefined)).toBe('元')
  })
})
