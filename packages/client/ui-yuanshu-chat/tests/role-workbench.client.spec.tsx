// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { ResourceRegistry } from '@deepseek-ai/dsh-client-resources/src/client/resources.ts'
import { keyedObservableHook } from '@deepseek-ai/dsh-client-ui-renderer/src/client/bindings.tsx'
import { RoleWorkbench } from '../src/client/RoleWorkbench.tsx'
import { zh, type YuanShuChatKey } from '../src/client/locales.ts'
import type { EnterpriseResourceValue } from '../src/client/enterprise-resource.ts'
import { enterpriseResourceProvider } from '../src/client/enterprise-resource.ts'

type Props = Parameters<typeof RoleWorkbench>[0]
const tools = ['workbench_home', 'workbench_profile', 'workbench_position', 'workbench_briefing', 'workbench_decisions', 'workbench_navigator', 'workbench_records']
function fixture(role: string, headline: string, label: string, subject: string) {
  const reads: string[] = []
  const call = vi.fn<Props['call']>()
  const values: Record<string, unknown> = {
    workbench_profile: { nickname: '测试员工', active_roles: [{ code: role, name: role }] },
    workbench_position: { title: role, headline, scope: { description: '本人可见数据' } },
    workbench_briefing: { kpis: [{ key: 'attention', label, value: 3 }], today: [{ id: 'due-1', title: subject, meta: '本周到期', domain: 'tasks', record_id: 7, record_code: 'TASK-7' }], exceptions: [] },
    workbench_home: { data_scope: { description: '本人可见数据' }, projects: [], scenes: [{ code: 'unavailable', title: '未开放场景', description: '尚未开放', available: false }] },
    workbench_decisions: { items: [] },
    workbench_navigator: { groups: [{ code: 'work', title: '业务事项', items: [{ code: 'tasks', title: '任务', count: 23 }] }] },
    workbench_records: { items: [{ id: 7, title: subject, code: 'TASK-7', owner_name: '测试员工', fields: [{ label: '业务说明', value: '平台提供的详情' }] }], total: 23 },
  }
  const props: Props = { call, authorize: vi.fn(async () => ({})), revoke: vi.fn(async () => ({})), t: key => zh[key as YuanShuChatKey],
    useResource: ((address: string) => {
      reads.push(address)
      const url = address ? new URL(address) : undefined
      const name = url?.searchParams.get('tool') ?? ''
      const value: EnterpriseResourceValue = url?.pathname === '/catalog'
        ? { kind: 'catalog', page: { application: { name: '测试企业', code: 'test' }, sections: [] }, tools: tools.map(name => ({ name, inputSchema: {} })) }
        : url?.pathname === '/identity' ? { kind: 'identity', tenants: [{ id: 3, code: 'test', name: '测试企业' }] }
          : { kind: 'result', result: { structuredContent: { outcome: 'returned', data: values[name] } } }
      return { status: 'live', value, failure: undefined }
    }) as Props['useResource'] }
  return { props, reads, values, call }
}
beforeEach(() => { localStorage.clear(); localStorage.setItem('yuanshu-token', `e30.${btoa(JSON.stringify({ user_id: 1 }))}.sig`); localStorage.setItem('yuanshu-active-tenant', '3') })
afterEach(cleanup)
describe('employee workbench', () => {
  it('subscribes to business resources after asynchronous catalog discovery and refreshes them', async () => {
    const ctx = new Context()
    const registry = new ResourceRegistry(ctx)
    const read = vi.fn(async (path: string): Promise<unknown> => {
      if (path === '/tenants') return [{ id: 3, code: 'test', name: '测试企业' }]
      if (path === '/mcp/tools') return tools.map(name => ({ name, inputSchema: {} }))
      if (path === '/mcp/workbench') return { application: { code: 'test', name: '测试企业' }, sections: [] }
      const name = new URL(path, 'http://localhost').searchParams.get('name')
      return { structuredContent: { data: name === 'workbench_position' ? { title: '采购', headline: '哪些订单会延期？' } : {} } }
    })
    const dispose = registry.register(enterpriseResourceProvider(read))
    const { props } = fixture('采购', '', '', '')
    const view = render(<RoleWorkbench {...props} useResource={keyedObservableHook(address => registry.source(address)) as Props['useResource']} />)
    try {
      await screen.findByRole('heading', { level: 1, name: '采购' })
      expect(read.mock.calls.filter(([path]) => path.startsWith('/mcp/read'))).toHaveLength(6)
      fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
      await waitFor(() => { expect(read.mock.calls.filter(([path]) => path.startsWith('/mcp/read'))).toHaveLength(12) })
      await screen.findByRole('heading', { level: 1, name: '采购' })
    } finally { view.unmount(); dispose() }
  })
  it.each([
    ['管理层', '哪些经营异常需要处理？', '待决策事项', '审阅经营异常'],
    ['财务', '哪些付款需要处理？', '待审核付款', '核对供应商付款'],
    ['采购', '哪些订单会延期？', '延期订单', '跟催采购订单'],
    ['项目经理', '哪些事项影响交付？', '逾期任务', '检查交付里程碑'],
  ])('opens the platform-projected %s work without a tool selector', (role, headline, metric, subject) => {
    const { props, reads, call } = fixture(role, headline, metric, subject)
    const view = render(<RoleWorkbench {...props} />)
    expect(screen.getByRole('heading', { level: 1, name: role })).toBeTruthy()
    expect(screen.getByText(headline)).toBeTruthy()
    expect(screen.getByText(metric)).toBeTruthy()
    expect(screen.getByText(subject)).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: zh.selectCapability })).toBeNull()
    expect(screen.queryByRole('textbox', { name: zh.jsonInputHint })).toBeNull()
    expect(reads.some(address => address.includes('workbench_briefing'))).toBe(true)
    expect(call).not.toHaveBeenCalled()
    expect(view.container.textContent).toMatchSnapshot()
  })
  it('opens the originating business record and preserves the platform detail labels', () => {
    const { props, reads, call } = fixture('采购', '哪些订单会延期？', '延期订单', '跟催采购订单')
    render(<RoleWorkbench {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.cockpitView }))
    expect(screen.getByText('业务说明')).toBeTruthy()
    expect(screen.getByText('平台提供的详情')).toBeTruthy()
    const query = reads.filter(address => address.includes('workbench_records')).at(-1)
    expect(JSON.parse(new URL(query!).searchParams.get('args')!)).toEqual({ domain: 'tasks', page: 1, page_size: 20, keyword: 'TASK-7' })
    expect(call).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh.nextPage }))
    const next = reads.filter(address => address.includes('workbench_records')).at(-1)
    expect(JSON.parse(new URL(next!).searchParams.get('args')!)).toMatchObject({ page: 2 })
  })
  it('labels unavailable business scenes without presenting execution controls', () => {
    const { props } = fixture('财务', '哪些付款需要处理？', '待审核付款', '付款事项')
    render(<RoleWorkbench {...props} />)
    expect(screen.getByRole('heading', { name: zh.unavailableWorkflows })).toBeTruthy()
    expect(screen.getByText('未开放场景')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '未开放场景' })).toBeNull()
  })
})
