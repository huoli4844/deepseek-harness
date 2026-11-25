// @vitest-environment jsdom
/** 组织架构页面：未分配成员入口、成员编辑与删除弹窗的渲染测试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { zh } from '../src/client/core/locales/locales.ts'
import { OrganizationScreen } from '../src/client/modules/business-modules/OrganizationScreen.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

/** 取弹窗底部操作区。 */
function dialogFooter(dialog: HTMLElement): HTMLElement {
  const footer = dialog.querySelector('[class*="businessModuleActions"]')
  if (footer === null) throw new Error('弹窗缺少底部操作区')
  return footer as HTMLElement
}

/** 取第一个匹配的角色按钮，索引越界时直接失败。 */
function firstButton(name: string): HTMLElement {
  const button = screen.getAllByRole('button', { name }).at(0)
  if (button === undefined) throw new Error(`未找到按钮：${name}`)
  return button
}

function stubOrganizationFetch(writeStatus = 200): void {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.includes('/organization/departments/tree')) {
      return Response.json({ data: {
        departments: [
          { id: 1, name: '总部', parent_id: 0, total_members: 1, children: [] },
        ],
        unassigned_count: 1,
      } })
    }
    if (url.includes('/organization/roles')) {
      return Response.json({ data: [
        { id: 51, name: '管理员', code: 'admin', status: 1 },
        { id: 52, name: '停用角色', code: 'disabled', status: 0 },
      ] })
    }
    if (url.includes('/organization/users/')) {
      if (writeStatus !== 200) {
        return new Response(JSON.stringify({ code: writeStatus, message: '失败', data: null }), { status: writeStatus })
      }
      return Response.json({ data: null })
    }
    if (url.includes('/organization/users')) {
      return Response.json({ data: {
        list: [
          { id: 11, username: 'zhang.yi', nickname: '张一', email: '', phone: '', department_id: 1, status: 1, effective_roles: [{ role_id: 51, role_name: '管理员' }] },
          { id: 15, username: 'wang.wu', nickname: '王五', email: '', phone: '', status: 1, effective_roles: [] },
        ],
        page: 1, page_size: 20, total: 2,
      } })
    }
    throw new Error(`未预期的请求：${url}`)
  }))
}

it('展示未分配部门入口并支持编辑与删除成员', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  stubOrganizationFetch()
  render(<OrganizationScreen t={t} />)
  const fetchMock = vi.mocked(fetch)

  // 未分配部门入口展示树接口统计的人数
  const unassigned = await screen.findByRole('button', { name: '未分配部门1' })
  expect(screen.getByRole('button', { name: '全部成员' })).toBeDefined()

  // 默认展示全部成员与行级操作
  expect(await screen.findByText('张一')).toBeDefined()
  expect(screen.getByText('王五')).toBeDefined()
  expect(screen.getAllByRole('button', { name: '编辑成员' })).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: '删除成员' })).toHaveLength(2)

  // 点击未分配部门后按 department_id=0 查询
  fireEvent.click(unassigned)
  await waitFor(() => {
    const last = fetchMock.mock.calls.at(-1)
    expect(last?.[1]?.method ?? 'GET').toBe('GET')
    const url = last?.[0]
    expect(typeof url === 'string' && url.includes('department_id=0')).toBe(true)
  })

  // 打开编辑弹窗：角色列表已加载、完整字段可见
  fireEvent.click(firstButton('编辑成员'))
  const editDialog = screen.getByRole('dialog', { name: '编辑成员' })
  expect(editDialog.textContent).toContain('账号')
  await waitFor(() => { expect(within(editDialog).getByText('管理员')).toBeDefined() })
  expect(editDialog.textContent).toContain('部门由元枢组织管理')
  const [, email, phone] = within(editDialog).getAllByRole('textbox')

  // 元枢要求邮箱必填：未填写邮箱时保存不可用
  const saveButton = within(dialogFooter(editDialog)).getByRole('button', { name: '保存' }) as HTMLButtonElement
  expect(saveButton.disabled).toBe(true)
  fireEvent.change(email!, { target: { value: 'zhang.yi@example.com' } })
  fireEvent.change(phone!, { target: { value: '13800000000' } })
  expect(saveButton.disabled).toBe(false)

  // 停用成员并去掉原有角色后保存
  fireEvent.click(within(editDialog).getByRole('button', { name: '停用' }))
  fireEvent.click(within(editDialog).getByText('管理员'))
  fireEvent.click(saveButton)
  expect(await screen.findByText('成员信息已保存')).toBeDefined()
  await waitFor(() => {
    const saved = fetchMock.mock.calls.some(([url, init]) => {
      if (typeof url !== 'string' || !url.includes('/organization/users/11')) return false
      return init?.method === 'PUT' || init?.method === 'POST'
    })
    const payload = String((fetchMock.mock.calls.find(([url, init]) =>
      typeof url === 'string' && url.endsWith('/organization/users/11') && init?.method === 'PUT')?.[1] as
      RequestInit | undefined)?.body ?? '')
    expect(saved).toBe(true)
    expect(payload).toContain('"email":"zhang.yi@example.com"')
    expect(payload).toContain('"phone":"13800000000"')
    expect(fetchMock.mock.calls.some(([url, init]) =>
      typeof url === 'string' && url.endsWith('/organization/users/11/status') && init?.method === 'PUT')).toBe(true)
    expect(fetchMock.mock.calls.some(([url, init]) =>
      typeof url === 'string' && url.endsWith('/organization/users/11/roles') && init?.method === 'POST')).toBe(true)
  })

  // 打开删除弹窗并确认
  fireEvent.click(firstButton('删除成员'))
  const deleteDialog = screen.getByRole('dialog', { name: '删除成员' })
  expect(deleteDialog.textContent).toContain('删除后无法恢复')
  fireEvent.click(within(dialogFooter(deleteDialog)).getByRole('button', { name: '删除成员' }))
  expect(await screen.findByText('成员已删除')).toBeDefined()
  // 删除成功后触发列表与树刷新，此处只需确认 DELETE 请求已发出
  await waitFor(() => {
    const deleted = fetchMock.mock.calls.some(([url, init]) =>
      typeof url === 'string' && url.includes('/organization/users/') && init?.method === 'DELETE')
    expect(deleted).toBe(true)
  })
})

it('写操作失败时在弹窗内展示错误文案', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  stubOrganizationFetch(403)
  render(<OrganizationScreen t={t} />)
  expect(await screen.findByText('张一')).toBeDefined()

  fireEvent.click(firstButton('删除成员'))
  const dialog = screen.getByRole('dialog', { name: '删除成员' })
  fireEvent.click(within(dialogFooter(dialog)).getByRole('button', { name: '删除成员' }))
  expect(await screen.findByText('当前账号无权修改成员信息')).toBeDefined()
})
