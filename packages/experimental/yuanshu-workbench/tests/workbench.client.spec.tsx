// @vitest-environment jsdom
/** 验证当前岗位菜单、业务页面与原生对话入口；不依赖真实后台。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'

// 资料库的构建产物依赖浏览器模块加载器，外壳测试用轻量替身隔离它。
vi.mock('@deepseek-ai/dsh-yuanshu-doclib/client', () => ({
  DoclibWorkbench: () => null,
  en: {},
  zh: {},
}))
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { apply, inject } from '../src/client/index.ts'
import { roleMethods } from '../src/client/core/data/methodology-data.ts'
import { createWorkbenchStore } from '../src/client/core/model.ts'
import { roleFixtures, roleIds, taskTitles } from '../src/client/core/fixtures.ts'
import { positionScenarios } from '../src/client/core/data/scenario-data.ts'
import { menuForRole } from '../src/client/core/position-menus.ts'
import { zh } from '../src/client/core/locales/locales.ts'

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
  const startSession = vi.fn()
  runtime.ctx.provide('uiWorkspace', { startSession } as never)
  // 设置弹窗与资料库面板读取的 Remote 命名空间，测试中给出空实现即可挂载。
  runtime.ctx.provide('remote.pluginManager', { listBundles: async () => ({ ok: true, value: [] }) } as never)
  runtime.ctx.provide('remote.skills', { list: async () => ({ ok: true, value: { skills: [] } }) } as never)
  runtime.ctx.provide('remote.workspaceFiles', {} as never)
  runtime.ctx.provide('remote.session', {} as never)
  await runtime.declare({
    main: { kind: 'keyed', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
  })
  await runtime.mount({ inject, apply })
  runtime.renderSlot('main', {}, { entryKey: 'yuanshu-workbench' })
  return { selectPanel, startSession }
}

it('在知识中心下方打开统一个人页入口', async () => {
  await bench()
  const knowledge = screen.getByRole('button', { name: '知识中心' })
  const personal = screen.getByRole('button', { name: '我的个人页' })
  expect(knowledge.nextElementSibling).toBe(personal)
  fireEvent.click(personal)
  expect(personal.getAttribute('aria-current')).toBe('page')
  await screen.findByText('请重新登录元枢后打开个人页面。')
})

it('shows every business module in the project position view', async () => {
  await bench()
  const dialog = screen.getByRole('dialog', { name: '元枢工作台' })
  fireEvent.change(within(dialog).getByRole('combobox', { name: '当前岗位视角' }), { target: { value: 'project' } })
  const navigation = within(dialog).getByRole('navigation')
  // 业务模块按岗位平铺在「业务应用」分组，不再挂在岗位运营二级菜单下。
  expect(within(navigation).queryByRole('button', { name: '岗位运营' })).toBeNull()

  for (const label of ['客户资源', '物料管理', '供应商管理', '设备台账', '合同管理', '预算与成本', '工时填报', '周报管理/登记']) {
    expect(within(navigation).getByText(label)).toBeDefined()
    fireEvent.click(within(navigation).getByRole('button', { name: label }))
    const search = new Map([['客户资源', '搜索客户'], ['供应商管理', '搜索供应商'], ['物料管理', '物料筛选'], ['合同管理', '合同筛选']]).get(label)
    if (search !== undefined) {
      expect(within(dialog).getByRole('form', { name: search })).toBeDefined()
      expect(within(dialog).queryByRole('heading', { name: label })).toBeNull()
    } else if (label === '工时填报') {
      expect(within(dialog).getByRole('button', { name: '上一周' })).toBeDefined()
      expect(within(dialog).getAllByRole('combobox', { name: '项目' })).toHaveLength(7)
      expect(within(dialog).getAllByRole('combobox', { name: '完成状态' })).toHaveLength(7)
      expect(within(dialog).getAllByRole('button', { name: '添加项目' })).toHaveLength(7)
      expect(within(dialog).getByText('本周工时汇总')).toBeDefined()
      expect(within(dialog).queryByRole('heading', { name: label })).toBeNull()
    } else if (label === '周报管理/登记') {
      expect(within(dialog).getByRole('button', { name: zh['weekly.previousMonth'] })).toBeDefined()
      expect(within(dialog).queryByRole('heading', { name: label })).toBeNull()
    } else {
      expect(within(dialog).getByRole('heading', { name: label })).toBeDefined()
    }
  }
  expect(within(dialog).getByRole('button', { name: zh['weekly.nextMonth'] })).toBeDefined()
})

it('keeps saved work when an older browser record lacks new fields', () => {
  const handle = createWorkbenchStore()
  const legacy = handle.spec.init()
  const { sceneCheckpoints: _missing, ...saved } = legacy
  localStorage.setItem('yuanshu-workbench.v2', JSON.stringify({ ...saved, role: 'project', day: 22 }))
  const state = handle.create().store.getSnapshot()
  expect(state).toMatchObject({ role: 'project', day: 22, sceneCheckpoints: {} })
})

it('shows a permanent native assistant rail entry without rendering a fake chat', async () => {
  await bench()
  // 右栏只承载原生会话，不再渲染自建的问候语、推荐问题或输入框。
  expect(screen.getByRole('complementary', { name: '智能问答' })).toBeDefined()
  expect(screen.queryByRole('textbox', { name: '直接向智能问答提问…' })).toBeNull()
  expect(screen.queryByRole('button', { name: '打开助理对话' })).toBeNull()
  expect(screen.queryByRole('region', { name: '直接讨论今天的工作' })).toBeNull()
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
])('opens $title data and its corresponding task', async ({ role, title, row, value, task: _task }) => {
  await bench()
  fireEvent.change(screen.getByRole('combobox', { name: '当前岗位视角' }), { target: { value: role } })
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: `查看图表明细：${title}` }))
  const detail = screen.getByRole('dialog', { name: title })
  const dataRow = within(detail).getByRole('row', { name: new RegExp(row) })
  expect(within(dataRow).getByRole('cell', { name: value })).toBeDefined()
  fireEvent.click(within(detail).getByRole('button', { name: '打开关联任务' }))
  expect(screen.getByRole('region', { name: zh['home.workContext'] })).toBeDefined()
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
      // 工作方法视图已不在侧栏菜单中：每轮经“岗位工作台 → 查看岗位方法”进入。
      fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
      fireEvent.click(screen.getByRole('button', { name: '查看岗位方法' }))
      const card = screen.getByRole('heading', { name: zh[taskTitles[assignment.task]] }).closest('article')
      if (card === null) throw new Error('the method card must identify its task')
      fireEvent.click(within(card).getByRole('button', { name: '按此方法开展' }))
      expect(screen.getByRole('region', { name: zh['home.workContext'] })).toBeDefined()
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
  // 工作方法视图已不在侧栏菜单中：经“岗位工作台 → 查看岗位方法”进入。
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: '查看岗位方法' }))
  const supplier = screen.getByRole('heading', { name: '供应商季度评价' }).closest('article')
  if (supplier === null) throw new Error('supplier work must expose its method')
  fireEvent.click(within(supplier).getByRole('button', { name: '按此方法开展' }))
  fireEvent.change(screen.getByRole('textbox', { name: '材料核对记录' }), { target: { value: '核对本季度到货台账 v2，缺少两项响应记录。' } })
  fireEvent.click(screen.getByRole('checkbox', { name: '已完成本阶段自查' }))
  fireEvent.click(screen.getByRole('button', { name: '2 · 分析' }))
  fireEvent.change(screen.getByRole('textbox', { name: '分析与验证记录' }), { target: { value: '按相同评价周期比较交付偏差，缺失数据待供应商确认。' } })
  fireEvent.click(screen.getByRole('button', { name: '3 · 工作成果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存草稿版本' }))
  fireEvent.click(screen.getByRole('button', { name: '查看版本历史 · 2 个版本' }))
  const compare = screen.getAllByRole('button', { name: '比较版本' })[0]
  if (compare === undefined) throw new Error('a saved version must expose comparison')
  fireEvent.click(compare)
  const comparison = screen.getByRole('dialog', { name: '比较版本' })
  expect(within(comparison).getByText('材料核对记录: 核对本季度到货台账 v2，缺少两项响应记录。')).toBeDefined()
  fireEvent.click(within(comparison).getByRole('button', { name: '关闭' }))
  // 岗位运营不再占菜单：「岗位工作台 → 查看场景」进入后直接点击任务行。
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: '查看场景' }))
  fireEvent.click(screen.getByRole('button', { name: /供应商季度评价/ }))
  fireEvent.click(screen.getByRole('button', { name: '1 · 材料' }))
  expect(screen.getByRole('textbox', { name: '材料核对记录' })).toHaveProperty('value', '核对本季度到货台账 v2，缺少两项响应记录。')
  expect(screen.getByRole('checkbox', { name: '已完成本阶段自查' })).toHaveProperty('checked', true)
  fireEvent.click(screen.getByRole('button', { name: '3 · 工作成果' }))
  fireEvent.click(screen.getByRole('button', { name: '提交协同审阅' }))
  const submission = screen.getByRole('dialog', { name: '提交协同审阅' })
  expect(within(submission).getByText('仍有未完成的自查或记录，可带着缺口提交协同审阅。')).toBeDefined()
  fireEvent.click(within(submission).getByRole('button', { name: '确认模拟交接' }))
  expect(screen.getByRole('status').textContent).toBe('已模拟交接')
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
  expect(screen.getByRole('region', { name: '事项背景' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '返回本地工作台' }))
  expect(selectPanel).toHaveBeenLastCalledWith(null)
})


it('keeps the workbench open when Escape closes a nested material dialog', async () => {
  const { selectPanel } = await bench()
  // 文件与资料页已改为目录树 + 内联预览（不再弹窗）；改经任务工作页的「关联材料」打开嵌套弹窗。
  fireEvent.click(screen.getByRole('button', { name: '岗位工作台' }))
  fireEvent.click(screen.getByRole('button', { name: '查看岗位方法' }))
  const supplier = screen.getByRole('heading', { name: '供应商季度评价' }).closest('article')
  if (supplier === null) throw new Error('supplier work must expose its method')
  fireEvent.click(within(supplier).getByRole('button', { name: '按此方法开展' }))
  const evidence = screen.getByText('关联材料').parentElement
  if (evidence === null) throw new Error('work view must expose related materials')
  fireEvent.click(within(evidence).getAllByRole('button')[0]!)
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(selectPanel).not.toHaveBeenCalledWith(null)
  fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
  expect(selectPanel).toHaveBeenLastCalledWith(null)
})

it('十九个岗位按当前菜单画像显示业务项，共享任务、周报与资料入口', async () => {
  await bench()
  const selector = screen.getByRole('combobox', { name: '当前岗位视角' })
  expect(within(selector).getAllByRole('option')).toHaveLength(roleIds.length)
  for (const role of roleIds) {
    fireEvent.change(selector, { target: { value: role } })
    const navigation = within(screen.getByRole('navigation'))
    for (const entry of menuForRole(role).flatMap(section => section.entries)) {
      const parent = navigation.getByRole('button', { name: zh[entry.label] })
      expect(parent).toBeDefined()
      if (entry.children) {
        fireEvent.click(parent)
        for (const child of entry.children) expect(navigation.getByRole('button', { name: zh[child.label] })).toBeDefined()
        fireEvent.click(parent)
        for (const child of entry.children) expect(navigation.queryByRole('button', { name: zh[child.label] })).toBeNull()
      }
    }
    expect(navigation.queryByRole('button', { name: '工作群' })).toBeNull()
    expect(navigation.getByRole('button', { name: '我的任务' })).toBeDefined()
    expect(navigation.getByRole('button', { name: '个人资料' })).toBeDefined()
  }
})

it('默认进入任务页，业务入口不显示旧演示收件箱', async () => {
  await bench()
  expect(screen.getByRole('textbox', { name: zh['task.search'] })).toBeDefined()
  expect(screen.queryByRole('region', { name: '建议优先处理' })).toBeNull()
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name: '我的任务' }))
  expect(screen.getByRole('textbox', { name: zh['task.search'] })).toBeDefined()
})
