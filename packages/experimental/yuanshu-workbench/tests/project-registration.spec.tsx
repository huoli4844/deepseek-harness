// @vitest-environment jsdom
/** 验证周报和工时填报的交互及同源请求。 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { zh } from '../src/client/core/locales/locales.ts'
import { useState } from 'react'
import { WeeklyReportEditor } from '../src/client/modules/business-modules/WeeklyReportEditor.tsx'
import type { WeeklyReportActions } from '../src/client/modules/business-modules/WeeklyOverview.tsx'
import { accessRoleOf } from '../src/client/modules/business-modules/access-role.ts'
import { WorkHoursScreen } from '../src/client/modules/business-modules/WorkHoursScreen.tsx'
import { DailyLaborEntry } from '../src/client/modules/business-modules/DailyLaborEntry.tsx'
import { beijingDate, moveDate, validLaborHours, weekStart } from '../src/client/modules/business-modules/project-registration-viewmodel.ts'
import { parsePlanRows, parseRiskRows } from '../src/client/modules/business-modules/weekly-report-rows.ts'

const t = (key: keyof typeof zh, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), zh[key],
)
const project = { id: 4, code: 'PRJ-01', name: '测试项目' }
const start = '2026-11-23'
const end = '2026-11-29'
const list = { items: [project], total: 1, page: 1, page_size: 20 }

function WeeklyEditorFixture({ management = false }: { readonly management?: boolean }) {
  const [actions, setActions] = useState<WeeklyReportActions>()
  return <>
    <WeeklyReportEditor t={t} start={start} role={management ? 'management' : 'employee'} onBusy={ignoreBusy} onActions={setActions} />
    <section aria-label="提交前检查">
      <button disabled={!actions || actions.busy} onClick={actions?.save}>保存草稿</button>
      <button disabled={!actions?.canSubmit || actions.busy} onClick={actions?.submit}>提交周报</button>
    </section>
  </>
}

function ignoreBusy() {}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

it('按北京时间确定自然周，通过十进制文本限制工时精度', () => {
  const day = beijingDate(new Date('2026-11-22T16:01:00Z'))
  expect(day).toBe(start)
  expect(weekStart(end)).toBe(start)
  expect(moveDate(start, 6)).toBe(end)
  expect(['1.50', '0.01', '999.99'].every(validLaborHours)).toBe(true)
  expect(['0', '0.001', '1000', 'abc'].some(validLaborHours)).toBe(false)
})

it('仅用真实后台角色编码判定管理层视角，演示身份不参与', () => {
  expect(accessRoleOf(['shaoshi_management'], true)).toBe('management')
  expect(accessRoleOf(['shaoshi_admin'], true)).toBe('management')
  expect(accessRoleOf(['shaoshi_purchase'], true)).toBe('employee')
  expect(accessRoleOf(['shaoshi_management'], false)).toBeUndefined()
})

it('解析下周计划与风险 JSON，旧纯文本回退为单行', () => {
  const plan = { project_code: 'PRJ-01', project_name: '测试项目', task_id: 10, task_name: '实施', priority: 'high', description: '联调' } as const
  const legacy = { project: '旧项目', stage: '旧阶段', priority: 'low', description: '旧计划' } as const
  const risk = { description: '物料延期', impact: '影响交付', support: '采购协助' } as const
  expect(parsePlanRows(JSON.stringify([plan]))).toEqual([plan])
  expect(parsePlanRows(JSON.stringify([legacy]))).toEqual([{
    project_code: '', project_name: '旧项目', task_id: undefined, task_name: '旧阶段', priority: 'low', description: '旧计划',
  }])
  expect(parsePlanRows('旧计划')).toEqual([{
    project_code: '', project_name: '', task_id: undefined, task_name: '', priority: 'mid', description: '旧计划',
  }])
  expect(parsePlanRows('   ')).toEqual([])
  expect(parseRiskRows(JSON.stringify([risk]))).toEqual([risk])
  expect(parseRiskRows('旧风险')).toEqual([{ description: '旧风险', impact: '', support: '' }])
  expect(parseRiskRows('')).toEqual([])
})

it('编辑已有周报只提交正文，失败保留输入，提交后锁定表单', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const edits: Record<string, unknown>[] = []
  let rejectNext = true
  // 项目关联保存在正文行内，表头不再绑定项目。
  const weekly = {
    id: 8, period_start: start, period_end: end, created_by: 10, status: 'draft',
    progress_summary: '原进展',
    completed_work: JSON.stringify([{
      project_code: project.code, project_name: project.name, task_id: 10, task_name: '任务甲',
      completion_status: 'in_progress', description: '工作',
    }]),
    planned_work: '计划', issues_and_risks: null, need_support: null,
  }
  const calls = vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源请求路径')
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/yuanshu-workbench/projects') return Response.json({ data: list })
    if (url.pathname === '/yuanshu-workbench/weekly-reports') {
      const labor = { total_hours: '1.50', employees: [{ user_id: 10, hours: '1.50' }] }
      if (init?.method === 'PUT') {
        if (rejectNext) { rejectNext = false; return Response.json({}, { status: 403 }) }
        if (typeof init.body !== 'string') throw new Error('缺少周报正文')
        edits.push(JSON.parse(init.body) as Record<string, unknown>)
        return Response.json({ data: { report: { ...weekly, ...edits.at(-1) }, labor } })
      }
      expect(url.searchParams.get('period_start')).toBe(start)
      return Response.json({ data: { report: weekly, labor } })
    }
    if (init?.method === 'POST') {
      return Response.json({ data: { report: { ...weekly, ...edits.at(-1), status: 'submitted' }, labor: { total_hours: '1.50', employees: [{ user_id: 10, hours: '1.50' }] } } })
    }
    throw new Error(`意外的请求路径：${url.pathname}`)
  })
  vi.stubGlobal('fetch', calls)
  render(<WeeklyEditorFixture management />)
  // 周报按用户每周一份，顶部不再有项目选择条。
  expect(screen.queryByRole('combobox', { name: '所属项目' })).toBeNull()
  await screen.findAllByRole('option', { name: /测试项目/u })
  // 旧版结构化事项行可直接改写描述。
  const progress = screen.getByRole('textbox', { name: '事项描述' })
  expect(progress).toHaveProperty('value', '工作')
  const report = within(screen.getByRole('region', { name: '提交前检查' }))
  fireEvent.change(progress, { target: { value: '新进展' } })
  fireEvent.change(screen.getByRole('combobox', { name: '工作类型' }), { target: { value: 'direct' } })
  fireEvent.click(report.getByRole('button', { name: '保存草稿' }))
  await screen.findByRole('alert')
  expect(progress).toHaveProperty('value', '新进展')
  fireEvent.click(report.getByRole('button', { name: '保存草稿' }))
  await screen.findByText('草稿已保存')
  expect(edits).toEqual([{
    period_start: start, progress_summary: '新进展', planned_work: '计划', issues_and_risks: null, need_support: null,
    completed_work: JSON.stringify([{
      project_code: 'PRJ-01', work_type: 'direct', description: '新进展',
      completion_status: 'in_progress', has_risk: false, risk_details: null,
    }]),
  }])
  fireEvent.click(report.getByRole('button', { name: '提交周报' }))
  await waitFor(() => { expect(progress).toHaveProperty('disabled', true) })
  const submitted = calls.mock.calls.find(([, request]) => request?.method === 'POST')
  expect(submitted?.[0]).toBe('/yuanshu-workbench/weekly-reports/submit')
  expect(submitted?.[1]?.body).toBe(JSON.stringify({ period_start: start }))
  expect(screen.queryByRole('button', { name: '查看工时明细' })).toBeNull()
})

it('新增事项不再依赖先选项目，可连续新增多行', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源请求路径')
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/yuanshu-workbench/projects') return Response.json({ data: list })
    if (url.pathname === '/yuanshu-workbench/weekly-reports' && init?.method !== 'PUT') {
      return Response.json({ data: { report: null, labor: { total_hours: '0', employees: [] } } })
    }
    throw new Error(`意外的请求路径：${url.pathname}`)
  }))
  render(<WeeklyEditorFixture />)
  const add = screen.getByRole('button', { name: '新增事项' })
  // 快照加载完成前整表禁用，加载后无需先选项目即可新增。
  await waitFor(() => { expect(add).toHaveProperty('disabled', false) })
  expect(screen.queryByRole('combobox', { name: '所属项目' })).toBeNull()
  fireEvent.click(add)
  fireEvent.click(add)
  expect(screen.getByText('事项 1')).toBeDefined()
  expect(screen.getByText('事项 2')).toBeDefined()
  expect(screen.getAllByRole('combobox', { name: '项目' })).toHaveLength(2)
  expect(screen.getAllByRole('combobox', { name: '工作类型' })).toHaveLength(2)
  expect(screen.getAllByRole('combobox', { name: '完成状态' })).toHaveLength(2)
  expect(screen.getAllByRole('textbox', { name: '事项描述' })).toHaveLength(2)
})

it('周报事项按项目、工作类型、状态和描述保存，并自动汇总进展摘要', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  let put: Record<string, unknown> | undefined
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源请求路径')
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/yuanshu-workbench/projects') return Response.json({ data: list })
    if (url.pathname === '/yuanshu-workbench/weekly-reports' && init?.method === 'PUT') {
      if (typeof init.body !== 'string') throw new Error('缺少周报正文')
      put = JSON.parse(init.body) as Record<string, unknown>
      return Response.json({ data: { report: { ...put, id: 1, period_end: end, created_by: 10, status: 'draft' }, labor: { total_hours: '0', employees: [] } } })
    }
    return Response.json({ data: { report: null, labor: { total_hours: '0', employees: [] } } })
  }))
  render(<WeeklyEditorFixture />)
  const add = screen.getByRole('button', { name: '新增事项' })
  await waitFor(() => { expect(add).toHaveProperty('disabled', false) })
  fireEvent.click(add)
  fireEvent.click(add)
  await screen.findAllByRole('option', { name: /测试项目/u })
  for (const select of screen.getAllByRole('combobox', { name: '项目' })) {
    fireEvent.change(select, { target: { value: project.code } })
  }
  for (const select of screen.getAllByRole('combobox', { name: '工作类型' })) {
    fireEvent.change(select, { target: { value: 'direct' } })
  }
  for (const select of screen.getAllByRole('combobox', { name: '完成状态' })) {
    fireEvent.change(select, { target: { value: 'in_progress' } })
  }
  const descriptions = screen.getAllByRole('textbox', { name: '事项描述' })
  fireEvent.change(descriptions[0], { target: { value: '完成联调' } })
  fireEvent.change(descriptions[1], { target: { value: '补充自测' } })
  fireEvent.click(within(screen.getByRole('region', { name: '提交前检查' })).getByRole('button', { name: '保存草稿' }))
  await waitFor(() => { expect(put).toBeDefined() })
  expect(put?.progress_summary).toBe('完成联调\n补充自测')
  const completed = JSON.parse(String(put?.completed_work)) as readonly Record<string, unknown>[]
  expect(completed).toEqual([
    { project_code: 'PRJ-01', work_type: 'direct', description: '完成联调', completion_status: 'in_progress', has_risk: false, risk_details: null },
    { project_code: 'PRJ-01', work_type: 'direct', description: '补充自测', completion_status: 'in_progress', has_risk: false, risk_details: null },
  ])
})

it('接收项目和已批准工时筛选，并用弹窗新建草稿', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const labor = { id: 6, user_id: 10, project_id: 4, work_date: start, hours: '1.50', work_type: 'direct', status: 'approved' }
  const calls = vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源请求路径')
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/yuanshu-workbench/projects') return Response.json({ data: list })
    if (init?.method === 'POST') return Response.json({ data: { ...labor, status: 'draft' } })
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ date_from: start, date_to: end, status: 'approved' })
    return Response.json({ data: { items: [labor], total: 1, archive_total: 3, page: 1, page_size: 20 } })
  })
  vi.stubGlobal('fetch', calls)
  render(<WorkHoursScreen t={t} initial={{ project, range: { projectCode: project.code, dateFrom: start, dateTo: end, status: 'approved' } }} />)
  await screen.findByRole('cell', { name: '1.50' })
  expect(screen.getByRole('combobox', { name: '状态' })).toHaveProperty('value', 'approved')
  expect(screen.getByText('3', { exact: true })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '填报工时' }))
  const dialog = within(screen.getByRole('dialog', { name: '填报工时' }))
  fireEvent.change(dialog.getByRole('textbox', { name: '小时数' }), { target: { value: '1.50' } })
  fireEvent.click(dialog.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => { expect(screen.queryByRole('dialog', { name: '填报工时' })).toBeNull() })
  const submitted = calls.mock.calls.find(([, request]) => request?.method === 'POST')
  expect(submitted?.[0]).toBe('/yuanshu-workbench/projects/PRJ-01/labor-hours')
  expect(submitted?.[1]?.body).toBe(JSON.stringify({ hours: '1.50', work_date: start, work_type: 'direct', description: '' }))
})

it('按每天的项目分割比例拆分并保存工时', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const projects = { items: [project, { id: 5, code: 'PRJ-02', name: '另一项目' }], total: 2, page: 1, page_size: 20 }
  const writes: { readonly path: string; readonly body: string }[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (typeof input !== 'string') throw new Error('应使用同源请求路径')
    const url = new URL(input, 'http://localhost')
    if (url.pathname === '/yuanshu-workbench/projects') return Response.json({ data: projects })
    if (url.pathname.endsWith('/labor-hours') && init?.method === 'POST') {
      const body = init.body
      if (typeof body !== 'string') throw new Error('缺少工时正文')
      writes.push({ path: url.pathname, body })
      const submitted = JSON.parse(body) as Record<string, unknown>
      const code = url.pathname.includes('PRJ-02') ? 'PRJ-02' : 'PRJ-01'
      const id = code === 'PRJ-02' ? 5 : 4
      return Response.json({ data: { ...submitted, id: writes.length, user_id: 10, project_id: id, status: 'draft', can_edit: true, can_submit: true } })
    }
    return Response.json({ data: { items: [], total: 0, page: 1, page_size: 100 } })
  }))
  const view = render(<DailyLaborEntry t={t} />)
  await screen.findAllByRole('combobox', { name: '项目' })
  const projectFields = screen.getAllByRole('combobox', { name: '项目' })
  fireEvent.change(projectFields[0], { target: { value: 'PRJ-01' } })
  fireEvent.click(screen.getAllByRole('button', { name: '添加项目' })[0])
  const ratios = screen.getAllByRole('textbox', { name: '分割比例' })
  fireEvent.change(ratios[0], { target: { value: '60' } })
  fireEvent.change(ratios[1], { target: { value: '40' } })
  const secondProject = screen.getAllByRole('combobox', { name: '项目' })[1]
  fireEvent.change(secondProject, { target: { value: 'PRJ-02' } })
  fireEvent.change(screen.getAllByRole('textbox', { name: '小时数' })[0], { target: { value: '8' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await waitFor(() => { expect(writes).toHaveLength(2) })
  expect(writes.map(item => (JSON.parse(item.body) as Record<string, unknown>).hours)).toEqual(['4.80', '3.20'])
  expect(writes.map(item => item.path)).toEqual([
    '/yuanshu-workbench/projects/PRJ-01/labor-hours',
    '/yuanshu-workbench/projects/PRJ-02/labor-hours',
  ])
  view.unmount()
})
