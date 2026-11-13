// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  YuanShuDecisionQueue,
  YuanShuPositionCatalog,
  YuanShuSseEvent,
  YuanShuWorkbenchBriefing,
  YuanShuWorkbenchHome,
  YuanShuWorkbenchPosition,
  YuanShuWorkbenchProfile,
} from '@deepseek-ai/dsh-yuanshu-client'
import { WorkbenchPanel, type YuanShuWorkbenchInjected } from '../src/client/WorkbenchPanel.tsx'
import { zh, type YuanShuChatKey } from '../src/client/locales.ts'
import { WorkbenchRequestError, type CapabilityOption } from '../src/client/workbench.ts'

type PanelProps = Parameters<typeof WorkbenchPanel>[0]

function translate(key: string, params?: Record<string, unknown>): string {
  const template = zh[key as YuanShuChatKey] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => typeof params[name] === 'string' ? params[name] : JSON.stringify(params[name] ?? ''))
}

function streamOf(events: readonly YuanShuSseEvent[]): AsyncIterable<YuanShuSseEvent> {
  return (async function* generate() {
    for (const event of events) yield event
  })()
}

const capabilities: readonly CapabilityOption[] = [
  { kind: 'skill', id: 's1', name: '报表技能', description: '生成月报' },
  { kind: 'algorithm', id: 'a1', name: '评分算法' },
  { kind: 'dag', id: 'd1', name: '审批流程' },
]

const workbenchProfile: YuanShuWorkbenchProfile = {
  profile_id: 'profile-1',
  profile_version: 1,
  generated_at: '2026-11-11T08:00:00Z',
  expires_at: '2026-11-11T09:00:00Z',
  tenant_id: '3',
  tenant_code: 'shaoshi',
  tenant_name: '少仕科技',
  user_id: 1,
  username: 'admin',
  nickname: '超级管理员',
  department: { id: 2, code: 'ops', name: '平台运营部' },
  active_roles: [{ code: 'platform_super_admin', name: '平台超级管理员' }],
  workbench: { code: 'tenant-admin', name: '租户管理工作台' },
  plugin_contributions: [],
  visible_capabilities: ['project.read'],
  focus_scope: { scope_ref: 'tenant', scope_type: 'tenant', project_codes: [], project_count: 4 },
  data_scope: { scope_type: 'tenant', description: '本租户全部项目' },
  slots: [],
}

const workbenchHome: YuanShuWorkbenchHome = {
  generated_at: '2026-11-11T08:00:00Z',
  tenant: { id: '3', code: 'shaoshi', name: '少仕科技' },
  workbench: { code: 'tenant-admin', name: '租户管理工作台' },
  data_scope: { scope_type: 'tenant', description: '本租户全部项目' },
  metrics: {
    project_total: 4,
    active_projects: 2,
    open_risks: 3,
    high_risks: 1,
    open_tasks: 5,
    overdue_tasks: 2,
    my_open_tasks: 1,
    my_overdue_tasks: 1,
    pending_gates: 1,
    milestones_due_30d: 2,
  },
  my_task_stats: {
    total: 8,
    pending: 3,
    in_progress: 2,
    overdue: 2,
    completed: 1,
    cancelled: 0,
  },
  sections: ['metrics', 'risks', 'gates', 'milestones', 'tasks', 'scenes'],
  projects: [{
    id: 9,
    code: 'P-1',
    name: '矿业项目',
    stage: 'plan',
    status: 'active',
    priority: 'high',
    risk_level: 'medium',
    progress_percent: 45,
    manager_user_id: 7,
    manager_name: '王五',
    end_date: '2026-12-31',
    open_tasks: 3,
    open_risks: 1,
  }],
  my_tasks: [{
    id: 2,
    project_code: 'P-1',
    project_name: '矿业项目',
    code: 'T-01',
    name: '提交方案',
    priority: 'high',
    status: 'in_progress',
    plan_end: '2026-11-20T00:00:00Z',
    owner_name: '李四',
    overdue: true,
  }],
  risks: [{
    id: 1,
    project_code: 'P-1',
    project_name: '矿业项目',
    risk_code: 'R-01',
    title: '供应商延期',
    risk_level: 'high',
    status: 'open',
    handler_name: '张三',
    deadline: '2026-12-01T00:00:00Z',
  }],
  tasks: [{
    id: 2,
    project_code: 'P-1',
    project_name: '矿业项目',
    code: 'T-01',
    name: '提交方案',
    priority: 'high',
    status: 'in_progress',
    plan_end: '2026-11-20T00:00:00Z',
    owner_name: '李四',
    overdue: true,
  }],
  gates: [{
    id: 3,
    project_code: 'P-1',
    project_name: '矿业项目',
    gate_code: 'G-01',
    gate_name: '方案评审',
    planned_date: '2026-11-25',
    gate_status: 'pending',
  }],
  milestones: [{
    id: 4,
    project_code: 'P-1',
    project_name: '矿业项目',
    code: 'M-01',
    name: '样机验收',
    plan_date: '2026-11-30',
    status: 'in_progress',
    days_left: 19,
  }],
  scenes: [{
    code: 'project-summary',
    title: '项目清单',
    description: '查看项目进度',
    plugin_id: 'dsh-domain-project',
    contribution_id: 'project-summary',
    entry: '/shaoshi/projects',
    available: true,
  }],
}

const workbenchNavigator = {
  generated_at: '2026-11-12T00:00:00Z',
  workbench: { code: 'project_manager', name: '项目经理' },
  data_scope: { scope_type: 'self', description: '本人负责' },
  groups: [{
    code: 'project',
    title: '项目执行',
    items: [
      { code: 'projects', title: '项目', count: 1 },
      { code: 'tasks', title: '任务', count: 1 },
    ],
  }],
}

const workbenchBriefing: YuanShuWorkbenchBriefing = {
  generated_at: '2026-11-12T09:00:00Z',
  tenant: { id: '3', code: 'shaoshi', name: '少仕科技' },
  workbench: { code: 'project_manager', title: '项目经理' },
  data_scope: { description: '本人负责的项目' },
  greeting: '王五，早上好',
  kpis: [
    { key: 'open_tasks', label: '待办任务', value: 5, tone: 'neutral' },
    { key: 'overdue_tasks', label: '逾期任务', value: 2, tone: 'danger' },
    { key: 'pending_gates', label: '待评审门径', value: 1, tone: 'warning' },
    { key: 'high_risks', label: '高风险', value: 1, tone: 'warning' },
  ],
  today: [{
    id: 'task:2',
    title: '提交方案',
    meta: '矿业项目 · 执行中',
    domain: 'tasks',
    record_id: 2,
    record_code: 'T-01',
    due_date: '2026-11-20',
    overdue: true,
    tone: 'danger',
  }],
  exceptions: [{
    id: 'risk:1',
    title: '供应商延期',
    meta: '矿业项目 · 高风险',
    domain: 'risks',
    record_id: 1,
    record_code: 'R-01',
    due_date: '2026-12-01',
    overdue: false,
    tone: 'warning',
  }],
}

const workbenchDecisionQueue: YuanShuDecisionQueue = {
  generated_at: '2026-11-12T09:00:00Z',
  total: 1,
  items: [{
    id: 'gate:3',
    kind: 'gate',
    title: '方案评审待通过',
    reason: '门径计划日期临近，尚未完成评审',
    recommendation: '组织评审会并给出结论',
    severity: 'high',
    domain: 'gates',
    record_id: 3,
    record_code: 'G-01',
    project_name: '矿业项目',
    deadline: '2026-11-25',
    evidence: [
      { label: '计划日期', value: '2026-11-25' },
      { label: '状态', value: '待评审' },
    ],
    actions: [
      { code: 'pass', label: '通过' },
      { code: 'reject', label: '驳回' },
      { code: 'view', label: '查看' },
    ],
  }],
}

const workbenchPosition: YuanShuWorkbenchPosition = {
  generated_at: '2026-11-12T09:00:00Z',
  position: 'project-execution',
  title: '项目经理',
  headline: '本周哪些事会拖垮交付？',
  scope: { type: 'self', description: '本人负责的项目' },
  kpis: [
    { key: 'decisions', label: '待我决策' },
    { key: 'today', label: '今日到期' },
    { key: 'overdue', label: '逾期任务' },
    { key: 'high_risks', label: '高风险' },
  ],
  decision_kinds: ['gate_review', 'overdue_task'],
  blocks: [
    { type: 'decision-queue', title: '待我决策' },
    { type: 'board', title: '任务看板', source: 'tasks' },
  ],
  agent: {
    code: 'project-execution',
    role: '项目交付 Agent',
    goal: '在节点失守之前发现偏差。',
    rules: ['每条结论必须能追到编号。'],
  },
  workflows: [
    {
      code: 'weekly_report',
      label: '生成项目周报',
      intent: '汇总本周进展、偏差与下周风险。',
      trigger: 'manual',
      inputs: ['workbench.briefing'],
      steps: [{ title: '取本周事实', tools: ['workbench.briefing'], output: '本周清单' }],
      deliverable: '项目周报（Markdown）',
      approval: 'none',
      prompt: '生成本周周报。',
    },
  ],
}

const positionCatalog: YuanShuPositionCatalog = {
  current: 'project-execution',
  options: [
    { code: 'project-execution', title: '项目经理' },
    { code: 'procurement', title: '采购' },
  ],
}

const baseInjected: YuanShuWorkbenchInjected = {
  askQuestionStream: () => streamOf([]),
  listCapabilities: async () => capabilities,
  runSkill: async () => undefined,
  runAlgorithm: async () => undefined,
  invokeDag: async () => undefined,
  listAlgorithmExecutions: async () => undefined,
  listDagHistory: async () => undefined,
  getDagHistoryDetail: async () => undefined,
  getWorkbenchProfile: async () => workbenchProfile,
  getWorkbenchHome: async () => workbenchHome,
  getWorkbenchPosition: async () => workbenchPosition,
  getWorkbenchPositions: async () => positionCatalog,
  getWorkbenchBriefing: async () => workbenchBriefing,
  getWorkbenchDecisionQueue: async () => workbenchDecisionQueue,
  getWorkbenchNavigator: async () => workbenchNavigator,
  listWorkbenchRecords: async domain => ({
    domain,
    items: [{
      id: 1,
      domain,
      code: 'P-1',
      title: '矿业项目',
      subtitle: 'execution',
      status: 'active',
      priority: 'high',
      owner_user_id: 2,
      owner_name: '李四',
      project_code: 'P-1',
      project_name: '矿业项目',
      due_date: '2026-12-31',
      overdue: false,
    }],
    total: 1,
    page: 1,
    page_size: 100,
  }),
  getCurrentUser: async () => ({ id: 1, username: 'admin', nickname: '超级管理员' }),
  listTenants: async () => [{ id: 1, name: '默认租户' }, { id: 3, name: '少仕科技' }],
  listOntologyOverview: async () => ({ spaces: 2, healthy: true }),
  listOntologySpaces: async () => [{ id: 'sp-1', name: '矿业本体' }],
  listOntologyCollections: async () => [],
  listOntologyReleases: async () => [],
  listScenarios: async () => ({ list: [{ id: 'sc-1', name: '日报场景', description: '每日报表' }] }),
  listKnowledgeCollections: async () => [{ id: 'kb-1', name: '制度库' }],
}

function props(overrides: Partial<YuanShuWorkbenchInjected> = {}): PanelProps {
  return { t: translate, ...baseInjected, ...overrides }
}

beforeEach(() => {
  window.localStorage.clear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('yuanshu workbench', () => {
  it('renders the role workbench home with profile and metrics', async () => {
    render(<WorkbenchPanel {...props()} />)

    // 驾驶舱是默认视图；经营看板通过视图开关进入，两者共享同一份 home 投影。
    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))

    // 导航按“工作台 / 知识问答 / 能力库”分组，能力目录收进能力库。
    expect(screen.getByText('知识问答')).toBeTruthy()
    expect(screen.getByText('能力库')).toBeTruthy()
    for (const label of ['工作台', '问答', '知识库', '概览', '本体', 'Skill', '算法', '场景', 'DAG']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'u') })).toBeTruthy()
    }

    // 岗位名称、账号、部门与角色全部来自 profile 投影。
    expect((await screen.findAllByText('租户管理工作台')).length).toBeGreaterThan(0)
    expect(screen.getByText('平台超级管理员')).toBeTruthy()
    expect(screen.getByText(/平台运营部/u)).toBeTruthy()
    expect(screen.getByText(/本租户全部项目/u)).toBeTruthy()

    // 多租户账号必须能看到当前租户选择器，选项来自 /tenants。
    const tenantSelect = screen.getByRole('combobox', { name: '当前租户' })
    expect(tenantSelect).toBeTruthy()
    expect(screen.getAllByText('默认租户').length).toBeGreaterThan(0)

    // 指标与区块由 home 驱动；驾驶舱是默认视图，看板通过视图开关进入。
    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))
    expect(screen.getByText('项目总数')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('供应商延期')).toBeTruthy()
    expect(screen.getByText('提交方案')).toBeTruthy()
    expect(screen.getByText('逾期')).toBeTruthy()
    expect(screen.getByText('方案评审')).toBeTruthy()
    expect(screen.getByText('样机验收')).toBeTruthy()
    expect(screen.getByText('项目清单')).toBeTruthy()
  })

  it('renders the cockpit as the default home with briefing and decision queue', async () => {
    render(<WorkbenchPanel {...props()} />)

    // 驾驶舱顶部的问候与数据范围来自岗位简报。
    expect(await screen.findByText('王五，早上好')).toBeTruthy()
    expect(screen.getByText(/本人负责的项目/u)).toBeTruthy()
    expect(screen.getByText('待办任务')).toBeTruthy()
    expect(screen.getByText('逾期任务')).toBeTruthy()

    // 岗位包决定首屏问题、关注区块与可交给 Agent 的动作。
    expect(screen.getByText('本周哪些事会拖垮交付？')).toBeTruthy()
    expect(screen.getByText(/本岗位关注：待我决策 \/ 任务看板/u)).toBeTruthy()
    expect(screen.getByText('生成项目周报')).toBeTruthy()

    // 待决策队列优先展示最需要拍板的事，并给出建议与证据。
    expect(screen.getByText(/待我决策 · 1/u)).toBeTruthy()
    expect(screen.getByText('方案评审待通过')).toBeTruthy()
    expect(screen.getByText('组织评审会并给出结论')).toBeTruthy()
    expect(screen.getByText('计划日期 2026-11-25')).toBeTruthy()

    // 侧栏展示今日事项与异常。
    expect(screen.getByText(/今日与本周 · 1/u)).toBeTruthy()
    expect(screen.getByText('供应商延期')).toBeTruthy()
  })

  it('follows the server-declared section order', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchHome: async () => ({ ...workbenchHome, sections: ['metrics', 'tasks'] }),
    })} />)

    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))

    expect(await screen.findByText('任务待办')).toBeTruthy()
    expect(screen.queryByText('风险关注')).toBeNull()
    expect(screen.queryByText('门径评审')).toBeNull()
  })

  it('renders the project-execution dashboard from my task stats', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchHome: async () => ({
        ...workbenchHome,
        workbench: { code: 'project-execution', name: '项目执行工作台' },
        data_scope: { scope_type: 'member', description: '本人负责或参与的项目' },
        sections: ['metrics', 'projects', 'my_tasks', 'tasks', 'milestones'],
      }),
    })} />)

    // 深色仪表盘：问候、指标、概览、看板与底部三卡。
    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))
    expect(await screen.findByText('任务概览')).toBeTruthy()
    expect(screen.getByText('近期截止任务')).toBeTruthy()
    expect(screen.getByText('任务看板')).toBeTruthy()
    expect(screen.getByText('我的任务')).toBeTruthy()
    expect(screen.getByText('参与项目')).toBeTruthy()
    expect(screen.getByText('总任务')).toBeTruthy()
    // 我的任务总数为 8，看板状态列来自服务端统计。
    expect(screen.getAllByText('8').length).toBeGreaterThan(0)
    expect(screen.getAllByText('提交方案').length).toBeGreaterThan(0)
    expect(screen.getByText('矿业项目')).toBeTruthy()
    expect(screen.getByText('45%')).toBeTruthy()
    expect(screen.getByText('样机验收')).toBeTruthy()
    // 仪表盘不再渲染旧的通用指标卡。
    expect(screen.queryByText('高风险')).toBeNull()
    expect(screen.queryByText('项目逾期')).toBeNull()
  })

  it('renders the section list when the server sends null collections', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchHome: async () => JSON.parse(JSON.stringify({
        ...workbenchHome,
        sections: ['metrics', 'risks', 'gates', 'milestones', 'tasks', 'scenes'],
        metric_keys: null,
        projects: null,
        my_tasks: null,
        gates: null,
        milestones: null,
        scenes: null,
      })) as YuanShuWorkbenchHome,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))

    // tenant-admin 的 sections 不含 projects/my_tasks，走分区列表分支；
    // 旧实现里 metric_keys 为 null 会在 renderMetrics 抛 TypeError，整块看板白屏。
    expect(await screen.findByText('风险关注')).toBeTruthy()
    expect(screen.getByText('任务待办')).toBeTruthy()
  })

  it('falls back to the generic workbench when the profile is unavailable', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchProfile: async () => { throw new WorkbenchRequestError('unavailable', 503) },
    })} />)

    fireEvent.click(screen.getByRole('button', { name: '经营看板' }))
    expect(await screen.findByText('未能获取岗位投影，已回退到通用工作台')).toBeTruthy()
    // home 仍然可用，指标与场景继续渲染。
    expect(screen.getByText('项目总数')).toBeTruthy()
    expect(screen.getByText('项目清单')).toBeTruthy()
  })

  it('persists the selected tenant and reloads the profile home', async () => {
    const getHome = vi.fn(async () => workbenchHome)
    render(<WorkbenchPanel {...props({ getWorkbenchHome: getHome })} />)

    const select = await screen.findByRole('combobox', { name: '当前租户' }) as HTMLSelectElement
    getHome.mockClear()
    fireEvent.change(select, { target: { value: '3' } })

    expect(window.localStorage.getItem('yuanshu-active-tenant')).toBe('3')
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '当前租户' }).value).toBe('3')
    await waitFor(() => {
      expect(getHome).toHaveBeenCalled()
    })
  })

  it('lists skills and opens the capability runner', async () => {
    render(<WorkbenchPanel {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: /Skill/u }))
    fireEvent.click(await screen.findByRole('button', { name: /报表技能/u }))

    expect(await screen.findByPlaceholderText('输入参数（JSON，可留空）')).toBeTruthy()
    expect(screen.getByRole('button', { name: /返回列表/u })).toBeTruthy()
  })

  it('shows scenarios and knowledge collections from the gateway catalogs', async () => {
    render(<WorkbenchPanel {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: /场景/u }))
    expect(await screen.findByText('日报场景')).toBeTruthy()
    expect(screen.getByText('每日报表')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /知识库/u }))
    expect(await screen.findByText('制度库')).toBeTruthy()
  })

  it('renders the ontology summary and spaces', async () => {
    render(<WorkbenchPanel {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: /本体/u }))
    expect(await screen.findByText('矿业本体')).toBeTruthy()
    expect(screen.getByText('spaces')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('turns a forbidden ontology catalog into an explicit permission state', async () => {
    render(<WorkbenchPanel {...props({
      listOntologyOverview: async () => { throw new WorkbenchRequestError('denied', 403) },
    })} />)

    fireEvent.click(screen.getByRole('button', { name: /本体/u }))
    expect(await screen.findByText('当前账号无本体访问权限')).toBeTruthy()
  })

  it('keeps an invisible catalog distinct from an empty one', async () => {
    render(<WorkbenchPanel {...props({
      listScenarios: async () => { throw new WorkbenchRequestError('missing', 404) },
    })} />)

    fireEvent.click(screen.getByRole('button', { name: /场景/u }))
    expect(await screen.findByText('能力不存在或当前账号不可见')).toBeTruthy()
  })
})
