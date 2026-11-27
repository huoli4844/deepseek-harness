// @vitest-environment jsdom
/** 验证从当前用户任职到岗位描述的读取顺序及归属，使用模拟接口。 */
import { afterEach, expect, it, vi } from 'vitest'
import { createLiveIdentitySource } from '../src/client/identity/source.ts'
import { buildIdentityViewModel } from '../src/client/identity/viewmodel.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('用本人当前主岗的 ID 匹配描述，忽略历史、兼岗和他人记录', async () => {
  const request = vi.fn<typeof fetch>(async (path) => {
    switch (path) {
      case '/yuanshu-workbench/identity/me':
        return Response.json({ data: { id: 52 } })
      case '/yuanshu-workbench/user-positions?user_id=52':
        return Response.json({ data: [
          { id: 1, user_id: 52, position_id: 89, is_primary: true, effective_to: '2020-01-01' },
          { id: 2, user_id: 52, position_id: 27, is_primary: false },
          { id: 3, user_id: 52, position_id: 28, is_primary: true },
          { id: 4, user_id: 53, position_id: 29, is_primary: true, effective_from: '2020-01-01' },
        ] })
      case '/yuanshu-workbench/identity/positions':
        return Response.json({ data: { list: [
          { id: 27, name: '项目经理', description: '兼岗职责' },
          { id: 28, name: '项目经理', description: '负责项目交付和风险跟踪' },
        ] } })
      default:
        return new Response(null, { status: 404 })
    }
  })
  vi.stubGlobal('fetch', request)
  const snapshot = await createLiveIdentitySource().load(new AbortController().signal)
  const paths = request.mock.calls.map(([path]) => path)
  expect(paths.slice(-2)).toEqual(['/yuanshu-workbench/user-positions?user_id=52', '/yuanshu-workbench/identity/positions'])
  expect(buildIdentityViewModel(snapshot).duty).toMatchObject({ value: '负责项目交付和风险跟踪', tier: 'live' })
})

it('无法确认当前用户时不读取任职目录或显示演示职责', async () => {
  const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', request)
  const snapshot = await createLiveIdentitySource().load(new AbortController().signal)
  expect(request.mock.calls.map(([path]) => path)).not.toContain('/yuanshu-workbench/identity/positions')
  expect(request.mock.calls.some(([path]) => typeof path === 'string' && path.includes('user-positions'))).toBe(false)
  expect(buildIdentityViewModel(snapshot).duty.value).toBeUndefined()
})
