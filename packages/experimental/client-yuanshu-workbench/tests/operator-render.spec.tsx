// @vitest-environment jsdom
/** 运营者工作台各页面的渲染冒烟测试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { OperatorWorkbench } from '../src/client/operator/index.ts'
import { zh } from '../src/client/locales.ts'
import type { ProjectionSource } from '../src/client/operator/source.ts'
import { EMPTY_PROJECTIONS, type RawProjections } from '../src/client/operator/source.ts'

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

it('renders all five operator screens with placeholders and no fabricated values', async () => {
  render(<OperatorWorkbench t={t} source={fakeSource(withRealBriefing())} />)

  // 经营总览：KPI 卡片与四类异常队列正常渲染。
  expect(await screen.findByText('合同总额')).toBeDefined()
  expect(screen.getAllByText('— — —').length).toBeGreaterThan(0)
  expect(screen.getAllByText('接口就绪 · 待抓样').length).toBeGreaterThan(0)
  expect(screen.getAllByText('待接入').length).toBeGreaterThan(0)

  // 工作台中不得出现编造的独立 0 值。
  expect(screen.queryByText(/^0$/)).toBeNull()

  // 真实的 briefing 计数显示为 3，而不是占位符。
  expect(screen.getByText('3')).toBeDefined()

  // B 档「字段待定」标签出现在项目穿透页。
  fireEvent.click(screen.getByRole('button', { name: '项目穿透' }))
  expect(screen.getAllByText('字段待定').length).toBeGreaterThan(0)

  // 依次切换其余页面。
  for (const label of ['职能专题', '证据与追溯', '异常与决策', '经营总览']) {
    fireEvent.click(screen.getByRole('button', { name: label }))
  }
  expect(screen.getByText('关键结果')).toBeDefined()
})

it('keeps placeholders visible when the projection source fails', async () => {
  const failing: ProjectionSource = {
    load: vi.fn().mockRejectedValue(new Error('offline')),
  }
  render(<OperatorWorkbench t={t} source={failing} />)
  expect(await screen.findByText('合同总额')).toBeDefined()
  expect(screen.getAllByText('— — —').length).toBeGreaterThan(0)
})

it('opens the decision centre with a detail drawer from an anomaly click', async () => {
  render(<OperatorWorkbench t={t} source={fakeSource(withRealBriefing())} />)
  const overdue = await screen.findByRole('button', { name: /逾期决策/ })
  fireEvent.click(overdue)
  const detail = screen.getByRole('region', { name: '关键事实' })
  expect(within(detail).getAllByText('— — —').length).toBeGreaterThan(0)
  // 治理操作按钮存在，但在 Action 适配前保持禁用。
  const approve = within(detail).getByRole('button', { name: '批准' }) as HTMLButtonElement
  expect(approve.disabled).toBe(true)
})
