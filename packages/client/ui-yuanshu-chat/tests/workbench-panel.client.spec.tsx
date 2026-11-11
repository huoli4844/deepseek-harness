// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  YuanShuSseEvent,
  YuanShuWorkbenchHome,
  YuanShuWorkbenchProfile,
} from '@deepseek-ai/dsh-yuanshu-client'
import { WorkbenchPanel, type YuanShuWorkbenchInjected } from '../src/client/WorkbenchPanel.tsx'
import { zh, type YuanShuChatKey } from '../src/client/locales.ts'
import { WorkbenchRequestError, type CapabilityOption } from '../src/client/workbench.ts'

type PanelProps = Parameters<typeof WorkbenchPanel>[0]

function translate(key: YuanShuChatKey, params?: Record<string, unknown>): string {
  const template = zh[key] as string
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name] ?? ''))
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
    pending_gates: 1,
    milestones_due_30d: 2,
  },
  sections: ['metrics', 'risks', 'gates', 'milestones', 'tasks', 'scenes'],
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
  return { t: translate, ...baseInjected, ...overrides } as unknown as PanelProps
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

    // 指标与区块由 home 驱动。
    expect(screen.getByText('项目总数')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByText('供应商延期')).toBeTruthy()
    expect(screen.getByText('提交方案')).toBeTruthy()
    expect(screen.getByText('逾期')).toBeTruthy()
    expect(screen.getByText('方案评审')).toBeTruthy()
    expect(screen.getByText('样机验收')).toBeTruthy()
    expect(screen.getByText('项目清单')).toBeTruthy()
  })

  it('follows the server-declared section order', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchHome: async () => ({ ...workbenchHome, sections: ['metrics', 'tasks'] }),
    })} />)

    expect(await screen.findByText('任务待办')).toBeTruthy()
    expect(screen.queryByText('风险关注')).toBeNull()
    expect(screen.queryByText('门径评审')).toBeNull()
  })

  it('falls back to the generic workbench when the profile is unavailable', async () => {
    render(<WorkbenchPanel {...props({
      getWorkbenchProfile: async () => { throw new WorkbenchRequestError('unavailable', 503) },
    })} />)

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
    expect((screen.getByRole('combobox', { name: '当前租户' }) as HTMLSelectElement).value).toBe('3')
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
