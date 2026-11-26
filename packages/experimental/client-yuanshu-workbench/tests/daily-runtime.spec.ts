/** 日报运行时测试：验证模型不能写入、本人隔离、人工正文及幂等回执；不连接真实业务后台。 */
import { afterEach, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { BusinessForms } from '../src/plugins/business-forms/index.ts'
import { WorkRecords } from '../src/plugins/work-records/index.ts'
import { beijingDay, type DailyContent, type DailyDecision, type WorkEvidence } from '../src/business-forms/model.ts'

const content: DailyContent = { completed_work: '完成接口开发', in_progress_work: '', planned_work: '', issues_and_risks: '', need_support: '' }
const credential = { authorization: 'Bearer test-only', tenant: '7' }
const signal = new AbortController().signal

afterEach(() => { vi.useRealTimers() })

function fixture() {
  const saved: object[] = []
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method !== 'PUT') return Response.json({ data: { report: null } })
    if (typeof init.body !== 'string') throw new Error('测试预期 JSON 正文')
    const input: unknown = JSON.parse(init.body)
    saved.push({ input })
    return Response.json({ data: { report: { id: 1, work_date: beijingDay(), version: 1, status: 'submitted',
      ...content, evidence_refs: [], created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z',
      submitted_at: '2026-11-25T01:00:00Z' } } })
  })
  const records = new WorkRecords('https://test.invalid', request)
  const forms = new BusinessForms(records)
  const session = Session.create(SessionId('owned-a'))
  forms.bind({ session, identity: { user: 8, tenant: 7, canWrite: true }, credential, verifiedAt: Date.now() })
  const evidence: WorkEvidence = { session_id: session.id, seq: 3, kind: 'tool/result', time: new Date().toISOString(),
    text: '完成接口开发', truncated: false, outcome: 'success' }
  forms.evidence(session.id, [evidence])
  return { forms, session, request, saved, evidence }
}

it('打开表单不写入，只有人工确认才保存最终编辑值；重复点击复用真实回执', async () => {
  const { forms, session, saved, request, evidence } = fixture()
  const form = await forms.open(session.id, content, [evidence], signal)
  expect(saved).toHaveLength(0)
  expect(forms.status(session.id, form.id)).toMatchObject({ status: 'pending', report: null })
  const decision: DailyDecision = { form_id: form.id, request_id: '00000000-0000-4000-8000-000000000001',
    action: 'submit', content: { ...content, completed_work: '人工修改后的最终正文' } }
  const results = await Promise.all([forms.decide(session.id, decision, signal), forms.decide(session.id, decision, signal)])
  expect(results[0]).toEqual(results[1])
  expect(saved).toHaveLength(1)
  const body = request.mock.calls.at(-1)?.[1]?.body
  if (typeof body !== 'string') throw new Error('测试预期字符串正文')
  expect(JSON.parse(body)).toMatchObject({ completed_work: '人工修改后的最终正文', status: 'submitted' })
  expect(forms.status(session.id, form.id)).toMatchObject({ status: 'submitted', report: { id: 1 } })
  await forms.decide(session.id, decision, signal)
  expect(saved).toHaveLength(1)
  await expect(forms.decide(session.id, { ...decision, content }, signal)).rejects.toMatchObject({ status: 409 })
})

it('拒绝未绑定会话、跨账号续租、错误凭证和伪造出处', async () => {
  const { forms, session } = fixture()
  expect(() => forms.require('unbound')).toThrow()
  expect(() =>{  forms.bind({ session, credential, verifiedAt: Date.now(), identity: { user: 9, tenant: 7, canWrite: true } }) }).toThrow()
  expect(() => forms.browser(session.id, { ...credential, tenant: '8' })).toThrow()
  await expect(forms.open(session.id, content, [{ session_id: 'other-user', seq: 3 }], signal)).rejects.toMatchObject({ status: 400 })
  await expect(forms.open(session.id, content, [{ session_id: session.id, seq: 99 }], signal)).rejects.toMatchObject({ status: 400 })
})

it('相同账号另一会话也不能读取或确认此表单，取消不写后台', async () => {
  const { forms, session, saved } = fixture()
  const other = Session.create(SessionId('owned-b'))
  forms.bind({ session: other, credential, verifiedAt: Date.now(), identity: { user: 8, tenant: 7, canWrite: true } })
  const form = await forms.open(session.id, content, [], signal)
  expect(forms.pending(other.id)).toBeNull()
  expect(() => forms.status(other.id, form.id)).toThrow()
  const decision: DailyDecision = { form_id: form.id, request_id: '00000000-0000-4000-8000-000000000002', action: 'cancel', content }
  await expect(forms.decide(other.id, decision, signal)).rejects.toMatchObject({ status: 404 })
  await forms.decide(session.id, decision, signal)
  expect(saved).toHaveLength(0)
  expect(forms.status(session.id, form.id)).toMatchObject({ status: 'cancelled' })
})

it('租约过期与卸载停止新操作，不保留可用凭证', () => {
  vi.useFakeTimers()
  const { forms, session } = fixture()
  vi.advanceTimersByTime(120_001)
  expect(() => forms.require(session.id)).toThrow()
  forms.dispose()
  expect(() => forms.require(session.id)).toThrow()
})

it('选择固定编辑模板并保留后台已存人工草稿，模型重新整理不能覆盖', async () => {
  const { forms, session, request } = fixture()
  request.mockResolvedValueOnce(Response.json({ data: { report: {
    ...content, completed_work: '已经由本人修改并保存的正文', id: 7, version: 3, status: 'draft',
    work_date: beijingDay(), evidence_refs: [{ session_id: 'earlier-owned-session', seq: 2 }],
    created_at: '2026-11-25T00:00:00Z', updated_at: '2026-11-25T01:00:00Z', submitted_at: null,
  } } }))
  const form = await forms.open(session.id, { ...content, completed_work: '模型新草稿' }, [], signal)
  expect(form).toMatchObject({ template_id: 'edit', template_version: 1, expected_version: 3,
    content: { completed_work: '已经由本人修改并保存的正文' },
    evidence_refs: [{ session_id: 'earlier-owned-session', seq: 2 }],
  })
  expect(Object.keys(form.content)).toHaveLength(5)
})

it('超时后只允许相同幂等请求重试，拒绝修改正文抢占', async () => {
  const { forms, session, request, saved } = fixture()
  const form = await forms.open(session.id, content, [], signal)
  request.mockRejectedValueOnce(new TypeError('测试响应丢失'))
  const decision: DailyDecision = { form_id: form.id, request_id: '00000000-0000-4000-8000-000000000003', action: 'submit', content }
  await expect(forms.decide(session.id, decision, signal)).rejects.toThrow('测试响应丢失')
  await expect(forms.decide(session.id, { ...decision, request_id: '00000000-0000-4000-8000-000000000004' }, signal)).rejects.toMatchObject({ status: 409 })
  expect(forms.status(session.id, form.id)).toMatchObject({ status: 'pending' })
  await forms.decide(session.id, decision, signal)
  expect(saved).toHaveLength(1)
})

it('周报先按后台契约保存草稿，再通过提交端点取得回执', async () => {
  const start = '2026-11-23'
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: { report: { id: 8, period_start: start, status: 'draft' } } }))
    .mockResolvedValueOnce(Response.json({ data: { report: { id: 8, period_start: start, status: 'submitted' } } }))
  const records = new WorkRecords('https://test.invalid', request)
  await expect(records.saveWeekly(start, credential, { status: 'submitted', content: {
    period_start: start, progress_summary: '本周进展', completed_work: '本周成果',
    planned_work: '下周计划', issues_and_risks: '', need_support: '', items: [],
  } }, signal)).resolves.toMatchObject({ id: 8, status: 'submitted' })
  expect(request.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    ['https://test.invalid/api/v1/apps/deepseek-harness/weekly-reports', 'PUT'],
    ['https://test.invalid/api/v1/apps/deepseek-harness/weekly-reports/submit', 'POST'],
  ])
  const draft = request.mock.calls[0]?.[1]?.body
  if (typeof draft !== 'string') throw new Error('测试预期 JSON 正文')
  expect(JSON.parse(draft)).toEqual({ period_start: start, progress_summary: '本周进展',
    completed_work: '本周成果', planned_work: '下周计划', issues_and_risks: null, need_support: null })
  expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ period_start: start }))
})
