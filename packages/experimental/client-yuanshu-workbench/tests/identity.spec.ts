/** 身份模块数据层与视图模型层的单元测试。 */
import { describe, expect, it } from 'vitest'
import { EMPTY_IDENTITY } from '../src/client/identity/model.ts'
import type { RawIdentity } from '../src/client/identity/model.ts'
import { parseLaborHours, parseMe, parseProfile } from '../src/client/identity/source.ts'
import { buildIdentityViewModel, gradientOf, initialsOf } from '../src/client/identity/viewmodel.ts'

/** 构造接口成功返回的快照。 */
function liveIdentity(): RawIdentity {
  return {
    user: {
      id: 52,
      username: 'zhouwei',
      nickname: '周伟',
      roles: [{ id: 1, name: '少仕项目管理', code: 'shaoshi_pm' }],
      avatarUrl: '/avatar/52.png',
    },
    profile: { department: '项目管理部', position: '项目经理' },
    position: '项目经理',
    laborHours: [{ person: '周伟', project: 'EP220501', hours: 32, status: '正常' }],
    fallback: { user: false, profile: false, position: false, laborHours: false },
    fetchedAt: Date.UTC(2026, 10, 23),
  }
}

describe('identity source — response parsing', () => {
  it('parses the signed-in user, roles and optional avatar', () => {
    const user = parseMe({
      code: 0,
      data: {
        id: 52,
        username: 'zhouwei',
        nickname: '周伟',
        roles: [{ id: 1, name: '少仕项目管理', code: 'shaoshi_pm' }, { name: 'broken' }],
        avatar: '/avatar/52.png',
      },
    })
    expect(user?.id).toBe(52)
    expect(user?.nickname).toBe('周伟')
    expect(user?.roles).toHaveLength(1)
    expect(user?.avatarUrl).toBe('/avatar/52.png')
  })

  it('ignores invalid user payloads and invalid avatar strings', () => {
    expect(parseMe(null)).toBeUndefined()
    expect(parseMe({ data: { id: '52' } })).toBeUndefined()
    expect(parseMe({ data: { id: 1, avatar: 'javascript:alert(1)' } })?.avatarUrl).toBeUndefined()
  })

  it('parses profile and labor-hour arrays in several shapes', () => {
    expect(parseProfile({ data: { department: '质量部' } })?.department).toBe('质量部')
    expect(parseLaborHours({ data: [{ person: '张和林', project: 'P1', hours: 8, status: '正常' }] })).toHaveLength(1)
    expect(parseLaborHours({ data: { rows: [{ employee_name: '高静', project_name: 'P2', work_hours: '6.5' }] } })?.[0]?.hours).toBe(6.5)
    expect(parseLaborHours({ data: [{ person: '无项目' }] })).toBeUndefined()
  })
})

describe('identity view model', () => {
  it('builds avatar text and a stable blue-green gradient', () => {
    expect(initialsOf('周伟')).toBe('周')
    expect(initialsOf(' alice ')).toBe('A')
    expect(gradientOf('周伟')).toEqual(gradientOf('周伟'))
    for (const color of gradientOf('周伟')) expect(color).toMatch(/^#[0-9a-f]{6}$/u)
  })

  it('marks live fields as live and missing profile fields as missing', () => {
    const vm = buildIdentityViewModel(liveIdentity())
    expect(vm.user.roleText).toBe('少仕项目管理')
    expect(vm.user.tier).toBe('live')
    expect(vm.user.avatarUrl).toBe('/avatar/52.png')
    const department = vm.profile.find(entry => entry.id === 'department')
    expect(department?.field.value).toBe('项目管理部')
    expect(department?.field.tier).toBe('live')
    const email = vm.profile.find(entry => entry.id === 'email')
    expect(email?.field.value).toBeUndefined()
    expect(email?.field.tier).toBe('missing')
    expect(vm.laborHours.total.value).toBe('32')
  })

  it('marks demo fallback values so the UI cannot present them as live data', () => {
    const demo: RawIdentity = {
      ...liveIdentity(),
      user: undefined,
      profile: undefined,
      laborHours: undefined,
      fallback: { user: true, profile: true, position: true, laborHours: true },
      fetchedAt: undefined,
    }
    const vm = buildIdentityViewModel(demo)
    expect(vm.user.tier).toBe('demo')
    expect(vm.profile[0]?.field.tier).toBe('demo')
    expect(vm.laborHours.rows).toHaveLength(0)
    expect(vm.laborHours.total.tier).toBe('demo')
    expect(vm.fetchedAt).toBeUndefined()
  })

  it('does not fabricate values for the empty snapshot', () => {
    const vm = buildIdentityViewModel(EMPTY_IDENTITY)
    expect(vm.user.displayName).toBe('')
    expect(vm.profile.every(entry => entry.field.value === undefined)).toBe(true)
  })
})
