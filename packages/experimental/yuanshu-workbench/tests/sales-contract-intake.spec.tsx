// @vitest-environment jsdom
/** 验证销售合同通过对话复核登记，覆盖编号保护、云端拒绝和可核实回执。 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/core/locales/locales.ts'
import { ConversationEquipment } from '../src/client/modules/business-forms/ConversationEquipment.tsx'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) =>
  Object.entries(values ?? {}).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), zh[key])

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('保留指定合同编号，人工清空并保存后才发送项目销售合同草稿', async () => {
  localStorage.setItem('workbench-client-token', 'employee')
  localStorage.setItem('yuanshu-active-tenant', '9')
  const writes: unknown[] = []
  const receipt = { id: 4, code: 'C-SALES-4', contract_type: 'sales', status: 'draft', counterparty_id: 3 }
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应通过同源路由访问')
    const url = new URL(input, 'https://workbench.test')
    if (url.pathname.endsWith('/equipment-form')) {
      return Response.json({ data: { id: 'draft', kind: 'sales-contract', content: {
        project_code: 'P-1', requested_code: 'CUSTOM-1', counterparty_name: '示例客户', total_amount: '100.50',
      } } })
    }
    if (url.pathname.endsWith('/equipment-dismiss')) return Response.json({ data: {} })
    expect(new Headers(init?.headers).get('X-Active-Tenant')).toBe('9')
    if (url.pathname === '/yuanshu-workbench/customers') {
      return Response.json({ data: { items: [{ id: 3, code: 'CU-03', name: '示例客户' }], total: 1 } })
    }
    expect(url.pathname).toBe('/yuanshu-workbench/projects/P-1/contracts')
    if (init?.method === 'POST' && typeof init.body === 'string') {
      writes.push(JSON.parse(init.body))
      if (writes.length === 1) return Response.json({ code: 403 }, { status: 403 })
      return Response.json({ data: { id: receipt.id } })
    }
    return Response.json({ data: { items: writes.length === 2 ? [receipt] : [] } })
  }))
  render(<ConversationEquipment session="contract-chat" t={t} />)

  const form = within(await screen.findByRole('dialog', { name: '新建销售合同' }, { timeout: 3000 }))
  const number = form.getByLabelText(zh['contract.code'])
  expect(number).toHaveProperty('value', 'CUSTOM-1')
  fireEvent.click(form.getByRole('button', { name: '保存' }))
  await form.findByText(/不接收指定合同编号/u)
  expect(writes).toEqual([])
  fireEvent.change(number, { target: { value: '' } })
  fireEvent.click(form.getByRole('button', { name: '保存' }))
  await form.findByText(/403/u)
  expect(form.getByLabelText(zh['contract.intake.customer'])).toHaveProperty('value', '示例客户')
  fireEvent.click(form.getByRole('button', { name: '保存' }))
  await form.findByText(/C-SALES-4/u)
  expect(writes).toEqual(Array.from({ length: 2 }, () => ({
    contract_type: 'sales', status: 'draft', counterparty_id: 3, counterparty_name: '示例客户', total_amount: 100.5,
  })))
  fireEvent.click(form.getByRole('button', { name: '确认' }))
  expect(screen.queryByRole('dialog', { name: '新建销售合同' })).toBeNull()
})
