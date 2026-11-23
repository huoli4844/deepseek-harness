// @vitest-environment jsdom
/** 运营者工作台各页面的渲染冒烟测试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OperatorWorkbench } from '../src/client/operator/index.ts'
import { zh } from '../src/client/locales.ts'
import type { ProjectionSource } from '../src/client/operator/source.ts'
import { EMPTY_PROJECTIONS, type RawProjections } from '../src/client/operator/source.ts'
import type { OperatorScreenId } from '../src/client/operator/index.ts'

afterEach(() => { cleanup() })

const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

function fakeSource(projections: RawProjections = EMPTY_PROJECTIONS): ProjectionSource {
  return { load: vi.fn().mockResolvedValue(projections) }
}

function withRealBriefing(): RawProjections {
  return {
    ...EMPTY_PROJECTIONS,
    briefing: [{ title: '逾期决策', detail: '3 · 影响交付' }],
    decisions: [{ title: '批准采购单 PO-1024', detail: '超预算' }],
    projects: [{ title: '智能工厂一期', detail: '' }],
    fetchedAt: Date.UTC(2026, 10, 23),
  }
}

/** 按当前屏幕渲染内容组件；导航由外层驱动，这里只透传一个空回调。 */
function renderScreen(screenId: OperatorScreenId, source = fakeSource(withRealBriefing())) {
  return render(<OperatorWorkbench t={t} screen={screenId} onNavigate={vi.fn()} source={source} />)
}

it('经营总览展示分组 KPI、人员总工时卡片与时间范围切换器', async () => {
  renderScreen('overview')

  // KPI 卡片显示演示值（默认按当月），界面不再出现「待接入 / 字段待定」等状态标签。
  expect(await screen.findByText('¥ 405 万')).toBeDefined()
  expect(screen.queryByText('待接入')).toBeNull()
  expect(screen.queryByText('字段待定')).toBeNull()

  // KPI 按经营数据 / 人力资源 / 项目任务 / 质量总览四个分组展示，无「关键结果」标签。
  for (const group of ['经营数据', '人力资源', '项目任务', '质量总览']) {
    expect(screen.getByRole('heading', { name: group })).toBeDefined()
  }
  expect(screen.queryByText('关键结果')).toBeNull()
  // 异常队列不再出现在经营总览。
  expect(screen.queryByText('异常队列')).toBeNull()

  // 人员总工时占一个 KPI 卡位，渲染为可点击的按钮；每张卡都带完成率。
  expect(screen.getByRole('button', { name: /人员总工时/u })).toBeDefined()
  expect(screen.getAllByText(/完成率/u).length).toBeGreaterThan(0)
  // 总览图不出现人员级明细（人员姓名 / 人员工时表）。
  expect(screen.queryByText('周伟')).toBeNull()
  expect(screen.queryByText('人员工时')).toBeNull()

  // 时间范围切换器：当前进展 / 当月 / 本季度 / 本年 / 总览。
  for (const name of ['当前进展', '当月', '本季度', '本年', '总览']) {
    expect(screen.getByRole('button', { name })).toBeDefined()
  }
  expect(screen.queryByRole('button', { name: '周' })).toBeNull()
})

it('切换时间范围后 KPI 数据随之变化，目标值按全年平均分配', async () => {
  renderScreen('overview')
  await screen.findByText('¥ 405 万')
  // 默认按当月：合同总额 ¥ 405 万，目标 ¥ 500 万；切换到本年：¥ 5,600 万，目标 ¥ 6,000 万。
  expect(screen.getByText(/目标: ¥ 500 万/u)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '本年' }))
  expect(screen.getByText('¥ 5,600 万')).toBeDefined()
  expect(screen.getByText(/目标: ¥ 6,000 万/u)).toBeDefined()
  expect(screen.queryByText('¥ 405 万')).toBeNull()
  // 切换到总览：历史累计值，不显示目标行。
  fireEvent.click(screen.getByRole('button', { name: '总览' }))
  expect(screen.getByText('¥ 12,400 万')).toBeDefined()
  expect(screen.queryByText(/目标:/u)).toBeNull()
})

it('点击人员总工时卡片弹窗展示各项目工时', async () => {
  renderScreen('overview')
  await screen.findByText('¥ 405 万')
  expect(screen.queryByText('项目工时明细')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /人员总工时/u }))
  expect(screen.getByText('项目工时明细')).toBeDefined()
  // 弹窗中包含项目维度的投入 / 请假 / 净工时行。
  expect(screen.getAllByText('智慧园区一期').length).toBeGreaterThan(0)
  expect(screen.getByText('净工时')).toBeDefined()
})

it('经营总览不再显示数据更新时间', async () => {
  const { container } = renderScreen('overview')
  await screen.findByText('¥ 405 万')
  expect(screen.queryByText(/数据更新时间/u)).toBeNull()
  expect(container.querySelector('footer')).toBeNull()
})

it('renders every screen from the screen prop without an inner sidebar', async () => {
  const { rerender } = renderScreen('overview')
  expect(await screen.findByText('¥ 405 万')).toBeDefined()

  // 内层不再有自己的导航按钮，切屏完全由外层 screen prop 驱动。
  expect(screen.queryByRole('button', { name: '项目穿透' })).toBeNull()

  const source = fakeSource(withRealBriefing())
  const cases: readonly [OperatorScreenId, string][] = [
    ['projects', '项目阶段'],
    ['functional', '供应'],
    ['evidence', '证据链'],
    ['decisions', '事件要素'],
  ]
  for (const [screenId, expected] of cases) {
    rerender(<OperatorWorkbench t={t} screen={screenId} onNavigate={vi.fn()} source={source} />)
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
  }
})

it('项目穿透：项目总览下点击不同项目，穿透信息跟随变化', async () => {
  // 用演示项目（4 个）验证点击切换：维度卡片（含指标）与穿透明细随所选项目变化。
  renderScreen('projects', fakeSource(EMPTY_PROJECTIONS))
  await screen.findByText('项目总览')
  // 维度卡片默认选中「财务」；切到「当前运行状态」验证默认项目（智慧园区一期 → 正常运行）。
  fireEvent.click(screen.getByRole('button', { name: /当前运行状态/u }))
  expect(screen.getAllByText('正常运行').length).toBeGreaterThan(0)
  // 点击第二个项目（智能工厂二期 → 采购阶段 / 运行状态「预警」）。
  fireEvent.click(screen.getByRole('button', { name: /智能工厂二期/u }))
  expect(screen.getAllByText('预警').length).toBeGreaterThan(0)
  expect(screen.queryByText('正常运行')).toBeNull()
})

it('风险与决策：点击分类 tab 过滤队列', async () => {
  renderScreen('decisions')
  // 全部队列：异常事件行显示检验积压计数。
  expect((await screen.findAllByText('检验积压 · 5')).length).toBe(1)
  // 点击「异常事件」筛选：队列只剩异常事件，风险事件条目消失；
  // 详情抽屉回落到第一个异常事件，显示「已发生时间」等事件要素与影响域分析。
  fireEvent.click(screen.getByRole('button', { name: /异常事件 · /u }))
  expect(screen.getAllByText('检验积压 · 5').length).toBe(1)
  expect(screen.queryByText('关键设备到货延迟风险')).toBeNull()
  expect(screen.getByText('已发生时间')).toBeDefined()
  expect(screen.getByText('影响域分析')).toBeDefined()
  // 切回「全部」恢复完整队列（含风险事件条目）。
  fireEvent.click(screen.getByRole('button', { name: /全部 · /u }))
  expect(screen.getByText('关键设备到货延迟风险')).toBeDefined()
})

it('数据源失败时回退到演示数据，不出现空洞', async () => {
  const failing: ProjectionSource = {
    load: vi.fn().mockRejectedValue(new Error('offline')),
  }
  renderScreen('overview', failing)
  expect(await screen.findByText('¥ 405 万')).toBeDefined()
})

it('经营总览不再显示今日决策区块', async () => {
  render(<OperatorWorkbench t={t} screen="overview" onNavigate={vi.fn()} source={fakeSource(withRealBriefing())} />)
  // 今日决策已移至异常与决策中心：总览页不出现决策列表入口。
  await screen.findByText('经营数据')
  expect(screen.queryByText('今日决策')).toBeNull()
  expect(screen.queryByRole('button', { name: '批准采购单 PO-1024' })).toBeNull()
})
