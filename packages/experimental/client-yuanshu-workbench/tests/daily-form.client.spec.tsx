// @vitest-environment jsdom
/** 验证受控表单预填、人工编辑和实际回调；不依赖后台或模型。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BusinessFormsContainer } from '../src/client/modules/business-forms/index.ts'
import { beijingDay, parseContent, type DailyForm } from '../src/business-forms/model.ts'
import { dailySurface } from '../src/business-forms/a2ui.ts'
import { canSubmit, formView } from '../src/client/modules/business-forms/viewmodel.ts'
import { zh } from '../src/client/core/locales/locales.ts'
import type { ComposerBlock, ComposerBlocks } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

const t = (key: string, values?: Readonly<Record<string, unknown>>) => Object.entries(values ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), zh[key as keyof typeof zh] ?? key)
const form: DailyForm = { id: '00000000-0000-4000-8000-000000000001', schema_id: 'daily-report.v1',
  template_id: 'edit', template_version: 1,
  work_date: '2026-11-25', expected_version: 0, expires_at: Date.now() + 100_000,
  content: { completed_work: '完成接口开发', in_progress_work: '', planned_work: '', issues_and_risks: '', need_support: '' },
  evidence_refs: [{ session_id: 'owned-a', seq: 3 }], coverage: 'verified-active-workbench-sessions' }

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

function source(failFirst = false) {
  localStorage.setItem('workbench-client-token', 'test-only')
  localStorage.setItem('yuanshu-active-tenant', '7')
  const decisions: unknown[] = []
  let pending = true
  const request = vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('测试预期同源字符串路径')
    const url = input
    if (url.includes('/bind?')) return Response.json({ data: { bound: true } })
    if (url.includes('/decision?')) {
      if (typeof init?.body !== 'string') throw new Error('测试预期 JSON 请求')
      decisions.push(JSON.parse(init.body))
      if (failFirst && decisions.length === 1) throw new TypeError('测试响应丢失')
      pending = false
      return Response.json({ data: { report: { id: 1, version: 1, status: 'submitted' } } })
    }
    return Response.json({ data: { form: pending ? form : null, surface: pending ? dailySurface(form.id, form.content) : null } })
  })
  vi.stubGlobal('fetch', request)
  return { decisions, request }
}

it('按北京时间确定业务日，拒绝未知字段、超长字段和非白名单布局', () => {
  expect(beijingDay(Date.parse('2026-11-24T16:01:00Z'))).toBe('2026-11-25')
  expect(canSubmit({ ...form.content, completed_work: '', planned_work: '仅计划不能当成工作' })).toBe(false)
  expect(() => parseContent({ ...form.content, submitted_by: 9 })).toThrow()
  expect(() => parseContent({ ...form.content, completed_work: '文'.repeat(10001) })).toThrow()
  const surface = dailySurface(form.id, form.content)
  expect(formView(form, surface).fields).toHaveLength(5)
  expect(() => formView(form, { ...surface, beginRendering: { surfaceId: 'other', root: 'root' } })).toThrow()
})

it('弹窗显示预填五字段，确认前不写入；人工编辑的最终正文直接进入回调', async () => {
  const { decisions } = source()
  render(<BusinessFormsContainer session="owned-a" active t={t} />)
  await screen.findByRole('dialog', { name: '核对工作日报' })
  expect(screen.getByRole('dialog').getAttribute('style')).toContain('width: 640px')
  expect(screen.getByRole('dialog').getAttribute('style')).toContain('max-width: 100%')
  expect(document.activeElement).toBe(screen.getByLabelText('今日已完成'))
  expect(screen.getByDisplayValue('完成接口开发')).toBeDefined()
  expect(screen.getAllByRole('textbox')).toHaveLength(5)
  expect(screen.getByText(/依据已绑定本人账号的本地工作台记录/u)).toBeDefined()
  expect(decisions).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('今日已完成'), { target: { value: '人工核对后的正文' } })
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }))
  await screen.findByText('日报已提交')
  expect(decisions).toHaveLength(1)
  expect(decisions[0]).toMatchObject({ action: 'submit', content: { completed_work: '人工核对后的正文' } })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('超时保留编辑并冻结正文，重试完全相同的请求后才显示提交成功', async () => {
  const { decisions } = source(true)
  render(<BusinessFormsContainer session="owned-a" active t={t} />)
  await screen.findByRole('dialog')
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }))
  await screen.findByText(/保存结果尚未确认/u)
  const input = screen.getByLabelText('今日已完成')
  expect(input.hasAttribute('disabled')).toBe(true)
  expect(screen.queryByText('日报已提交')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => { expect(decisions).toHaveLength(2) })
  expect(decisions[0]).toEqual(decisions[1])
  await screen.findByText('日报已提交')
})

it('切换登录凭证后不能把旧账号的草稿提交到新账号', async () => {
  const { decisions } = source()
  render(<BusinessFormsContainer session="owned-a" active t={t} />)
  await screen.findByRole('dialog')
  localStorage.setItem('workbench-client-token', 'another-account')
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }))
  await screen.findByText('日报表单暂不可用，请检查连接后重试')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(decisions).toHaveLength(0)
})

it.each([200, 409])('首条消息等待会话绑定，接口返回 %s 后恢复输入', async (status) => {
  const { request } = source()
  const bind = Promise.withResolvers<Response>()
  request.mockImplementationOnce(() => bind.promise)
  const state = createSnapshotStore<ComposerBlock | undefined>(undefined)
  const blocks: ComposerBlocks = { set: (_id, block) => { state.set(block) }, storeFor: () => state, forget: () => {} }
  render(<BusinessFormsContainer session="owned-a" active t={t} blocks={blocks} />)
  expect(state.getSnapshot()?.reason).toBe('正在验证工作台账号…')
  expect(request).toHaveBeenCalledTimes(1)
  bind.resolve(Response.json({ data: { bound: true } }, { status }))
  if (status === 200) await screen.findByRole('dialog')
  else await screen.findByRole('alert')
  expect(state.getSnapshot()).toBeUndefined()
})

it('只有宿主明确要求新会话才显示新建日报会话，切换前保留原对话', async () => {
  const { request } = source()
  request.mockResolvedValueOnce(Response.json({ data: { code: 'new-session-required' } }, { status: 409 }))
  const open = Promise.withResolvers<undefined>()
  const onNewChat = vi.fn(() => open.promise)
  render(<BusinessFormsContainer session="legacy" active t={t} onNewChat={onNewChat} />)
  const action = await screen.findByRole('button', { name: '新建日报会话' })
  expect(onNewChat).not.toHaveBeenCalled()
  fireEvent.click(action)
  expect(onNewChat).toHaveBeenCalledTimes(1)
  expect(action.hasAttribute('disabled')).toBe(true)
  open.reject(new Error('测试绑定失败'))
  await screen.findByText('暂时无法打开日报会话，请重试')
  expect(action.hasAttribute('disabled')).toBe(false)
})
