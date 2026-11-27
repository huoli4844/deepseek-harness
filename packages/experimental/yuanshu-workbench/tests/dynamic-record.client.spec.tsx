// @vitest-environment jsdom
/** 验证运行时表单保留用户输入，成功回执由用户确认关闭。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DynamicRecordDialog } from '../src/client/modules/business-forms/DynamicRecordDialog.tsx'
import { businessFormsZh } from '../src/client/modules/business-forms/business-forms-locales.ts'
import { equipmentZh } from '../src/client/modules/business-modules/equipment-locales.ts'
import type { WorkbenchT } from '../src/client/app/page-api.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('从动态字段显示中文枚举，拒绝保存后保留修改，收到回执后等待确认', async () => {
  const strings: Readonly<Record<string, string>> = { ...businessFormsZh, ...equipmentZh }
  const t: WorkbenchT = (key, values) => Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), strings[key] ?? key)
  localStorage.setItem('workbench-client-token', 'test-only')
  localStorage.setItem('yuanshu-active-tenant', '7')
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: { validation_message: '请补填检验编号' } }, { status: 422 }))
    .mockResolvedValueOnce(Response.json({ data: { receipt: '910' } }))
  vi.stubGlobal('fetch', fetcher)
  const close = vi.fn()
  render(<DynamicRecordDialog session="inspection" t={t} onClose={close} draft={{
    id: '00000000-0000-4000-8000-000000000001', kind: 'dynamic', title: '检验记录',
    content: { name: '初稿', status: '0' },
    fields: [{ key: 'name', label: '检验名称', required: true, type: 'string' }, {
      key: 'status', label: '检验状态', required: true, type: 'integer',
      options: [{ value: '0', label: '待检验' }, { value: '1', label: '已检验' }],
    }],
  }} />)
  const name = screen.getByRole('textbox', { name: /检验名称/ })
  const status = screen.getByRole('combobox', { name: /检验状态/ })
  expect(screen.getByRole('option', { name: '已检验' })).toBeTruthy()
  fireEvent.change(name, { target: { value: '人工改名' } })
  fireEvent.change(status, { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect((await screen.findByRole('alert')).textContent).toContain('请补填检验编号')
  expect(name).toHaveProperty('value', '人工改名')
  expect(status).toHaveProperty('value', '1')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect((await screen.findByRole('status')).textContent).toContain('910')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认' }))
  expect(close).toHaveBeenCalledOnce()
})

it.each(['客户', '项目', '销售合同'])('对话通过动态字段打开%s复核，失败保留输入，成功后由人工关闭', async (title) => {
  const { ConversationEquipment } = await import('../src/client/modules/business-forms/ConversationEquipment.tsx')
  const strings: Readonly<Record<string, string>> = { ...businessFormsZh, ...equipmentZh }
  const t: WorkbenchT = (key, values) => Object.entries(values ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), strings[key] ?? key)
  localStorage.setItem('workbench-client-token', 'test-only')
  localStorage.setItem('yuanshu-active-tenant', '7')
  const draft = {
    id: '00000000-0000-4000-8000-000000000001', kind: 'dynamic', title,
    fields: [{ key: 'name', label: '名称', type: 'string', required: true }], content: { name: '预填名称' },
  }
  const writes: unknown[] = []
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('测试预期同源代理')
    if (input.includes('/equipment-form?')) return Response.json({ data: draft })
    if (input.includes('/equipment-submit?')) {
      writes.push(JSON.parse(typeof init?.body === 'string' ? init.body : 'null'))
      return writes.length === 1
        ? Response.json({ data: { validation_message: '请检查名称' } }, { status: 422 })
        : Response.json({ data: { receipt: '910' } })
    }
    if (input.includes('/equipment-dismiss?')) return Response.json({ data: {} })
    throw new Error('出现未声明的请求')
  })
  vi.stubGlobal('fetch', fetcher)
  render(<ConversationEquipment session="dynamic-chat" t={t} />)
  const dialog = await screen.findByRole('dialog', { name: `新增复核 · ${title}` }, { timeout: 3000 })
  const name = screen.getByRole('textbox', { name: /名称/ })
  expect(name).toHaveProperty('value', '预填名称')
  expect(writes).toHaveLength(0)
  fireEvent.change(name, { target: { value: '人工名称' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect((await screen.findByRole('alert')).textContent).toContain('请检查名称')
  expect(name).toHaveProperty('value', '人工名称')
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect((await screen.findByRole('status')).textContent).toContain('910')
  expect(dialog.isConnected).toBe(true)
  expect(writes).toEqual(Array.from({ length: 2 }, () => ({ id: draft.id, content: { name: '人工名称' } })))
  fireEvent.click(screen.getByRole('button', { name: '确认' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
