// @vitest-environment jsdom
/** 验证命名发布、顶部切换和重新打开时的动态查询。 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConversationPersonalPages, PersonalPages } from '../src/client/modules/personal-pages/index.ts'
import { zh } from '../src/client/core/locales/locales.ts'

const t = (key: string, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (label, [name, value]) => label.replaceAll(`{${name}}`, String(value)), zh[key as keyof typeof zh] ?? key,
)

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('确认修改后的名称才发布，按名称切换，重新打开读取最新工时且隔离员工', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  localStorage.setItem('yuanshu-active-tenant', 'test-tenant')
  const project = { id: 1, code: 'PRJ-01', name: '测试项目' }
  let hours = '2.00'
  let user = 12
  let pending: { id: string; name: string } | undefined
  const fetchMock = vi.fn(async (path: string) => {
    if (path.endsWith('/context')) return Response.json({ data: { tenant: 3, user } })
    const url = new URL(path, 'https://workbench.test')
    if (url.pathname.endsWith('/personal-page-draft')) {
      return Response.json({ data: pending && { ...pending, account: `3:${user}` } })
    }
    if (url.pathname.endsWith('/personal-page-dismiss')) {
      pending = undefined
      return Response.json({ data: null })
    }
    if (url.pathname.endsWith('/projects')) {
      return Response.json({ data: { items: [project], page: 1, page_size: 20, total: 1 } })
    }
    if (url.pathname.endsWith('/PRJ-01/labor-hours')) {
      expect(url.searchParams.get('user_id')).toBe(String(user))
      expect(url.searchParams.get('date_from')).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
      return Response.json({ data: { items: [{ id: 1, user_id: user, project_id: 1, hours,
        description: '测试工时', work_date: '2026-11-25' }], total: 1, page: 1, page_size: 20 } })
    }
    throw new Error('Unexpected request: ' + path)
  })
  vi.stubGlobal('fetch', fetchMock)
  const first = render(<PersonalPages t={t} />)

  async function preview(name: string) {
    pending = { name, id: name }
    render(<ConversationPersonalPages session={name} t={t} />)
    const dialog = within(await screen.findByRole('dialog', { name: '创建页面' }))
    // 创建页面只需填写名称，不再选择项目与日期
    fireEvent.change(dialog.getByRole('textbox', { name: '页面名称' }), { target: { value: name } })
    expect(dialog.queryByRole('combobox', { name: '项目' })).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: '预览' }))
    await dialog.findByText(hours)
    return dialog
  }

  const draft = await preview('工时草稿')
  expect(screen.queryByRole('button', { name: '工时草稿' })).toBeNull()
  fireEvent.click(draft.getByRole('button', { name: '返回编辑' }))
  fireEvent.change(draft.getByRole('textbox', { name: '页面名称' }), { target: { value: '本周项目工时' } })
  fireEvent.click(draft.getByRole('button', { name: '预览' }))
  await draft.findByText('本周项目工时')
  await waitFor(() => { expect(draft.getByRole('button', { name: '确认名称并发布' }).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(draft.getByRole('button', { name: '确认名称并发布' }))
  await screen.findByRole('button', { name: '本周项目工时', pressed: true })
  const second = await preview('项目台账')
  fireEvent.click(second.getByRole('button', { name: '确认名称并发布' }))
  await screen.findByRole('button', { name: '项目台账' })
  fireEvent.click(screen.getByRole('button', { name: '项目台账' }))
  hours = '3.00'
  fireEvent.click(screen.getByRole('button', { name: '本周项目工时' }))
  await screen.findByText('3.00')

  fireEvent.click(screen.getByRole('button', { name: '个人页设置' }))
  let settings = within(screen.getByRole('dialog', { name: '个人页设置' }))
  expect(settings.queryByRole('button', { name: '创建页面' })).toBeNull()
  fireEvent.change(settings.getAllByRole('textbox', { name: '页面名称' })[1]!, { target: { value: '月度项目工时' } })
  fireEvent.click(settings.getAllByRole('button', { name: '上移' })[1]!)
  fireEvent.click(settings.getAllByRole('checkbox', { name: '显示页面' })[1]!)
  fireEvent.click(settings.getByRole('button', { name: '保存' }))
  expect(screen.queryByRole('button', { name: '本周项目工时' })).toBeNull()
  await screen.findByRole('button', { name: '月度项目工时', pressed: true })

  first.unmount()
  hours = '4.00'
  const reopened = render(<PersonalPages t={t} />)
  await screen.findByRole('button', { name: '月度项目工时', pressed: true })
  await screen.findByText('4.00')
  fireEvent.click(screen.getByRole('button', { name: '个人页设置' }))
  settings = within(screen.getByRole('dialog', { name: '个人页设置' }))
  fireEvent.click(settings.getAllByRole('checkbox', { name: '显示页面' })[1]!)
  fireEvent.click(settings.getByRole('button', { name: '保存' }))
  const tabs = within(screen.getByRole('navigation', { name: '个人页面' })).getAllByRole('button')
  expect(tabs.map(button => button.textContent)).toEqual(['月度项目工时', '本周项目工时'])

  reopened.unmount()
  user = 13
  localStorage.setItem('workbench-client-token', 'another-token')
  render(<PersonalPages t={t} />)
  await screen.findByRole('button', { name: '个人页设置' })
  expect(screen.queryByRole('button', { name: '本周项目工时' })).toBeNull()
})
