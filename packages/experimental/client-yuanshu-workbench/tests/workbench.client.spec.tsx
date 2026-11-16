// @vitest-environment jsdom
/** Role views and nested dialogs through the installed plugin registration. */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { apply, inject } from '../src/client/index.ts'
import { roleMethods } from '../src/client/methodology-data.ts'
import { createWorkbenchStore } from '../src/client/model.ts'
import { roleFixtures, roleIds, taskTitles } from '../src/client/fixtures.ts'
import { positionScenarios } from '../src/client/scenario-data.ts'
import { prioritiesForRole, priorityAssignment, priorityItems, type PriorityAssignment } from '../src/client/priorities-data.ts'
import { zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')
const runtimes = new Set<SlotTestRuntime>()
afterEach(async () => {
  cleanup()
  for (const runtime of runtimes) await runtime.dispose()
  runtimes.clear()
  localStorage.clear()
})

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.register('common', { zh: commonZh, en: commonEn })
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  const selectPanel = vi.fn()
  runtime.ctx.provide('layout', { selectPanel } as never)
  await runtime.declare({
    main: { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  })
  await runtime.mount({ inject, apply })
  runtime.renderSlot('main', {}, { entryKey: 'yuanshu-workbench' })
  return { selectPanel }
}

it('presents all 18 positions and company management with shared navigation and distinct work', async () => {
  await bench()
  const dialog = screen.getByRole('dialog', { name: '元枢工作台' })
  expect(within(dialog).getByRole('heading', { name: '今天要推进的工作，我已为你整理好。' })).toBeDefined()
  expect(within(dialog).getByRole('heading', { name: zh[priorityItems[3]!.title] })).toBeDefined()
  const selector = within(dialog).getByRole('combobox', { name: '当前岗位视角' })
  const options = within(selector).getAllByRole('option')
  expect(options).toHaveLength(19)
  const views: { position: string | null; dashboard: (string | null)[]; tasks: (string | null)[] }[] = []
  for (const option of options) {
    fireEvent.change(selector, { target: { value: option.getAttribute('value') } })
    const value = option.getAttribute('value')
    const role = roleIds.find(id => id === value)
    if (role === undefined) throw new Error('each position option must have a known id')
    fireEvent.click(within(dialog).getByRole('button', { name: '我的助理' }))
    const scenes = within(dialog).getByRole('region', { name: '从岗位 KPI 进入典型场景' })
    const dailyWork = within(dialog).getByRole('region', { name: '岗位日常工作' })
    expect(within(scenes).getAllByRole('button', { name: '让助理带我处理' })).toHaveLength(4)
    expect(within(dailyWork).getAllByRole('button', { name: '由助理协同开展' })).toHaveLength(3)
    expect(prioritiesForRole(role).length).toBeGreaterThan(0)
    fireEvent.click(within(dialog).getByRole('button', { name: '十大重点事项' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '与当前岗位相关' }))
    expect(within(dialog).getByRole('region', { name: '全公司需要推进的十大重点事项' }).querySelectorAll('article')).toHaveLength(prioritiesForRole(role).length)
    fireEvent.click(within(dialog).getByRole('button', { name: '我的助理' }))
    for (const scenario of positionScenarios[role]) {
      if (scenario === undefined) throw new Error('each position must have a KPI scenario')
      const currentScenes = within(dialog).getByRole('region', { name: '从岗位 KPI 进入典型场景' })
      const scenarioButtons = within(currentScenes).getAllByRole('button', { name: '让助理带我处理' })
      fireEvent.click(scenarioButtons[scenario.kpiIndex]!)
      expect(within(dialog).getByRole('heading', { name: zh[taskTitles[scenario.task]], level: 1 })).toBeDefined()
      expect(within(dialog).getByRole('heading', {
        name: `${zh[`${role}.metric${scenario.kpiIndex + 1}` as keyof typeof zh]} · ${roleFixtures[role].metrics[scenario.kpiIndex]}`,
      })).toBeDefined()
      expect(within(dialog).getByRole('heading', { name: '候选修改 · 尚未写入草稿' })).toBeDefined()
      fireEvent.click(within(dialog).getByRole('button', { name: '我的助理' }))
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '岗位工作台' }))
    expect(within(dialog).getAllByRole('region')).toHaveLength(
      ['executive', 'president'].includes(option.getAttribute('value') ?? '') ? 8 : 6,
    )
    const dashboard = within(dialog)
      .getAllByRole('heading')
      .map(heading => heading.textContent)
    for (const name of ['十大重点事项', '助理执行', '我的任务', '任务版本', '日程日历', '团队协作', '工作群']) {
      expect(within(dialog).getByRole('button', { name })).toBeDefined()
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '我的任务' }))
    const tasks = within(dialog)
      .getAllByRole('button')
      .filter(button => button.className.includes('taskRow'))
      .map(button => button.textContent)
    expect(tasks).toHaveLength(3)
    views.push({ position: option.textContent, dashboard, tasks })
  }
  expect(views).toMatchSnapshot()
})

it('creates a workgroup, assigns work, invites position assistants and keeps a visible conversation history', async () => {
  await bench()
  fireEvent.click(screen.getByRole('button', { name: '工作群' }))
  expect(screen.getByRole('log', { name: '聊天记录' })).toBeDefined()
  expect(screen.getAllByText('模拟助理回复').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '创建工作群' }))
  const createDialog = screen.getByRole('dialog', { name: '创建工作群' })
  fireEvent.change(within(createDialog).getByRole('textbox', { name: '群名称' }), {
    target: { value: '样机评审督办' },
  })
  fireEvent.change(within(createDialog).getByRole('combobox', { name: '选择岗位' }), {
    target: { value: 'quality' },
  })
  fireEvent.click(within(createDialog).getByRole('button', { name: '添加岗位' }))
  fireEvent.click(within(createDialog).getByRole('button', { name: '创建工作群' }))

  expect(screen.getByRole('heading', { name: '样机评审督办', level: 2 })).toBeDefined()
  expect(screen.getAllByText('生产工艺质量工程师').some(element => element.tagName === 'STRONG')).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: '描述需要推进的工作或跟进事项' }), {
    target: { value: '请质量岗位复核试验接收标准' },
  })
  fireEvent.click(screen.getByRole('button', { name: '发布安排' }))
  expect(screen.getByText('请质量岗位复核试验接收标准')).toBeDefined()
  expect(screen.getByText('安排给：采购工程师')).toBeDefined()

  fireEvent.change(screen.getByRole('textbox', { name: '发送消息' }), {
    target: { value: '请同步各自的评审结论' },
  })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  expect(screen.getByText('请同步各自的评审结论')).toBeDefined()
  expect(screen.getAllByText('模拟助理回复').length).toBeGreaterThan(1)
  expect(screen.getByText('我会重点关注：将根因假设与已确认事实分开，补足整改验证证据。（原型模拟回复）')).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: /^样机验证 · 项目沟通群/ }))
  expect(screen.getByText('请各岗位同步样机验证准备情况。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: /^样机评审督办/ }))
  expect(screen.getByText('请同步各自的评审结论')).toBeDefined()
  expect(localStorage.getItem('yuanshu-workbench.v2')).toContain('请同步各自的评审结论')
})

it('surfaces position signals first and opens a traceable assistant run', async () => {
  await bench()
  expect(screen.getByText(/KPI → 来源记录 → 工作事项/)).toBeDefined()
  expect(screen.getByText(/现在关注的原因/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '继续处理' }))
  expect(screen.getByRole('heading', { name: zh[priorityItems[3]!.title], level: 1 })).toBeDefined()
  expect(screen.getByRole('heading', { name: '执行计划' })).toBeDefined()
  expect(screen.getByText('这是本地模拟流程，不会调用元枢 MCP 或模型，也不会写入平台数据。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '十大重点事项' }))
  const supplierRow = within(screen.getByRole('region', { name: '全公司需要推进的十大重点事项' }))
    .getAllByRole('article')
    .find(article => article.textContent?.includes(zh[priorityItems[3]!.title]))
  if (supplierRow === undefined) throw new Error('priority list should retain its work status')
  expect(within(supplierRow).getByText('等待协作')).toBeDefined()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'quality' } })
  fireEvent.click(screen.getByRole('button', { name: '我的助理' }))
  expect(screen.getByRole('heading', { name: '今天要推进的工作，我已为你整理好。' })).toBeDefined()
  expect(screen.getByText('将根因假设与已确认事实分开，补足整改验证证据。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '查看岗位数据' }))
  expect(screen.getByRole('heading', { name: '每一个质量结论，都有依据。' })).toBeDefined()
})

it('shows all ten priority records and opens each responsible position workflow', async () => {
  await bench()
  fireEvent.click(screen.getByRole('button', { name: '十大重点事项' }))
  expect(within(screen.getByRole('region', { name: '全公司需要推进的十大重点事项' })).getAllByRole('article')).toHaveLength(10)
  let activeRole: (typeof roleIds)[number] = 'procurement'
  for (const item of priorityItems) {
    const region = screen.getByRole('region', { name: '全公司需要推进的十大重点事项' })
    const rows = within(region).getAllByRole('article')
    const row = rows.find(candidate => candidate.textContent?.includes(zh[item.title]))
    if (row === undefined) throw new Error(`missing priority ${item.id}`)
    expect(within(row).getByText(zh[item.reason])).toBeDefined()
    expect(within(row).getByText(zh[item.source])).toBeDefined()
    expect(within(row).getByText(zh[item.action])).toBeDefined()
    const assignment: PriorityAssignment | undefined = priorityAssignment(item, activeRole) ?? item.assignments[0]
    if (assignment === undefined) throw new Error(`missing responsible position for ${item.id}`)
    activeRole = assignment.role
    fireEvent.click(within(row).getByRole('button', { name: '让助理主导处理' }))
    const scenario = positionScenarios[assignment.role][assignment.kpiIndex]
    if (scenario === undefined) throw new Error(`missing work scenario for ${item.id}`)
    expect(screen.getByRole('combobox', { name: '当前岗位视角' })).toHaveProperty('value', assignment.role)
    expect(screen.getByRole('heading', { name: zh[item.title], level: 1 })).toBeDefined()
    expect(screen.getByRole('heading', { name: '执行计划' })).toBeDefined()
    expect(screen.getAllByText(zh[item.source]).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '十大重点事项' }))
  }
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'quality' } })
  fireEvent.click(screen.getByRole('button', { name: '十大重点事项' }))
  fireEvent.click(screen.getByRole('button', { name: '与当前岗位相关' }))
  expect(within(screen.getByRole('region', { name: '全公司需要推进的十大重点事项' })).getAllByRole('article')).toHaveLength(priorityItems.filter(item => priorityAssignment(item, 'quality') !== undefined).length)
})

it('records simulated agent steps, pauses for review and updates local work only after approval', async () => {
  await bench()
  fireEvent.click(screen.getByRole('button', { name: '十大重点事项' }))
  const list = screen.getByRole('region', { name: '全公司需要推进的十大重点事项' })
  const row = within(list).getAllByRole('article').find(article => article.textContent?.includes(zh[priorityItems[3]!.title]))
  if (row === undefined) throw new Error('supplier delivery priority should be available')
  fireEvent.click(within(row).getByRole('button', { name: '让助理主导处理' }))
  fireEvent.change(screen.getByRole('textbox', { name: '给本岗位助理的备注' }), {
    target: { value: '质量确认前不要调整交付承诺。' },
  })
  expect(screen.getByRole('textbox', { name: '给本岗位助理的备注' })).toHaveProperty('value', '质量确认前不要调整交付承诺。')
  fireEvent.click(screen.getByRole('button', { name: '开始执行' }))
  expect(screen.getByText('业务记录查询')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '运行下一步 · 2 / 4' }))
  fireEvent.click(screen.getByRole('button', { name: '运行下一步 · 3 / 4' }))
  expect(screen.getByRole('heading', { name: '跨岗位复核' })).toBeDefined()
  expect(screen.getAllByText('模拟步骤').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '运行下一步 · 4 / 4' }))
  expect(screen.getByRole('heading', { name: '拟议行动' })).toBeDefined()
  expect(screen.getByRole('button', { name: '确认并启动演示工作' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '补充分析' }))
  expect(screen.getByRole('button', { name: '运行下一步 · 3 / 4' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '运行下一步 · 3 / 4' }))
  fireEvent.click(screen.getByRole('button', { name: '运行下一步 · 4 / 4' }))
  fireEvent.click(screen.getByRole('button', { name: '确认并启动演示工作' }))
  expect(screen.getByText('已确认 · 演示工作进行中')).toBeDefined()
  expect(screen.getByRole('button', { name: '打开工作草稿' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '打开工作草稿' }))
  expect(screen.getByRole('heading', { name: zh[taskTitles[roleFixtures.procurement.tasks[1]]], level: 1 })).toBeDefined()
})

it.each([
  { role: 'procurement', title: '采购订单状态', row: '已逾期', value: '2', task: 'PCBA 来料异常处置' },
  { role: 'testing', title: '测试覆盖与计划', row: '功能用例', value: '92%', task: '耐久试验报告归档' },
  { role: 'operator', title: '每周工单完成与计划', row: '第 6 周', value: '27', task: '生产发料与异常登记' },
  {
    role: 'equipment',
    title: '设备安全与停机风险',
    row: '影响程度 高 · 处理紧迫度 高',
    value: '0',
    task: '关键设备故障维修',
  },
])('opens $title data and its corresponding task', async ({ role, title, row, value, task }) => {
  await bench()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: role } })
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: `查看图表明细：${title}` }))
  const detail = screen.getByRole('dialog', { name: title })
  const dataRow = within(detail).getByRole('row', { name: new RegExp(row) })
  expect(within(dataRow).getByRole('cell', { name: value })).toBeDefined()
  fireEvent.click(within(detail).getByRole('button', { name: '打开关联任务' }))
  expect(screen.getByRole('heading', { name: task, level: 1 })).toBeDefined()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
})

it('labels monetary chart values and plans in company management', async () => {
  await bench()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'executive' } })
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: '查看图表明细：经营回款计划与实际（万元）' }))
  const detail = screen.getByRole('dialog', { name: '经营回款计划与实际（万元）' })
  expect(within(detail).getByText('金额 · 万元')).toBeDefined()
  const row = within(detail).getByRole('row', { name: /第 6 周/ })
  expect(within(row).getByRole('cell', { name: '82' })).toBeDefined()
  expect(within(row).getByRole('cell', { name: '95' })).toBeDefined()
})

it('connects every role’s three methods to the corresponding work and specific guidance', async () => {
  await bench()
  const assignments = []
  for (const role of roleIds) {
    fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: role } })
    expect(roleMethods[role].map(item => item.task)).toEqual(roleFixtures[role].tasks)
    for (const assignment of roleMethods[role]) {
      fireEvent.click(screen.getByRole('button', { name: '工作方法' }))
      const card = screen.getByRole('heading', { name: zh[taskTitles[assignment.task]] }).closest('article')
      if (card === null) throw new Error('the method card must identify its task')
      fireEvent.click(within(card).getByRole('button', { name: '按此方法开展' }))
      expect(screen.getByRole('heading', { name: zh[taskTitles[assignment.task]], level: 1 })).toBeDefined()
      expect(screen.getByRole('heading', { name: zh[assignment.method.title] })).toBeDefined()
      expect(screen.getByText(zh[assignment.inputs])).toBeDefined()
      expect(screen.getByText(zh[assignment.output])).toBeDefined()
      expect(screen.getByText(zh[assignment.acceptance])).toBeDefined()
      assignments.push({
        role: zh[`role.${role}`], task: zh[taskTitles[assignment.task]], method: zh[assignment.method.title],
        inputs: zh[assignment.inputs], output: zh[assignment.output], acceptance: zh[assignment.acceptance],
        steps: assignment.method.steps.map(step => [zh[step.title], zh[step.prompt]]),
      })
    }
  }
  expect(assignments).toHaveLength(57)
  expect(assignments).toMatchSnapshot()
})

it('retains method records across navigation and includes them in saved version comparisons', async () => {
  await bench()
  fireEvent.click(screen.getByRole('button', { name: '工作方法' }))
  const supplier = screen.getByRole('heading', { name: '供应商季度评价' }).closest('article')
  if (supplier === null) throw new Error('supplier work must expose its method')
  fireEvent.click(within(supplier).getByRole('button', { name: '按此方法开展' }))
  fireEvent.change(screen.getByRole('textbox', { name: '材料核对记录' }), { target: { value: '核对本季度到货台账 v2，缺少两项响应记录。' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '已完成本阶段自查' }))
  fireEvent.click(screen.getByRole('button', { name: '2 · 分析' }))
  fireEvent.change(screen.getByRole('textbox', { name: '分析与验证记录' }), { target: { value: '按相同评价周期比较交付偏差，缺失数据待供应商确认。' } })
  fireEvent.click(screen.getByRole('button', { name: '3 · 工作成果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存草稿版本' }))
  fireEvent.click(screen.getByRole('button', { name: '任务版本' }))
  const compare = screen.getAllByRole('button', { name: '比较版本' })[0]
  if (compare === undefined) throw new Error('a saved version must expose comparison')
  fireEvent.click(compare)
  const comparison = screen.getByRole('dialog', { name: '比较版本' })
  expect(within(comparison).getByText('材料核对记录: 核对本季度到货台账 v2，缺少两项响应记录。')).toBeDefined()
  fireEvent.click(within(comparison).getByRole('button', { name: '关闭' }))
  fireEvent.click(screen.getByRole('button', { name: '我的任务' }))
  fireEvent.click(screen.getByRole('button', { name: /供应商季度评价/ }))
  expect(screen.getByRole('textbox', { name: '材料核对记录' })).toHaveProperty('value', '核对本季度到货台账 v2，缺少两项响应记录。')
  expect(screen.getByRole('checkbox', { name: '已完成本阶段自查' })).toHaveProperty('checked', true)
  fireEvent.click(screen.getByRole('button', { name: '提交协同审阅' }))
  const submission = screen.getByRole('dialog', { name: '提交协同审阅' })
  expect(within(submission).getByText('仍有未完成的自查或记录，可带着缺口提交协同审阅。')).toBeDefined()
  fireEvent.click(within(submission).getByRole('button', { name: '确认模拟交接' }))
  expect(screen.getByRole('button', { name: '已模拟交接' })).toBeDefined()
})

it('requires a recorded result before completing a reviewed work item', async () => {
  await bench()
  const scenes = screen.getByRole('region', { name: '从岗位 KPI 进入典型场景' })
  fireEvent.click(within(scenes).getAllByRole('button', { name: '让助理带我处理' })[0]!)
  fireEvent.click(screen.getByRole('button', { name: '提交协同审阅' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: '提交协同审阅' })).getByRole('button', { name: '确认模拟交接' }))
  expect(screen.getByRole('region', { name: '助理主导此场景' })).toBeDefined()
  expect(screen.getByRole('textbox', { name: '结果状态' })).toBeDefined()
  const complete = screen.getByRole('button', { name: '标记结果已核实' })
  expect(complete).toHaveProperty('disabled', true)
  fireEvent.change(screen.getByRole('textbox', { name: '结果状态' }), {
    target: { value: '复检通过，记录 QA-17 已归档。' },
  })
  expect(complete).toHaveProperty('disabled', false)
  fireEvent.click(complete)
  expect(screen.getAllByText('结果已记录在本地原型中。').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: '我的助理' }))
  expect(screen.getByText('有 0 项重点工作、1 项跨岗位确认和 1 项待审成果可以继续推进。')).toBeDefined()
})

it('records a cross-position confirmation and returns the work to progress', async () => {
  await bench()
  fireEvent.click(screen.getAllByRole('button', { name: '团队协作' })[0]!)
  fireEvent.change(screen.getByRole('textbox', { name: '请求岗位确认' }), {
    target: { value: '请确认缺陷批次的接收条件' },
  })
  fireEvent.click(screen.getByRole('button', { name: '添加本地跟进项' }))
  expect(screen.getByText('请确认缺陷批次的接收条件')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '已记录岗位确认' }))
  expect(screen.getByText('已记录岗位确认')).toBeDefined()
})

it('restores position work status and result evidence from browser storage', () => {
  const workItemId = positionScenarios.quality[0]!.workItemId
  const store = createWorkbenchStore().create()
  store.actions.changeRole('quality')
  store.actions.setWorkStatus(workItemId, 'review')
  store.actions.saveVerification(workItemId, '复检通过，记录 QA-17 已归档。')

  const restored = createWorkbenchStore().create()
  expect(restored.getSnapshot()).toMatchObject({
    role: 'quality',
    workStatuses: { [workItemId]: 'review' },
    verifications: { [workItemId]: '复检通过，记录 QA-17 已归档。' },
  })
})

it('drills from company risks to the responsible view and returns through DSH layout', async () => {
  const { selectPanel } = await bench()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'executive' } })
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  expect(screen.getByRole('heading', { name: '公司经营与跨部门风险' })).toBeDefined()
  const sales = screen.getByRole('heading', { name: '经营与回款' }).closest('article')
  if (sales === null) throw new Error('the company view did not render its operating risk')
  fireEvent.click(within(sales).getByRole('button', { name: '查看责任岗位' }))
  expect(screen.getByRole('combobox', { name: '当前岗位视角' })).toHaveProperty('value', 'sales')
  expect(screen.getByRole('heading', { name: '重点客户项目推进' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '返回 DSH 原始界面' }))
  expect(selectPanel).toHaveBeenLastCalledWith(null)
})

it('keeps the workbench open when Escape closes a nested material dialog', async () => {
  const { selectPanel } = await bench()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'hr' } })
  fireEvent.click(screen.getByRole('button', { name: '文件与资料' }))
  fireEvent.click(screen.getByRole('button', { name: /岗位需求与招聘计划/ }))
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(selectPanel).not.toHaveBeenCalledWith(null)
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  expect(selectPanel).toHaveBeenLastCalledWith(null)
})
