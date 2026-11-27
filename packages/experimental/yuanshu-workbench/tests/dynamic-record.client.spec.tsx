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
