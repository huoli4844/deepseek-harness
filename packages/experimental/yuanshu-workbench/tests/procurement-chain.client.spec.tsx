// @vitest-environment jsdom
/** 业务流程静态模板：采购/质量/行政节点、项目下拉与悬停高亮结构的渲染测试。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { zh } from '../src/client/core/locales/locales.ts'
import { FlowChainView, ProcurementChain } from '../src/client/modules/procurement-chain/ProcurementChain.tsx'
import { ADMIN_TEMPLATE, DEV_TEMPLATE, FINANCE_TEMPLATE, HR_TEMPLATE, MATERIALS_TEMPLATE, QUALITY_TEMPLATE, SUPPLIER_TEMPLATE } from '../src/client/modules/procurement-chain/procurement-chain-model.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const t = ((key: string, vars?: Record<string, string>) => {
  let text = zh[key as keyof typeof zh] ?? key
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}) as never

it('采购模板渲染主链路六节点、条件分支两节点与项目下拉', () => {
  render(<ProcurementChain t={t} />)
  for (const title of ['询价管理', '询价比价', '采购订单', '到货登记', '来料质量检验', '库存台账']) {
    // 标题与单据类型可能同名（如「采购订单」），至少出现一次即可。
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  expect(screen.getByText('条件分支')).toBeDefined()
  expect(screen.getByText('采购台账')).toBeDefined()
  expect(screen.getByText('入库单')).toBeDefined()
  expect(screen.getByText('8 个流程节点')).toBeDefined()
  // 「业务流程模板」标签已移除。
  expect(screen.queryByText('业务流程模板')).toBeNull()
})

it('质量模板渲染检验流程节点与复盘报告分支', () => {
  render(<FlowChainView template={QUALITY_TEMPLATE} t={t} />)
  for (const title of ['检验计划', '来料检验', '过程检验', '成品检验', '不合格品处理', '质量台账']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  expect(screen.getByText('质量业务链路')).toBeDefined()
  expect(screen.getByText('质量复盘报告')).toBeDefined()
  expect(screen.getByText('7 个流程节点')).toBeDefined()
})

it('行政模板渲染五组链路共二十个节点', () => {
  render(<FlowChainView template={ADMIN_TEMPLATE} t={t} />)
  for (const title of ['采购申请', '月度方案', '供应商报价', '行政采购订单', '到货验收', '付款回填',
    '采购月度归档', '用品台账', '领用申请', '用品盘点', '固定资产台账', '资产状态履历']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['验收与付款', '采购归档', '用品与盘点', '固定资产']) {
    expect(screen.getByText(label)).toBeDefined()
  }
  expect(screen.getByText('行政业务链路')).toBeDefined()
  expect(screen.getByText('20 个流程节点')).toBeDefined()
  // 行政行不是条件分支，无橙色标记卡片。
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(0)
})

it('物资模板渲染入库出库齐套四组链路共十四个节点', () => {
  render(<FlowChainView template={MATERIALS_TEMPLATE} t={t} />)
  for (const title of ['入库单', '入库单明细', '上架任务', '库存台账', '拣货任务', '出库单',
    '查单', '出库单明细', '齐套清单', '齐套清单明细']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['入库作业', '出库作业', '齐套管理']) {
    expect(screen.getByText(label)).toBeDefined()
  }
  expect(screen.getByText('物资业务链路')).toBeDefined()
  expect(screen.getByText('14 个流程节点')).toBeDefined()
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(0)
})

it('财务模板渲染主链路、回款、标准成本与条件分支共十一个节点', () => {
  render(<FlowChainView template={FINANCE_TEMPLATE} t={t} />)
  for (const title of ['合同管理', '项目预算', '工时填报', '项目成本', '付款申请', '发票管理',
    '合同应收计划', '实际收款单', '收款核销明细', '标准成本', '发票传递']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['合同回款', '标准成本', '条件分支']) {
    // 「标准成本」行标题与节点标题同名，至少出现一次即可。
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  }
  expect(screen.getByText('财务业务链路')).toBeDefined()
  expect(screen.getByText('11 个流程节点')).toBeDefined()
  // 「发票传递」是条件分支节点，带橙色标记。
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(1)
})

it('研发模板渲染主链路、工程变更与 BOM 替代三组链路共十一个节点', () => {
  render(<FlowChainView template={DEV_TEMPLATE} t={t} />)
  for (const title of ['研发需求', '技术需求与指标', '设计评审', '产品 BOM', '工艺路线', '测试验证',
    '工程变更', '变更影响评审', '变更实施验证', 'BOM 行替代料', 'BOM 生效性']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['工程变更', 'BOM 替代与生效']) {
    // 「工程变更」行标题与节点标题同名，至少出现一次即可。
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  }
  expect(screen.getByText('研发业务链路')).toBeDefined()
  expect(screen.getByText('11 个流程节点')).toBeDefined()
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(0)
})

it('供应商模板渲染主链路、基础档案与计量质量三组链路共九个节点', () => {
  render(<FlowChainView template={SUPPLIER_TEMPLATE} t={t} />)
  for (const title of ['供应商档案', '供应商准入', '供应商供货物料', '供应商绩效', '客户', '物料管理',
    '计量单位', '单位换算', '缺陷代码']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['独立基础档案', '计量与质量基础']) {
    expect(screen.getByText(label)).toBeDefined()
  }
  expect(screen.getByText('供应商与主数据管理')).toBeDefined()
  expect(screen.getByText('9 个流程节点')).toBeDefined()
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(0)
})

it('人力资源模板渲染生命周期五组链路共十八个可见节点', () => {
  render(<FlowChainView template={HR_TEMPLATE} t={t} />)
  for (const title of ['候选人', '录用单', '入职任务', '员工生命周期', '劳动合同', '试用评估',
    '绩效周期', '月度目标', '考核任务', '绩效评分', '评分维度', '绩效结果', '改进计划', '改进任务',
    '扣回与补发', '工资批次', '员工工资明细', '工资科目']) {
    expect(screen.getAllByText(title).length).toBeGreaterThan(0)
  }
  for (const label of ['月度绩效准备', '绩效评分与确认', '绩效改进与补发', '薪酬管理']) {
    expect(screen.getByText(label)).toBeDefined()
  }
  expect(screen.getByText('员工全生命周期')).toBeDefined()
  expect(screen.getByText('18 个流程节点')).toBeDefined()
  expect(document.querySelectorAll('[data-branch="true"]').length).toBe(0)
})

it('项目下拉加载后台项目名称，失败时降级为占位', async () => {
  // 项目接口通过宿主令牌访问；无令牌时请求直接 401，需先注入测试令牌。
  localStorage.setItem('workbench-client-token', 'test-token')
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ data: {
    items: [
      { id: 1, code: 'SD261101-001', name: '厂房钢结构项目' },
      { id: 2, code: 'SD261124-002', name: '生产线改造项目' },
    ],
    total: 2,
    page: 1,
    page_size: 20,
  } })))
  const { container } = render(<ProcurementChain t={t} />)
  await vi.waitFor(() => {
    const select = container.querySelector('select')
    expect(select).not.toBeNull()
    expect(select?.textContent).toContain('厂房钢结构项目')
    expect(select?.textContent).toContain('生产线改造项目')
  })
  cleanup()
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({}, { status: 500 })))
  const failed = render(<ProcurementChain t={t} />)
  await vi.waitFor(() => {
    expect(failed.container.textContent).toContain('— — —')
  })
})

it('主链路卡片可键盘聚焦，分支卡片带橙色标记', () => {
  const { container } = render(<ProcurementChain t={t} />)
  const cards = container.querySelectorAll('[class*="card_"][tabindex="0"]')
  expect(cards.length).toBe(8)
  const branchCards = container.querySelectorAll('[data-branch="true"]')
  expect(branchCards.length).toBe(2)
  for (const card of cards) expect(card.getAttribute('tabindex')).toBe('0')
})
