// @vitest-environment jsdom
/** 验证供应商列表与弹窗通过同源接口读写。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { zh } from '../src/client/core/locales/locales.ts'
import { SupplierManagementScreen } from '../src/client/modules/business-modules/SupplierManagementScreen.tsx'

const t = (key: keyof typeof zh, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('分页显示真实总数并在弹窗中提交新增、编辑和删除', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  localStorage.setItem('yuanshu-active-tenant', 'shaoshi')
  const suppliers = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1, code: `S-${index + 1}`, name: `供应商 ${index + 1}`, supplier_type: 'material', status: 1,
  }))
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    if (init?.method !== undefined) return new Response(null, { status: 204 })
    if (typeof input !== 'string') throw new Error('预期列表请求使用同源路径')
    if (input.endsWith('/supplier-categories')) return Response.json({ data: { items: [{ category: '原料' }] } })
    const page = Number(new URL(input, 'http://localhost').searchParams.get('page'))
    return Response.json({ data: { items: suppliers.slice((page - 1) * 20, page * 20), total: suppliers.length } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<SupplierManagementScreen t={t} />)

  expect(await screen.findByText('第 1 页，共 2 页')).toBeDefined()
  expect(screen.getByText('21', { selector: 'strong' })).toBeDefined()
  const scores = within(await screen.findByRole('region', { name: '供应商评分统计' }))
  expect(scores.getAllByText('未评分(0)')).toHaveLength(5)
  expect(scores.getAllByText('已评分 0 / 20')).toHaveLength(5)
  expect(scores.getByText('共 21 家，当前显示 20 家。')).toBeDefined()
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/yuanshu-workbench/suppliers?page=1&page_size=20')
  const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
  expect(headers.get('X-Active-Tenant')).toBe('shaoshi')

  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  expect(await screen.findByText('供应商 21')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '编辑供应商' }))
  const edit = within(screen.getByRole('dialog', { name: '编辑供应商' }))
  fireEvent.change(edit.getByLabelText('供应商名称'), { target: { value: '更新供应商' } })
  fireEvent.click(edit.getByRole('button', { name: '保存供应商' }))
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith('/yuanshu-workbench/suppliers/21', expect.objectContaining({
      method: 'PUT',
    }))
    const updated = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(updated?.[1]?.body).toContain('"supplier_type":"material"')
    expect(updated?.[1]?.body).toContain('"name":"更新供应商"')
  })

  fireEvent.click(await screen.findByRole('button', { name: '新增供应商' }))
  const add = within(screen.getByRole('dialog', { name: '新增供应商' }))
  fireEvent.change(add.getByLabelText('供应商编码'), { target: { value: 'S-NEW' } })
  fireEvent.change(add.getByLabelText('供应商名称'), { target: { value: '新增测试档案' } })
  fireEvent.click(add.getByRole('button', { name: '保存供应商' }))
  await screen.findByText('供应商已保存。')
  expect(fetchMock).toHaveBeenCalledWith('/yuanshu-workbench/suppliers', expect.objectContaining({ method: 'POST' }))

  await screen.findByText('第 1 页，共 2 页')
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  fireEvent.click(await screen.findByRole('button', { name: '删除供应商' }))
  const remove = within(screen.getByRole('dialog', { name: '删除供应商' }))
  fireEvent.click(remove.getByRole('button', { name: '删除供应商' }))
  await screen.findByText('供应商已删除。')
  expect(fetchMock).toHaveBeenCalledWith('/yuanshu-workbench/suppliers/21', expect.objectContaining({ method: 'DELETE' }))
})

it('指定页跳转后切换十页一组，搜索回到首页且卡片保留档案总数', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (typeof input !== 'string') throw new Error('预期列表请求使用同源路径')
    if (input.endsWith('/supplier-categories')) return Response.json({ data: { items: [{ category: '原料' }] } })
    const params = new URL(input, 'http://localhost').searchParams
    const name = params.get('name')
    return Response.json({ data: { items: [{ id: 1, name: name ?? '供应商甲' }],
      total: name ? 1 : 381, archive_total: 381 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<SupplierManagementScreen t={t} />)

  await screen.findByText('第 1 页，共 20 页')
  expect(screen.queryByRole('heading', { name: '供应商管理' })).toBeNull()
  expect(screen.queryByText('接口调用诊断')).toBeNull()
  expect(screen.getAllByRole('button', { name: /^转到第 /u })).toHaveLength(10)
  fireEvent.change(screen.getByRole('spinbutton', { name: '指定页' }), { target: { value: '11' } })
  fireEvent.click(screen.getByRole('button', { name: '跳转' }))
  await screen.findByText('第 11 页，共 20 页')
  expect(fetchMock).toHaveBeenCalledWith('/yuanshu-workbench/suppliers?page=11&page_size=20', expect.anything())
  expect(screen.queryByRole('button', { name: '转到第 10 页' })).toBeNull()
  expect(screen.getByRole('button', { name: '转到第 20 页' })).toBeDefined()
  expect(screen.getAllByRole('button', { name: /^转到第 /u })).toHaveLength(10)

  const form = within(screen.getByRole('form', { name: '搜索供应商' }))
  await form.findByRole('option', { name: '原料' })
  fireEvent.change(form.getByLabelText('供应商编码'), { target: { value: 'S-01' } })
  fireEvent.change(form.getByLabelText('供应商名称'), { target: { value: '乙 & 丙' } })
  fireEvent.change(form.getByLabelText('供应商分类'), { target: { value: '原料' } })
  fireEvent.change(form.getByLabelText('联系人'), { target: { value: 'Lee' } })
  expect(screen.getByText('第 11 页，共 20 页')).toBeDefined()
  fireEvent.click(form.getByRole('button', { name: '搜索' }))
  await screen.findByText('第 1 页，共 1 页')
  const filterRequest = '/yuanshu-workbench/suppliers?page=1&page_size=20&code=S-01&name=%E4%B9%99+%26+%E4%B8%99&contact_person=Lee&category=%E5%8E%9F%E6%96%99'
  expect(fetchMock).toHaveBeenLastCalledWith(filterRequest, expect.anything())
  expect(screen.getByRole('cell', { name: '乙 & 丙' })).toBeDefined()
  expect(screen.getByText('381', { selector: 'strong' })).toBeDefined()
  const sortByName = screen.getByRole('button', { name: '供应商名称' })
  fireEvent.click(sortByName)
  await screen.findByText('第 1 页，共 1 页')
  expect(fetchMock).toHaveBeenLastCalledWith(`${filterRequest}&sort_by=name&sort_direction=asc`, expect.anything())
  fireEvent.click(sortByName)
  await screen.findByText('第 1 页，共 1 页')
  expect(fetchMock).toHaveBeenLastCalledWith(`${filterRequest}&sort_by=name&sort_direction=desc`, expect.anything())
})
