// @vitest-environment jsdom
/** 头像、侧栏用户卡片与个人资料页的渲染冒烟测试。 */
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Avatar, ProfileScreen, UserBadge, buildIdentityViewModel } from '../src/client/identity/index.ts'
import type { RawIdentity } from '../src/client/identity/model.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

/** 完整演示快照：只有用户名来自接口，其余字段走演示数据。 */
const snapshot: RawIdentity = {
  user: {
    id: 52,
    username: 'zhouwei',
    nickname: '周伟',
    roles: [{ id: 1, name: '少仕项目管理', code: 'shaoshi_pm' }],
    avatarUrl: undefined,
  },
  profile: { department: '项目管理部', employee_no: 'SH-0052' },
  laborHours: [{ person: '周伟', project: 'EP220501', hours: 32, status: '正常' }],
  fallback: { user: false, profile: false, laborHours: false },
  fetchedAt: Date.UTC(2026, 10, 23),
}

it('生成蓝绿渐变首字头像，并在有接口地址时优先显示图片', () => {
  const vm = buildIdentityViewModel(snapshot)
  const { rerender } = render(<Avatar model={vm.user} size={48} />)
  const generated = screen.getByRole('img', { name: '周伟' })
  expect(generated.textContent).toBe('周')
  expect(generated.getAttribute('style')).toContain('linear-gradient')

  rerender(<Avatar model={{ ...vm.user, avatarUrl: '/avatar/52.png' }} size={48} />)
  const image = screen.getByRole('img', { name: '周伟' }) as HTMLImageElement
  expect(image.tagName).toBe('IMG')
  expect(image.getAttribute('src')).toBe('/avatar/52.png')
})

it('左下角用户卡片只显示头像与姓名，不显示 ID 与角色', () => {
  const vm = buildIdentityViewModel(snapshot)
  render(<UserBadge user={vm.user} t={t} />)
  expect(screen.getByText('周伟')).toBeDefined()
  // 不再显示 ID 与角色行。
  expect(screen.queryByText(/少仕项目管理 · ID 52/u)).toBeNull()
  expect(screen.queryByText(/ID 52/u)).toBeNull()
})

it('渲染个人资料页，并把数据更新时间放在页面底部', () => {
  const vm = buildIdentityViewModel(snapshot)
  const { container } = render(<ProfileScreen model={vm} t={t} />)
  expect(screen.getByText('项目管理部')).toBeDefined()
  expect(screen.getByText('SH-0052')).toBeDefined()
  expect(screen.getAllByText('接口数据').length).toBeGreaterThan(0)
  const freshness = screen.getByText(/数据更新时间:/u)
  expect(freshness.tagName).toBe('FOOTER')
  expect(container.querySelector('footer')).not.toBeNull()
})
