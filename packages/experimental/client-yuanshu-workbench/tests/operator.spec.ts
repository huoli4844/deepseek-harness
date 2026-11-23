/** 运营者工作台纯数据层与视图模型层的单元测试。 */
import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECTIONS, parseHomePayload, type RawProjections } from '../src/client/operator/source.ts'
import { buildOperatorViewModel, filterDecisionQueue, metricKeysForPanel, selectDecisionItem, selectProjectCard } from '../src/client/operator/viewmodel.ts'
import { PLACEHOLDER } from '../src/client/operator/constants.ts'
import type { Field } from '../src/client/operator/model.ts'

function makeProjection(overrides: Partial<RawProjections> = {}): RawProjections {
  return { ...EMPTY_PROJECTIONS, ...overrides }
}

/** 收集视图模型中的全部展示字段（不含工时区——它已是演示字符串）。 */
function allFields(vm: ReturnType<typeof buildOperatorViewModel>): Field<string>[] {
  const fields: Field<string>[] = []
  const push = (field: Field<string>) => { fields.push(field) }
  for (const kpi of vm.overview.kpis) {
    push(kpi.value)
    if (kpi.target !== undefined) push(kpi.target)
  }
  for (const item of vm.decisions.queue) { push(item.title); push(item.meta) }
  for (const card of vm.projects.cards) {
    push(card.name); push(card.stage); push(card.progress); push(card.risk)
  }
  for (const panel of vm.projects.detail?.panels ?? []) {
    for (const metric of panel.metrics) push(metric)
  }
  for (const ledger of vm.functional.ledgers) {
    for (const row of ledger.rows) for (const cell of row) push(cell)
  }
  for (const node of vm.evidence.chain) push(node.field)
  return fields
}

describe('operator view model — 演示数据兜底与真实值优先', () => {
  it('空投影时所有字段回退到演示快照，界面不出现空洞', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    for (const field of allFields(vm)) {
      expect(field.value, `field from ${field.source}`).not.toBeUndefined()
      expect(field.value?.trim()).not.toBe('')
    }
  })

  it('公司级 KPI 卡片按四个分组展示，带演示值、目标值与完成率', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    expect(vm.overview.kpis).toHaveLength(10)
    // 分组：经营数据（钱）5 张、人力资源（人）2 张、项目任务 1 张、质量总览 2 张。
    const countGroup = (group: string) => vm.overview.kpis.filter(kpi => kpi.group === group).length
    expect(countGroup('finance')).toBe(5)
    expect(countGroup('people')).toBe(2)
    expect(countGroup('task')).toBe(1)
    expect(countGroup('quality')).toBe(2)
    for (const kpi of vm.overview.kpis) {
      expect(kpi.value.tier).toBe('demo')
      expect(kpi.value.value).not.toBeUndefined()
      // 默认档位（当月）所有 KPI 都有目标与完成率。
      expect(kpi.target?.value).not.toBeUndefined()
      expect(kpi.attainment).toMatch(/%$/u)
    }
    // 人员总工时是唯一可点击打开详情弹窗的 KPI。
    expect(vm.overview.kpis.filter(kpi => kpi.interactive)).toEqual([
      expect.objectContaining({ id: 'labor-total' }),
    ])
  })

  it('完成率按当前值 / 目标值计算，并给出颜色档位', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    const kpiOf = (id: string) => vm.overview.kpis.find(kpi => kpi.id === id)
    // 合同总额月度 405 / 500 = 81%，落后（红）。
    expect(kpiOf('contract-total')?.attainment).toBe('81%')
    expect(kpiOf('contract-total')?.attainmentTone).toBe('risk')
    // 任务按期完成率 92.4 / 95 = 97.3%，接近达标（琥珀）。
    expect(kpiOf('task-on-time')?.attainment).toBe('97.3%')
    expect(kpiOf('task-on-time')?.attainmentTone).toBe('warn')
    // 人员总工时 2,382.2 / 2,166.7 ≈ 109.9%，达标（绿）。
    expect(kpiOf('labor-total')?.attainment).toBe('109.9%')
    expect(kpiOf('labor-total')?.attainmentTone).toBe('ok')
    // 本年（全年预测口径）：5,600 / 6,000 = 93.3%。
    const year = buildOperatorViewModel(EMPTY_PROJECTIONS, 'year')
    expect(year.overview.kpis.find(kpi => kpi.id === 'contract-total')?.attainment).toBe('93.3%')
  })

  it('总览档位展示历史累计，不显示目标与完成率', () => {
    // 当前进展：年初至今累计，仍对照全年目标计算完成率。
    const progress = buildOperatorViewModel(EMPTY_PROJECTIONS, 'progress')
    const progressContract = progress.overview.kpis.find(kpi => kpi.id === 'contract-total')
    expect(progressContract?.target?.value).toBe('¥ 6,000 万')
    expect(progressContract?.attainment).toBe('81%')
    // 总览：历史累计值，无目标与完成率。
    const all = buildOperatorViewModel(EMPTY_PROJECTIONS, 'all')
    for (const kpi of all.overview.kpis) {
      expect(kpi.target).toBeUndefined()
      expect(kpi.attainment).toBeUndefined()
      expect(kpi.attainmentTone).toBeUndefined()
    }
    expect(all.overview.kpis.find(kpi => kpi.id === 'contract-total')?.value.value).toBe('¥ 12,400 万')
  })

  it('真实 briefing 计数进入异常事件行（A 档 ready）', () => {
    const vm = buildOperatorViewModel(makeProjection({
      briefing: [
        { title: '逾期决策', detail: '3 · 影响交付' },
        { title: '检验积压', detail: '7 · 待复检' },
      ],
    }))
    // 风险与决策中心的筛选档位：全部 / 风险事件 / 异常事件 / 决策。
    expect(vm.decisions.filters.map(f => f.id)).toEqual(['all', 'risk', 'anomaly', 'decision'])
    // 检验积压的真实计数（7）覆盖演示值（5）进入异常事件行标题。
    const inspection = vm.decisions.queue.find(item => item.id === 'queue-inspection-backlog')
    expect(inspection?.title.value).toContain('7')
    expect(inspection?.title.tier).toBe('ready')
    // 没有真实计数的异常行仍用演示值兜底。
    const delayed = vm.decisions.queue.find(item => item.id === 'queue-delayed-purchase')
    expect(delayed?.title.tier).toBe('demo')
  })

  it('真实决策标题进入决策中心队列，meta 为演示值兜底', () => {
    const vm = buildOperatorViewModel(makeProjection({
      decisions: [{ title: 'Approve PO-1024', detail: 'over budget' }],
    }))
    const row = vm.decisions.queue.find(item => item.title.value === 'Approve PO-1024')
    expect(row).toBeDefined()
    expect(row?.title.tier).toBe('ready')
    expect(row?.meta.tier).toBe('ready')
  })

  it('真实项目名保留，进度等指标用演示值兜底', () => {
    const vm = buildOperatorViewModel(makeProjection({
      projects: [{ title: 'Project Alpha', detail: '' }],
    }))
    expect(vm.projects.cards[0]?.name.value).toBe('Project Alpha')
    expect(vm.projects.cards[0]?.name.tier).toBe('ready')
    expect(vm.projects.cards[0]?.progress.tier).toBe('demo')
  })

  it('选中队列项并派生其详情（事件要素 + 影响域分析）', () => {
    const vm = buildOperatorViewModel(makeProjection({
      briefing: [
        { title: '逾期决策', detail: '3 · 影响交付' },
        { title: '检验积压', detail: '7 · 待复检' },
      ],
    }))
    const base = vm.decisions
    const target = base.queue.find(item => item.id === 'queue-inspection-backlog')
    expect(target).toBeDefined()
    const selected = selectDecisionItem(base, target?.id)
    expect(selected.selected?.id).toBe('queue-inspection-backlog')
    // 异常事件详情：已发生时间 / 建议处理人 / 建议闭环时间 + 影响域分析（财务 / 人员 / 交付）。
    expect(selected.detail?.facts.map(f => f.label)).toEqual(['已发生时间', '建议处理人', '建议闭环时间'])
    expect(selected.detail?.impacts.map(i => i.dimension)).toEqual(['财务', '人员', '交付'])
    // 风险事件详情使用「预计发生时间」。
    const risk = selectDecisionItem(base, 'queue-risk-0')
    expect(risk.detail?.facts[0]?.label).toBe('预计发生时间')
    // 未显式选择时，沿用默认的（第一项）详情。
    expect(selectDecisionItem(base, undefined)).toBe(base)
  })

  it('选中项目卡片并派生其 360 详情', () => {
    const vm = buildOperatorViewModel(makeProjection({
      projects: [{ title: 'Project Alpha', detail: '' }, { title: 'Project Beta', detail: '' }],
    }))
    const beta = vm.projects.cards.find(card => card.name.value === 'Project Beta')
    expect(beta).toBeDefined()
    const selected = selectProjectCard(vm.projects, beta?.id)
    expect(selected.detail?.projectName.value).toBe('Project Beta')
    // 未显式选择时，沿用默认的详情。
    expect(selectProjectCard(vm.projects, undefined)).toBe(vm.projects)
  })

  it('KPI 与工时随时间范围档位变化，目标值按全年目标平均分配', () => {
    const progress = buildOperatorViewModel(EMPTY_PROJECTIONS, 'progress')
    const month = buildOperatorViewModel(EMPTY_PROJECTIONS, 'month')
    const quarter = buildOperatorViewModel(EMPTY_PROJECTIONS, 'quarter')
    const year = buildOperatorViewModel(EMPTY_PROJECTIONS, 'year')
    const all = buildOperatorViewModel(EMPTY_PROJECTIONS, 'all')

    const kpiOf = (vm: ReturnType<typeof buildOperatorViewModel>, id: string) =>
      vm.overview.kpis.find(kpi => kpi.id === id)

    // 合同总额随周期切换：当前进展（年初至今）¥ 4,860 万，当月 ¥ 405 万，本年 ¥ 5,600 万。
    expect(kpiOf(progress, 'contract-total')?.value.value).toBe('¥ 4,860 万')
    expect(kpiOf(month, 'contract-total')?.value.value).toBe('¥ 405 万')
    expect(kpiOf(year, 'contract-total')?.value.value).toBe('¥ 5,600 万')
    // 目标值按全年目标 ¥ 6,000 万平均分配：当月 ¥ 500 万，本季度 ¥ 1,500 万。
    expect(kpiOf(month, 'contract-total')?.target?.value).toBe('¥ 500 万')
    expect(kpiOf(quarter, 'contract-total')?.target?.value).toBe('¥ 1,500 万')
    expect(kpiOf(year, 'contract-total')?.target?.value).toBe('¥ 6,000 万')
    // 总览档无目标。
    expect(kpiOf(all, 'contract-total')?.target).toBeUndefined()

    // 人员总工时 KPI 可点击打开详情弹窗。
    expect(kpiOf(progress, 'labor-total')?.value.value).toBe('28,808 小时')
    expect(kpiOf(month, 'labor-total')?.value.value).toBe('2,382.2 小时')
    expect(kpiOf(year, 'labor-total')?.value.value).toBe('30,500 小时')
    expect(kpiOf(all, 'labor-total')?.value.value).toBe('61,200 小时')
    expect(kpiOf(month, 'labor-total')?.interactive).toBe(true)

    // 弹窗行只保留项目维度（人员级明细不上总览图）。
    expect(month.overview.laborHours.projectRows).toHaveLength(3)
    const projectRow = month.overview.laborHours.projectRows[0]
    expect(projectRow?.inputHours).toBe('1075')
    expect(projectRow?.leaveHours).toBe('51.6')
    expect(projectRow?.netHours).toBe('1023.4')
  })

  it('每个项目的穿透面板数据不同，且覆盖六个维度', () => {
    const vm = buildOperatorViewModel(makeProjection({
      projects: [
        { title: 'Project Alpha', detail: '' },
        { title: 'Project Beta', detail: '' },
      ],
    }))
    const panelsOf = (name: string) => {
      const card = vm.projects.cards.find(item => item.name.value === name)
      const selected = selectProjectCard(vm.projects, card?.id)
      return selected.detail?.panels ?? []
    }
    // 六个维度：财务 / 项目阶段 / 质量目标 / 风险事件 / 重大决策 / 当前运行状态。
    expect(vm.projects.detail?.panels.map(panel => panel.id)).toEqual([
      'finance', 'stage', 'quality-targets', 'risks', 'major-decisions', 'run-status',
    ])
    // 切换项目后穿透信息跟随变化。
    const alphaFinance = panelsOf('Project Alpha').find(panel => panel.id === 'finance')
    const betaFinance = panelsOf('Project Beta').find(panel => panel.id === 'finance')
    expect(alphaFinance?.metrics[0]?.value).toBe('¥ 1,860 万')
    expect(betaFinance?.metrics[0]?.value).toBe('¥ 920 万')
    const betaStage = panelsOf('Project Beta').find(panel => panel.id === 'stage')
    expect(betaStage?.metrics[0]?.value).toBe('采购阶段')
  })

  it('风险与决策 tab：按类别过滤队列并回落到第一项', () => {
    const vm = buildOperatorViewModel(makeProjection({
      decisions: [{ title: 'Approve PO-1024', detail: 'over budget' }],
    }))
    const filtered = filterDecisionQueue(vm.decisions, 'anomaly')
    expect(filtered.queue.every(item => item.kind === 'anomaly')).toBe(true)
    expect(filtered.queue.length).toBeGreaterThan(0)
    expect(filtered.selected?.kind).toBe('anomaly')
    // 决策档只包含决策事项（含真实决策标题）。
    const decisionOnly = filterDecisionQueue(vm.decisions, 'decision')
    expect(decisionOnly.queue.length).toBeGreaterThan(0)
    expect(decisionOnly.queue.every(item => item.kind === 'decision')).toBe(true)
    expect(decisionOnly.queue.some(item => item.title.value === 'Approve PO-1024')).toBe(true)
    // 风险档只包含风险事件。
    const riskOnly = filterDecisionQueue(vm.decisions, 'risk')
    expect(riskOnly.queue.every(item => item.kind === 'risk')).toBe(true)
    // 全部档不过滤。
    expect(filterDecisionQueue(vm.decisions, 'all').queue).toHaveLength(vm.decisions.queue.length)
  })

  it('exposes metric locale keys aligned with each panel metric', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    const projects = buildOperatorViewModel(makeProjection({ projects: [{ title: 'P', detail: '' }] }))
    for (const panel of projects.projects.detail?.panels ?? []) {
      expect(metricKeysForPanel(panel.id)).toHaveLength(panel.metrics.length)
    }
    expect(vm.overview.kpis.length).toBe(10)
  })
})

describe('operator source — response parsing', () => {
  it('validates rows and items, ignoring malformed entries', () => {
    const parsed = parseHomePayload({
      name: 'Workbench',
      rows: [
        { title: '逾期决策', detail: '3 · 影响交付' },
        { detail: 'no title' },
        { title: 42, detail: 'bad' },
      ],
      items: [
        { kind: 'risk', id: 1, title: 'Risk A', handler_name: 'ignored extra' },
        { kind: 'task', id: 2, title: 'Task B', code: 'T-2' },
        { kind: 'unknown', id: 3, title: 'Skip' },
      ],
    })
    expect(parsed?.name).toBe('Workbench')
    expect(parsed?.rows).toHaveLength(1)
    expect(parsed?.items).toHaveLength(2)
    expect(parsed?.items[1]?.code).toBe('T-2')
  })

  it('rejects non-object bodies', () => {
    expect(parseHomePayload(null)).toBeUndefined()
    expect(parseHomePayload('string')).toBeUndefined()
    expect(parseHomePayload([1, 2])).toBeUndefined()
  })

  it('exposes a single placeholder glyph', () => {
    expect(PLACEHOLDER).toBe('— — —')
  })
})
