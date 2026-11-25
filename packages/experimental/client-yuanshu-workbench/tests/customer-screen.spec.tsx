// @vitest-environment jsdom
/** 客户表格分页和新增、编辑、删除弹窗的渲染测试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { zh } from '../src/client/core/locales/locales.ts'
import { CustomerResourcesScreen } from '../src/client/modules/business-modules/CustomerResourcesScreen.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const t = ((key: string, values?: Readonly<Record<string, string | number>>) => {
  const source = zh[key as keyof typeof zh] ?? key
  return Object.entries(values ?? {}).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), source)
}) as never

it('显示总数和分页，并在新增、编辑、删除时打开弹窗', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const customers = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    code: `C-${index + 1}`,
    name: `客户 ${index + 1}`,
    short_name: '',
    contact_person: '',
    contact_phone: '',
    status: 1,
    created_at: '2026-11-24T10:20:30Z',
    created_by: 7,
  }))
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (typeof input !== 'string') throw new Error('预期列表请求使用同源路径')
    const { searchParams } = new URL(input, 'http://localhost')
    const page = Number(searchParams.get('page'))
    return Response.json({ data: { items: customers.slice((page - 1) * 20, page * 20), total: customers.length } })
  }))

  render(<CustomerResourcesScreen t={t} />)
  await waitFor(() => {
    expect(screen.getAllByRole('row')).toHaveLength(21)
  })
  expect(screen.getByText('21')).toBeDefined()
  expect(screen.getByText('创建时间')).toBeDefined()
  expect(screen.getByText('创建人 ID')).toBeDefined()
  expect(screen.getAllByRole('cell', { name: '2026-11-24 18:20:30' })).toHaveLength(20)
  expect(screen.getAllByText('7').length).toBeGreaterThan(0)
  expect(screen.getByText('第 1 页，共 2 页')).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  expect(await screen.findByText('客户 21')).toBeDefined()
  expect(screen.queryByText('客户 20')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '编辑客户' }))
  expect(screen.getByRole('dialog', { name: '编辑客户' })).toBeDefined()
  fireEvent.click(within(screen.getByRole('dialog', { name: '编辑客户' })).getAllByRole('button', { name: '取消' })[0])

  fireEvent.click(screen.getByRole('button', { name: '新增客户' }))
  expect(screen.getByRole('dialog', { name: '新增客户' })).toBeDefined()
  fireEvent.click(within(screen.getByRole('dialog', { name: '新增客户' })).getAllByRole('button', { name: '取消' })[0])

  fireEvent.click(screen.getByRole('button', { name: '删除客户' }))
  expect(screen.getByRole('dialog', { name: '删除客户' })).toBeDefined()
})

it('只有一页记录时仍显示分页状态并禁用翻页', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    data: { list: [{ id: 1, code: 'C-001', name: '唯一客户', status: 1 }], total: 1 },
  }), { status: 200 })))
  render(<CustomerResourcesScreen t={t} />)
  expect(await screen.findByText('唯一客户')).toBeDefined()
  expect(screen.getByText('第 1 页，共 1 页')).toBeDefined()
  expect(screen.getByRole('button', { name: '上一页' }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: '下一页' }).hasAttribute('disabled')).toBe(true)
})
