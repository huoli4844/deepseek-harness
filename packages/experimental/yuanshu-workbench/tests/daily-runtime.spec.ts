/** 日报运行时测试：验证模型不能写入、本人隔离、人工正文及幂等回执；不连接真实业务后台。 */
import { afterEach, expect, it, vi } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { BusinessForms } from '../src/plugins/yuanshu-business-forms/index.ts'
import { WorkRecords } from '../src/plugins/yuanshu-work-records/index.ts'
import { beijingDay, field, type DailyContent, type DailyDecision, type WorkEvidence } from '../src/business-forms/model.ts'

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

it('创建前按本人及报告周期读取已保存正文，不打开表单', async () => {
  const { forms, session, request, saved } = fixture()
  const date = beijingDay(), start = '2026-11-23'
  const submittedAt = date + 'T03:49:58+08:00'
  request.mockResolvedValueOnce(Response.json({ data: { report: {
    ...content, id: 12, status: 'submitted', version: 1, work_date: date,
    evidence_refs: [], created_at: submittedAt, updated_at: submittedAt, submitted_at: submittedAt,
  } } })).mockResolvedValueOnce(Response.json({ data: { report: {
    period_start: start, status: 'draft', progress_summary: '保留已保存周报',
    completed_work: '', planned_work: '', issues_and_risks: null, need_support: null,
  } } }))
  await expect(forms.existingDaily(session.id, signal)).resolves.toMatchObject({
    status: 'submitted', work_date: date, completed_work: content.completed_work,
  })
  await expect(forms.existingWeekly(session.id, start, signal)).resolves.toMatchObject({
    status: 'draft', report: { period_start: start, progress_summary: '保留已保存周报' },
  })
  expect(request.mock.calls.map(([url]) => typeof url === 'string' ? url : url instanceof URL ? url.toString() : '')).toEqual([
    'https://test.invalid/api/v1/apps/deepseek-harness/daily-reports/' + date,
    'https://test.invalid/api/v1/apps/deepseek-harness/weekly-reports?period_start=' + start,
  ])
  expect(forms.pending(session.id)).toBeNull()
  expect(forms.pendingWeekly(session.id)).toBeNull()
  expect(saved).toHaveLength(0)
})

it('当天已提交时返回提交回执且不产生新的待确认表单', async () => {
  const { forms, session, request, saved } = fixture()
  const date = beijingDay()
  const submittedAt = date + 'T03:49:58+08:00'
  request.mockResolvedValueOnce(Response.json({ data: { report: {
    ...content, id: 12, status: 'submitted', version: 1, work_date: date,
    evidence_refs: [], created_at: submittedAt, updated_at: submittedAt, submitted_at: submittedAt,
  } } }))
  await expect(forms.open(session.id, content, [], signal)).rejects.toMatchObject({ date, submittedAt })
  expect(forms.pending(session.id)).toBeNull()
  expect(saved).toHaveLength(0)
})

it('再次打开当天待确认表单时返回同一草稿', async () => {
  const { forms, session, saved } = fixture()
  const opened = await forms.open(session.id, content, [], signal)
  const reopened = await forms.open(session.id, { ...content, completed_work: '第二次整理' }, [], signal)
  expect(reopened).toEqual(opened)
  expect(saved).toHaveLength(0)
})

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
  const weeklyContent = {
    period_start: start, progress_summary: '本周进展', completed_work: '',
    planned_work: '下周计划', issues_and_risks: '', need_support: '',
    items: [{ id: 'item-1', project_code: 'P-8', project_name: '项目八', work_type: 'direct',
      description: '完成联调', completion_status: 'completed', has_risk: false, risk_details: '' }],
  }
  await expect(records.saveWeekly(start, credential, { status: 'submitted', content: weeklyContent }, signal))
    .resolves.toMatchObject({ id: 8, status: 'submitted' })
  expect(request.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
    ['https://test.invalid/api/v1/apps/deepseek-harness/weekly-reports', 'PUT'],
    ['https://test.invalid/api/v1/apps/deepseek-harness/weekly-reports/submit', 'POST'],
  ])
  const draft = request.mock.calls[0]?.[1]?.body
  if (typeof draft !== 'string') throw new Error('测试预期 JSON 正文')
  const savedDraft: unknown = JSON.parse(draft)
  expect(savedDraft).toMatchObject({ period_start: start, progress_summary: '本周进展',
    planned_work: '下周计划', issues_and_risks: null, need_support: null })
  expect(field(savedDraft, 'completed_work')).toBe(JSON.stringify([
    { project_code: 'P-8', work_type: 'direct', description: '完成联调',
      completion_status: 'completed', has_risk: false, risk_details: null },
  ]))
  expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ period_start: start }))
})


it('读取已保存周报时还原工作摘要和事项以供继续编辑', async () => {
  const start = '2026-11-23'
  const rows = [
    { project_code: 'P-8', work_type: 'meeting', description: '完成评审',
      completion_status: 'completed', has_risk: false, risk_details: null },
  ]
  const request = vi.fn<typeof fetch>(async () => Response.json({ data: { report: {
    id: 10, period_start: start, status: 'draft', version: 2, progress_summary: '进展',
    completed_work: JSON.stringify(rows), planned_work: '下周计划', issues_and_risks: null, need_support: null,
  } } }))
  const result = await new WorkRecords('https://test.invalid', request).weekly(start, credential, signal)
  expect(result.report).toMatchObject({
    completed_work: '',
    items: [{ project_code: 'P-8', project_name: '', description: '完成评审', work_type: 'meeting' }],
  })
})

it('旧登记页草稿和未填完的新草稿都能重新打开', async () => {
  const start = '2026-11-23'
  const rows = [
    { project_code: 'P-8', project_name: '项目八', task_id: 1, task_name: '评审',
      completion_status: 'completed', description: '完成评审' },
    { project_code: '', work_type: '', description: '待补事项', completion_status: '',
      has_risk: false, risk_details: null },
  ]
  const request = vi.fn<typeof fetch>(async () => Response.json({ data: { report: {
    period_start: start, status: 'draft', progress_summary: '', completed_work: JSON.stringify(rows),
    planned_work: '', issues_and_risks: null, need_support: null,
  } } }))
  const result = await new WorkRecords('https://test.invalid', request).weekly(start, credential, signal)
  expect(result.report?.items).toMatchObject([
    { project_code: 'P-8', work_type: '', description: '完成评审', completion_status: 'completed' },
    { project_code: '', work_type: '', description: '待补事项', completion_status: '' },
  ])
})

it('提交回执丢失时用后台事项契约比对已提交正文', async () => {
  const start = '2026-11-23'
  const item = { project_code: 'P-8', work_type: 'direct', description: '完成联调',
    completion_status: 'completed', has_risk: false, risk_details: null }
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: { report: { id: 11, period_start: start, status: 'draft' } } }))
    .mockResolvedValueOnce(Response.json({ code: 409, message: '已提交' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ data: { report: { id: 11, period_start: start, status: 'submitted',
      progress_summary: '本周进展', completed_work: JSON.stringify([item]), planned_work: '下周计划',
      issues_and_risks: null, need_support: null } } }))
  const content = { period_start: start, progress_summary: '本周进展', completed_work: '',
    planned_work: '下周计划', issues_and_risks: '', need_support: '', items: [{ ...item,
      id: 'local-id', project_name: '本地项目名称', risk_details: '' }] }
  const result = await new WorkRecords('https://test.invalid', request).saveWeekly(start, credential,
    { content, status: 'submitted' }, signal)
  expect(result).toMatchObject({ id: 11, status: 'submitted', completed_work: JSON.stringify([item]) })
})

it('恢复周报时，草稿已被其他入口更新则拒绝覆盖', async () => {
  const date = '2026-11-23'
  const request = vi.fn<typeof fetch>(async () => Response.json({ data: { report: {
    id: 12, period_start: date, status: 'draft', completed_work: '', progress_summary: '后台新草稿',
    planned_work: '', issues_and_risks: null, need_support: null, updated_at: '2026-11-26T02:00:00Z',
  } } }))
  const draft = { period_start: date, progress_summary: '本地草稿', completed_work: '', planned_work: '',
    issues_and_risks: '', need_support: '', items: [] }
  await expect(new WorkRecords('https://test.invalid', request).saveWeekly(date, credential, {
    content: draft, status: 'draft', recoveryRevision: '2026-11-26T01:00:00Z',
  }, signal)).rejects.toMatchObject({ status: 409 })
  expect(request).toHaveBeenCalledTimes(1)
  expect(request.mock.calls[0]?.[1]?.method).toBe('GET')
})

it('报告打开后权限被撤回时阻止保存，员工仍可以取消表单', async () => {
  const { forms, session, saved } = fixture()
  const form = await forms.open(session.id, content, [], signal)
  forms.bind({ session, credential, verifiedAt: Date.now(), identity: { user: 8, tenant: 7, canWrite: false } })
  const decision: DailyDecision = { form_id: form.id, request_id: '00000000-0000-4000-8000-000000000031',
    action: 'save', content }
  await expect(forms.decide(session.id, decision, signal)).rejects.toMatchObject({ status: 403 })
  expect(saved).toHaveLength(0)
  await expect(forms.decide(session.id, { ...decision, action: 'cancel' }, signal)).resolves.toBeNull()
})
