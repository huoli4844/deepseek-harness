// @vitest-environment jsdom
/** 从对话预填进入项目表单，模拟同源代理的查重、保存及回执。 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/core/locales/locales.ts'
import { ConversationEquipment } from '../src/client/modules/business-forms/ConversationEquipment.tsx'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) =>
  Object.entries(values ?? {}).reduce((copy, [name, value]) => copy.replaceAll(`{${name}}`, String(value)), zh[key])

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

it('项目表单由本人保存，保留权限错误后的输入，并按项目编码回查回执', async () => {
  localStorage.setItem('workbench-client-token', 'employee')
  localStorage.setItem('yuanshu-active-tenant', '9')
  const writes: unknown[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源代理')
    if (input.includes('/equipment-form?')) return Response.json({ data: {
      id: 'draft', kind: 'project', content: { code: 'EP220501', name: '示例项目', project_type: 'rd' },
    } })
    expect(new Headers(init?.headers).get('X-Active-Tenant')).toBe('9')
    if (input === '/yuanshu-workbench/projects/EP220501') {
      return writes.length < 2 ? new Response(null, { status: 404 })
        : Response.json({ code: 0, data: { id: 7, code: 'EP220501', name: '示例项目' } })
    }
    expect(input).toBe('/yuanshu-workbench/projects')
    expect(init?.method).toBe('POST')
    writes.push(JSON.parse(typeof init?.body === 'string' ? init.body : 'null'))
    if (writes.length === 1) return new Response(null, { status: 403 })
    return Response.json({ code: 0, data: { id: 7 } })
  }))
  render(<ConversationEquipment session="project-chat" t={t} />)
  const form = within(await screen.findByRole('dialog', { name: '新建项目' }, { timeout: 3000 }))
  expect(form.getByRole('option', { name: '研发' })).toHaveProperty('selected', true)
  expect(writes).toHaveLength(0)
  fireEvent.click(form.getByRole('button', { name: '保存' }))
  await form.findByText(/没有新建项目的权限/u)
  expect(form.getByLabelText('项目名称')).toHaveProperty('value', '示例项目')
  fireEvent.click(form.getByRole('button', { name: '保存' }))
  await form.findByText(/已保存 1 个项目.*EP220501/u)
  expect(writes).toEqual(Array.from({ length: 2 }, () => ({ code: 'EP220501', name: '示例项目', project_type: 'rd' })))
})
