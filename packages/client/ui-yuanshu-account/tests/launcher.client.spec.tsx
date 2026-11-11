// @vitest-environment jsdom
/** 侧栏元枢身份入口：缓存首帧、服务端覆盖、菜单动作与降级。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { YuanShuAccountLauncher, type YuanShuAccountLauncherProps } from '../src/client/YuanShuAccountLauncher.tsx'
import { zh, type YuanShuAccountKey } from '../src/client/locales.ts'

function translate(key: string): string {
  return zh[key as YuanShuAccountKey] ?? key
}

function props(overrides: Partial<YuanShuAccountLauncherProps> = {}): YuanShuAccountLauncherProps {
  return {
    usePanelInfo: () => { throw new Error('unused account launcher hook') },
    useSessions: () => { throw new Error('unused account launcher hook') },
    useSessionStatus: () => { throw new Error('unused account launcher hook') },
    useSessionRetainInfo: () => { throw new Error('unused account launcher hook') },
    useRemoteAccess: () => { throw new Error('unused account launcher hook') },
    useSessionAccess: () => { throw new Error('unused account launcher hook') },
    useResource: () => { throw new Error('unused account launcher hook') },
    useWorkspaceAccess: () => { throw new Error('unused account launcher hook') },
    useWorkspaces: () => { throw new Error('unused account launcher hook') },
    useContextMenu: () => { throw new Error('unused account launcher hook') },
    wide: true,
    settingsOpen: false,
    openSettings: vi.fn(),
    openOnboarding: vi.fn(),
    loadProfile: vi.fn(async () => undefined),
    switchAccount: vi.fn(),
    t: translate,
    ...overrides,
  }
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('YuanShuAccountLauncher', () => {
  it('renders the cached identity first, then the gateway profile', async () => {
    window.localStorage.setItem('yuanshu-user', JSON.stringify({ username: 'admin', nickname: '管理员' }))
    const loadProfile = vi.fn(async () => ({ username: 'admin', nickname: '超级管理员' }))
    render(<YuanShuAccountLauncher {...props({ loadProfile })} />)

    const trigger = screen.getByRole('button', { name: '元枢账号' })
    expect(trigger.textContent).toContain('管理员')
    await waitFor(() => { expect(trigger.textContent).toContain('超级管理员') })
    expect(loadProfile).toHaveBeenCalledTimes(1)
  })

  it('falls back to the plain YuanShu label when the profile is unavailable', async () => {
    const loadProfile = vi.fn(async () => { throw new Error('offline') })
    render(<YuanShuAccountLauncher {...props({ loadProfile })} />)
    const trigger = screen.getByRole('button', { name: '元枢账号' })
    expect(trigger.textContent).toContain('元枢账号')
    await waitFor(() => { expect(loadProfile).toHaveBeenCalled() })
    expect(trigger.textContent).toContain('元枢账号')
  })

  it('opens settings and switches the YuanShu account from the menu', async () => {
    const openSettings = vi.fn()
    const switchAccount = vi.fn()
    render(<YuanShuAccountLauncher {...props({
      loadProfile: vi.fn(async () => ({ username: 'admin' })),
      openSettings,
      switchAccount,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: '元枢账号' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '设置' }))
    expect(openSettings).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '元枢账号' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: '切换元枢账号' }))
    expect(switchAccount).toHaveBeenCalledTimes(1)
  })

  it('renders only the avatar when the sidebar is collapsed', async () => {
    render(<YuanShuAccountLauncher {...props({
      wide: false,
      loadProfile: vi.fn(async () => ({ username: 'admin', nickname: '管理员' })),
    })} />)
    const trigger = screen.getByRole('button', { name: '元枢账号' })
    expect(trigger.textContent).toBe('元')
  })
})
