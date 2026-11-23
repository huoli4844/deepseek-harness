/** 运营者工作台纯数据层与视图模型层的单元测试。 */
import { describe, expect, it } from 'vitest'
import { EMPTY_PROJECTIONS, parseHomePayload, type RawProjections } from '../src/client/operator/source.ts'
import { buildOperatorViewModel, metricKeysForPanel, selectDecisionItem, selectProjectCard } from '../src/client/operator/viewmodel.ts'
import { PLACEHOLDER } from '../src/client/operator/constants.ts'
import type { Field } from '../src/client/operator/model.ts'

function makeProjection(overrides: Partial<RawProjections> = {}): RawProjections {
  return { ...EMPTY_PROJECTIONS, ...overrides }
}

function allFields(vm: ReturnType<typeof buildOperatorViewModel>): Field<string>[] {
  const fields: Field<string>[] = []
  const push = (field: Field<string>) => { fields.push(field) }
  for (const kpi of vm.overview.kpis) push(kpi.value)
  for (const anomaly of vm.overview.anomalies) push(anomaly.count)
  for (const decision of vm.overview.decisions) {
    push(decision.title); push(decision.impact); push(decision.suggestion)
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

describe('operator view model — placeholder rules', () => {
  it('never fabricates values for an empty projection', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    for (const field of allFields(vm)) {
      expect(field.value, `field from ${field.source}`).toBeUndefined()
    }
  })

  it('marks all four company KPIs as not-connected (C tier)', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    expect(vm.overview.kpis).toHaveLength(4)
    for (const kpi of vm.overview.kpis) expect(kpi.value.tier).toBe('not-connected')
  })

  it('marks project 360 panels as schema-pending (B tier)', () => {
    const vm = buildOperatorViewModel(makeProjection({
      projects: [{ title: 'Project Alpha', detail: '' }],
    }))
    expect(vm.projects.detail).toBeDefined()
    for (const panel of vm.projects.detail?.panels ?? []) {
      expect(panel.metrics.length).toBeGreaterThan(0)
      for (const metric of panel.metrics) expect(metric.tier).toBe('schema-pending')
    }
  })

  it('surfaces real briefing counts as ready (A tier)', () => {
    const vm = buildOperatorViewModel(makeProjection({
      briefing: [
        { title: '逾期决策', detail: '3 · 影响交付' },
        { title: '检验积压', detail: '7 · 待复检' },
      ],
    }))
    const overdue = vm.overview.anomalies.find(a => a.nameKey === 'operator.anomaly.overdueDecision')
    expect(overdue?.count.value).toBe('3')
    expect(overdue?.count.tier).toBe('ready')
    const inspection = vm.overview.anomalies.find(a => a.nameKey === 'operator.anomaly.inspectionBacklog')
    expect(inspection?.count.value).toBe('7')
    const delayed = vm.overview.anomalies.find(a => a.nameKey === 'operator.anomaly.delayedPurchase')
    expect(delayed?.count.value).toBeUndefined()
    expect(delayed?.count.tier).toBe('ready')
  })

  it('surfaces decision titles as ready and synthesis fields as not-connected', () => {
    const vm = buildOperatorViewModel(makeProjection({
      decisions: [{ title: 'Approve PO-1024', detail: 'over budget' }],
    }))
    expect(vm.overview.decisions[0]?.title.value).toBe('Approve PO-1024')
    expect(vm.overview.decisions[0]?.title.tier).toBe('ready')
    expect(vm.overview.decisions[0]?.impact.tier).toBe('not-connected')
  })

  it('maps real project names but leaves progress as schema-pending', () => {
    const vm = buildOperatorViewModel(makeProjection({
      projects: [{ title: 'Project Alpha', detail: '' }],
    }))
    expect(vm.projects.cards[0]?.name.value).toBe('Project Alpha')
    expect(vm.projects.cards[0]?.progress.tier).toBe('schema-pending')
  })

  it('selects a specific queue item and derives its detail', () => {
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
    expect(selected.detail?.facts[0]?.value).toContain('检验积压')
    // 未显式选择时，沿用默认的（第一项）详情。
    expect(selectDecisionItem(base, undefined)).toBe(base)
  })

  it('selects a specific project and derives its 360 detail', () => {
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

  it('exposes metric locale keys aligned with each panel metric', () => {
    const vm = buildOperatorViewModel(EMPTY_PROJECTIONS)
    const projects = buildOperatorViewModel(makeProjection({ projects: [{ title: 'P', detail: '' }] }))
    for (const panel of projects.projects.detail?.panels ?? []) {
      expect(metricKeysForPanel(panel.id)).toHaveLength(panel.metrics.length)
    }
    expect(vm.overview.kpis.length).toBe(4)
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
