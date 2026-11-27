// @vitest-environment jsdom
/** 验证对话登记从宿主预填到客户新增回执，后台请求使用替身。 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/core/locales/locales.ts'
import { ConversationEquipment } from '../src/client/modules/business-forms/ConversationEquipment.tsx'
import { EquipmentIntake } from '../src/client/modules/business-modules/EquipmentIntake.tsx'
import { findRecordDuplicate } from '../src/client/modules/business-modules/equipment-api.ts'
import { invalidCustomerFields } from '../src/business-forms/customer-create-contract.ts'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) =>
  Object.entries(values ?? {}).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), zh[key])

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('客户登记只接受已定义的状态和可准确发送的额度', () => {
  expect(invalidCustomerFields({ code: 'C-01', name: '示例', status: '1', credit_limit: '100.50' })).toEqual([])
  expect(invalidCustomerFields({ code: 'C-01', status: '2', credit_limit: '001' })).toEqual(['name', 'credit_limit', 'status'])
})

it('聊天预填客户，仅人工确认后查重和新增，后台拒绝时保留输入', async () => {
  localStorage.setItem('workbench-client-token', 'employee')
  localStorage.setItem('yuanshu-active-tenant', '9')
  const writes: unknown[] = []
  const checks: string[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源代理')
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer employee')
    expect(headers.get('x-active-tenant')).toBe('9')
    const url = new URL(input, 'https://workbench.test')
    if (url.pathname.endsWith('/equipment-form')) {
      expect(url.searchParams.get('session_id')).toBe('customer-chat')
      return Response.json({ data: { id: 'draft', kind: 'customer',
        content: { code: 'CUS-001', name: '示例客户', level: '重要客户', status: '1（有效）', created_by: '50' } } })
    }
    if (url.pathname.endsWith('/equipment-dismiss')) return Response.json({ data: {} })
    if (url.pathname !== '/yuanshu-workbench/customers') throw new Error('应使用客户资源接口')
    if (init?.method === 'POST' && typeof init.body === 'string') {
      writes.push(JSON.parse(init.body))
      if (writes.length === 1) return Response.json({ code: 409, message: '客户编码已被占用' }, { status: 409 })
      return Response.json({ code: 200 })
    }
    checks.push(url.search)
    const list = writes.length === 2 ? [{ id: 3, code: 'CUS-002', name: '示例客户' }] : []
    return Response.json({ code: 200, data: { list, pagination: { total: list.length, page: 1 } } })
  }))
  render(<ConversationEquipment session="customer-chat" t={t} />)

  const dialog = within(await screen.findByRole('dialog', { name: '新增客户' }, { timeout: 3000 }))
  expect(dialog.getByLabelText('客户名称')).toHaveProperty('value', '示例客户')
  expect(dialog.getByRole('option', { name: '重要' })).toHaveProperty('selected', true)
  expect(dialog.getByRole('option', { name: zh['customer.active'] })).toHaveProperty('selected', true)
  expect(writes).toHaveLength(0)
  fireEvent.click(dialog.getByRole('button', { name: '保存' }))
  await dialog.findByText(/409.*客户编码已被占用/u)
  expect(dialog.getByLabelText('客户编码')).toHaveProperty('value', 'CUS-001')
  fireEvent.change(dialog.getByLabelText('客户编码'), { target: { value: 'CUS-002' } })
  fireEvent.change(dialog.getByRole('combobox', { name: '客户等级' }), { target: { value: 'key' } })
  fireEvent.click(dialog.getByRole('button', { name: '保存' }))
  await dialog.findByText('已成功保存 1 条客户档案。')
  expect(checks).toHaveLength(3)
  expect(writes).toEqual([
    { code: 'CUS-001', name: '示例客户', level: 'important', status: 1 },
    { code: 'CUS-002', name: '示例客户', level: 'key', status: 1 },
  ])
  fireEvent.click(dialog.getByRole('button', { name: '确认' }))
  expect(screen.queryByRole('dialog', { name: '新增客户' })).toBeNull()
})

it('客户查重失败时提示未提交，并保留可编辑表单', async () => {
  localStorage.setItem('workbench-client-token', 'employee')
  const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 200, data: {} }))
  vi.stubGlobal('fetch', request)
  render(<EquipmentIntake kind="customer" initial={{ code: 'CUS-001', name: '示例客户' }} t={t} onClose={() => {}} />)

  const dialog = within(screen.getByRole('dialog', { name: '新增客户' }))
  fireEvent.click(dialog.getByRole('button', { name: '保存' }))
  await dialog.findByText(/客户查重未完成，尚未发送保存请求/u)
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]?.[1]?.method).toBeUndefined()
  expect(dialog.getByLabelText('客户编码')).toHaveProperty('value', 'CUS-001')
  expect(dialog.getByRole('button', { name: '保存' })).toHaveProperty('disabled', false)
})

it('客户列表无总数时继续翻页查重', async () => {
  localStorage.setItem('workbench-client-token', 'employee')
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: [{ id: 1, code: 'OTHER', name: '其他客户' }] }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: 2, code: 'CUS-001', name: '示例客户' }] }))
  vi.stubGlobal('fetch', request)
  await expect(findRecordDuplicate('customer', [{ code: 'cus-001' }], new AbortController().signal))
    .resolves.toEqual({ index: 0, key: 'code' })
  expect(request.mock.calls[1]?.[0]).toBe('/yuanshu-workbench/customers?page=2&page_size=200')
})
