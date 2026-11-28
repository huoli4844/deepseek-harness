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

it('设置里可二次确认卸载单个或全部个人页', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  localStorage.setItem('yuanshu-active-tenant', 'test-tenant')
  const user = 12
  let stored: unknown[] = [
    { id: 'p1', name: '页面甲', widgets: [{ id: 'w1', type: 'labor-month', period: 'month' }] },
    { id: 'p2', name: '页面乙', widgets: [{ id: 'w2', type: 'headcount' }] },
  ]
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/context')) return Response.json({ data: { tenant: 3, user } })
    if (init?.method === 'PUT') {
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '""') as { pages?: unknown[] }
      stored = JSON.parse(JSON.stringify(body.pages ?? [])) as unknown[]
      return Response.json({ data: stored })
    }
    return Response.json({ data: JSON.parse(JSON.stringify(stored)) })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<PersonalPages t={t} />)
  await screen.findByRole('button', { name: '页面甲' })
  fireEvent.click(screen.getByRole('button', { name: '个人页设置' }))
  const dialog = within(screen.getByRole('dialog', { name: '个人页设置' }))
  // 单个卸载：先点卸载，再点确认卸载，页面立即从切换栏消失。
  fireEvent.click(dialog.getAllByRole('button', { name: '卸载' })[0]!)
  fireEvent.click(dialog.getByRole('button', { name: '确认卸载' }))
  await waitFor(() => { expect(screen.queryByRole('button', { name: '页面甲' })).toBeNull() })
  expect(screen.getByRole('button', { name: '页面乙' })).toBeDefined()
  // 卸载全部：确认后回到空态提示。
  fireEvent.click(dialog.getByRole('button', { name: '卸载全部' }))
  fireEvent.click(dialog.getByRole('button', { name: '确认卸载全部' }))
  await screen.findByText('在工作台对话中提出创建个人页面。')
  expect(screen.queryByRole('button', { name: '页面乙' })).toBeNull()
})

it('确认修改后的名称才发布，按名称切换，重新打开读取最新工时且隔离员工', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  localStorage.setItem('yuanshu-active-tenant', 'test-tenant')
  const project = { id: 1, code: 'PRJ-01', name: '测试项目' }
  let hours = '2.00'
  let user = 12
  let pending: { id: string; name: string } | undefined
  // 模拟宿主固定目录存储：按账号隔离，验证布局不再依赖浏览器数据。
  const storedPages = new Map<string, unknown[]>()
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/context')) return Response.json({ data: { tenant: 3, user } })
    const url = new URL(path, 'https://workbench.test')
    if (url.pathname.startsWith('/yuanshu-workbench/personal-pages/')) {
      const account = decodeURIComponent(url.pathname.slice('/yuanshu-workbench/personal-pages/'.length))
      if (init?.method === 'PUT') {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : '""') as { pages?: unknown[] }
        storedPages.set(account, body.pages ?? [])
        return Response.json({ data: body.pages ?? [] })
      }
      return Response.json({ data: storedPages.get(account) ?? null })
    }
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
    // 创建页面只填名称并组装卡片，不选择项目与日期
    fireEvent.change(dialog.getByRole('textbox', { name: '页面名称' }), { target: { value: name } })
    fireEvent.click(dialog.getByRole('button', { name: '我的项目工时' }))
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
  // 保存已改为写入宿主端点的异步流程，等待隐藏页面从导航中消失。
  await waitFor(() => { expect(screen.queryByRole('button', { name: '本周项目工时' })).toBeNull() })
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
  // 等重新显示的页面回到导航后再断言顺序。
  await screen.findByRole('button', { name: '本周项目工时' })
  const tabs = within(screen.getByRole('navigation', { name: '个人页面' })).getAllByRole('button')
  expect(tabs.map(button => button.textContent)).toEqual(['月度项目工时', '本周项目工时'])

  reopened.unmount()
  user = 13
  localStorage.setItem('workbench-client-token', 'another-token')
  render(<PersonalPages t={t} />)
  await screen.findByRole('button', { name: '个人页设置' })
  expect(screen.queryByRole('button', { name: '本周项目工时' })).toBeNull()
})

it('对话预填业务数据卡片时，预览实时查询目录接口并按名称发布', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  localStorage.setItem('yuanshu-active-tenant', 'test-tenant')
  const user = 12
  const storedPages = new Map<string, unknown[]>()
  // 模拟 AI 草稿：卡片缺 id、参数含数字值，且覆盖 table/stats/bar 三种视图。
  const draft = {
    id: 'draft-data', name: '项目看板', widgets: [
      { type: 'data-query', path: '/api/v1/apps/shaoshi/projects/{code}/tasks',
        params: { code: 'EP01', page: 1 }, title: '项目任务' },
      { type: 'data-query', path: '/api/v1/apps/shaoshi/projects/{code}/tasks',
        params: { code: 'EP01' }, title: '工时汇总', view: 'stats', columns: ['hours', 'count'] },
      { type: 'data-query', path: '/api/v1/apps/shaoshi/projects/{code}/tasks',
        params: { code: 'EP01' }, title: '平均工时', view: 'stats', aggregate: 'avg', columns: ['hours'] },
      { type: 'data-query', path: '/api/v1/apps/shaoshi/projects/{code}/tasks',
        params: { code: 'EP01' }, title: '任务工时对比', view: 'bar', columns: ['name', 'hours'] },
    ],
  }
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/context')) return Response.json({ data: { tenant: 3, user } })
    const url = new URL(path, 'https://workbench.test')
    if (url.pathname.startsWith('/yuanshu-workbench/personal-pages/')) {
      const account = decodeURIComponent(url.pathname.slice('/yuanshu-workbench/personal-pages/'.length))
      if (init?.method === 'PUT') {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : '""') as { pages?: unknown[] }
        storedPages.set(account, body.pages ?? [])
        return Response.json({ data: body.pages ?? [] })
      }
      return Response.json({ data: storedPages.get(account) ?? null })
    }
    if (url.pathname.endsWith('/personal-page-draft')) {
      return Response.json({ data: draft && { ...draft, account: `3:${user}` } })
    }
    if (url.pathname.endsWith('/personal-page-dismiss')) return Response.json({ data: null })
    if (url.pathname === '/yuanshu-workbench/data-query') {
      expect(url.searchParams.get('path')).toBe('/api/v1/apps/shaoshi/projects/{code}/tasks')
      // 目录随数据下发字段中文说明，验证表头与统计卡标签不再显示英文字段名。
      return Response.json({ labels: { name: '任务名称', hours: '工时', status: '状态' },
        data: { total: 2, items: [
          { id: 1, name: '任务A', status: '进行中', hours: 3.5, count: 5 },
          { id: 2, name: '任务B', hours: 2.5, count: 3 },
        ] } })
    }
    throw new Error('Unexpected request: ' + path)
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<ConversationPersonalPages session="data" t={t} />)
  const dialog = within(await screen.findByRole('dialog', { name: '创建页面' }))
  // 预填卡片直接进入构建预览：卡片实时查询完成后展示数据，无需手动点预览。
  await dialog.findAllByText('任务A')
  // stats 视图聚合：sum=6（3.5+2.5），avg=3；count 无目录标签走内置词典「数量」。
  await dialog.findByText('6')
  await dialog.findAllByText('3')
  await dialog.findByText('8')
  await dialog.findAllByText('工时')
  await dialog.findAllByText('数量')
  await waitFor(() => { expect(dialog.getAllByText('任务A').length).toBeGreaterThanOrEqual(2) })
  await waitFor(() => { expect(dialog.queryByText(/正在构建页面/)).toBeNull() })
  await waitFor(() => { expect(dialog.getByRole('button', { name: '确认名称并发布' }).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(dialog.getByRole('button', { name: '确认名称并发布' }))
  // 发布后从我的个人页打开，卡片按页面配置再次实时查询。
  const board = render(<PersonalPages t={t} />)
  await screen.findByRole('button', { name: '项目看板', pressed: true })
  // 任务B 同时出现在明细表格与条形图两处，验证多视图卡片在发布后仍按配置渲染。
  await screen.findAllByText('任务B')
  board.unmount()
})
