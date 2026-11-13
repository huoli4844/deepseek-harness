// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EnterpriseWorkbench } from '../src/client/EnterpriseWorkbench.tsx'
import { enterpriseResourceProvider, type EnterpriseResourceValue } from '../src/client/enterprise-resource.ts'
import { zh, type YuanShuChatKey } from '../src/client/locales.ts'
import type { ResourceProtocol } from '@deepseek-ai/dsh-client-resources/client'

type Props = Parameters<typeof EnterpriseWorkbench>[0]
const catalog: EnterpriseResourceValue = { kind: 'catalog', page: { application: { code: 'manufacturing', name: 'Quality fixture' }, sections: [] }, tools: [{ name: 'algorithm_1_execute', inputSchema: { properties: { revision_id: { type: 'integer', const: 7 } } } }, { name: 'dag_approval_decide', inputSchema: {} }] }
function props(call: Props['call']): Props {
  return { authorize: async () => {}, revoke: async () => {}, call, t: key => zh[key as YuanShuChatKey],
    useResource: ((address: string) => {
      const value = address.includes('/catalog') ? catalog : address.includes('/identity') ? { kind: 'identity' as const, tenants: [{ id: 1, code: 'fixture' }] } : { kind: 'result' as const, result: { structuredContent: { data: { run: { execution_id: 'original-1', status: 'SUCCEEDED' } } } } }
      // This fixture implements only the enterprise protocol consumed by the component.
      return { status: 'live', value, failure: undefined }
    }) as Props['useResource'] }
}
beforeEach(() => { localStorage.clear(); localStorage.setItem('yuanshu-token', `e30.${btoa(JSON.stringify({ user_id: 1 }))}.sig`); localStorage.setItem('yuanshu-active-tenant', '1') })
afterEach(cleanup)
describe('enterprise workbench', () => {
  it('keeps identity and capability reads stable after a tool result and refreshes them explicitly', async () => {
    const call = vi.fn(async () => ({ structuredContent: { data: [] } }))
    const base = props(call)
    const reads: string[] = []
    const useResource: Props['useResource'] = <P extends ResourceProtocol,>(address: string) => {
      reads.push(address)
      return base.useResource<P>(address)
    }
    render(<EnterpriseWorkbench {...base} useResource={useResource} />)
    const identity = reads.find(address => address.includes('/identity'))
    const catalog = reads.find(address => address.includes('/catalog'))
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    await waitFor(() => { expect(screen.getByRole('button', { name: zh.run }).hasAttribute('disabled')).toBe(false) })
    expect(new Set(reads.filter(address => address.includes('/identity')))).toEqual(new Set([identity]))
    expect(new Set(reads.filter(address => address.includes('/catalog')))).toEqual(new Set([catalog]))
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(new Set(reads.filter(address => address.includes('/catalog'))).size).toBe(2)
  })
  it('renders platform record strings as readable table cells', async () => {
    const call = vi.fn(async () => ({ structuredContent: { data: { events: [{ code: 'Q-2026-001', description: 'Incoming material inspection' }] } } }))
    render(<EnterpriseWorkbench {...props(call)} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    expect(await screen.findByRole('cell', { name: /^Q-2026-001$/ })).toBeTruthy()
    expect(screen.getByRole('cell', { name: /^Incoming material inspection$/ })).toBeTruthy()
  })
  it('labels a bounded table preview and makes every omitted row and column available', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...Object.fromEntries(Array.from({ length: 12 }, (_, column) => [`column_${column}`, index])),
      evidence: index === 100 ? 'last-row-evidence' : 'quality-evidence',
    }))
    render(<EnterpriseWorkbench {...props(async () => ({ structuredContent: { data: { rows } } }))} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    expect(await screen.findByText('当前为结果预览，部分内容未显示。')).toBeTruthy()
    expect(screen.queryByText(/last-row-evidence/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '查看完整 JSON 结果' }))
    expect(screen.getByText(/last-row-evidence/u).textContent).toBe(JSON.stringify(rows, null, 2))
    fireEvent.click(screen.getByRole('button', { name: '收起完整结果' }))
    expect(screen.queryByText(/last-row-evidence/u)).toBeNull()
  })

  it('keeps deeply nested and long values accessible beyond the preview limit', async () => {
    let value: unknown = `quality-${'中'.repeat(16001)}-complete-evidence`
    for (let depth = 0; depth < 9; depth++) value = { nested: value }
    render(<EnterpriseWorkbench {...props(async () => ({ structuredContent: { data: value } }))} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    expect(await screen.findByText('当前为结果预览，部分内容未显示。')).toBeTruthy()
    expect(screen.queryByText(/complete-evidence/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '查看完整 JSON 结果' }))
    expect(screen.getByText(/complete-evidence/u).textContent).toContain('中'.repeat(16001))
  })
  it('pins the discovered revision and restores only the original execution handle', async () => {
    const call = vi.fn<Props['call']>(async () => ({ structuredContent: { data: { execution: { execution_id: 'original-1' } } } }))
    const view = render(<EnterpriseWorkbench {...props(call)} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    await waitFor(() => { expect(call).toHaveBeenCalledTimes(1) })
    const invocation = call.mock.calls[0]
    expect(invocation?.[0]).toBe('algorithm_1_execute')
    expect(invocation?.[1].revision_id).toBe(7)
    expect(invocation?.[1].idempotency_key).toMatch(/^[0-9a-f-]{36}$/u)
    await screen.findByRole('heading', { name: zh.originalRun })
    expect(localStorage.getItem('yuanshu-enterprise-original-run')).not.toContain('SUCCEEDED')
    view.unmount()
    render(<EnterpriseWorkbench {...props(call)} />)
    expect(screen.getByRole('heading', { name: zh.originalRun })).toBeTruthy()
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('does not display a late response after changing the login subject', async () => {
    let finish: ((value: unknown) => void) | undefined
    const call = vi.fn(() => new Promise<unknown>((resolve) => { finish = resolve }))
    const view = render(<EnterpriseWorkbench {...props(call)} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    localStorage.setItem('yuanshu-token', `e30.${btoa(JSON.stringify({ user_id: 2 }))}.sig`)
    finish?.({ structuredContent: { confidential: 'old-owner-result', execution_id: 'old-run' } })
    await waitFor(() => { expect(screen.getByRole('button', { name: zh.run }).hasAttribute('disabled')).toBe(false) })
    view.rerender(<EnterpriseWorkbench {...props(call)} />)
    expect(screen.queryByText('old-owner-result')).toBeNull()
    expect(localStorage.getItem('yuanshu-enterprise-original-run')).toBeNull()
  })

  it('restores the scenario handle and propagates cancellation through its original workflow', async () => {
    const call = vi.fn<Props['call']>(async () => ({ structuredContent: { data: { run_id: 'scenario-original', scenario_run_id: 'business-original', status: 'QUEUED' } } }))
    const base = props(call)
    const reads: string[] = []
    const useResource: Props['useResource'] = <P extends ResourceProtocol,>(address: string) => { reads.push(address); return base.useResource<P>(address) }
    const view = render(<EnterpriseWorkbench {...base} useResource={useResource} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'algorithm_1_execute' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    await screen.findByRole('heading', { name: zh.originalRun })
    expect(JSON.parse(localStorage.getItem('yuanshu-enterprise-original-run') ?? '{}')).toMatchObject({ tool: 'scenario_run_get', args: { run_id: 'scenario-original' } })
    view.unmount()
    render(<EnterpriseWorkbench {...base} useResource={useResource} />)
    expect(reads.some(address => address.includes('scenario_run_get'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: zh.requestCancel }))
    await waitFor(() => { expect(call).toHaveBeenCalledWith('scenario_run_cancel', expect.objectContaining({ run_id: 'scenario-original' }), undefined) })
    expect(call).toHaveBeenCalledTimes(2)
  })
  it('requires explicit supplemental approval input before continuing', async () => {
    const call = vi.fn(async (_name, _args, continuation) => continuation === undefined ? { resultType: 'input_required', requestState: 'state', inputRequests: { business_input: { method: 'elicitation/create', params: { requestedSchema: { type: 'object', properties: { decision: { type: 'string', enum: ['approved', 'rejected'] } }, required: ['decision'] } } } } } : { structuredContent: { outcome: 'succeeded' } })
    render(<EnterpriseWorkbench {...props(call)} />)
    fireEvent.change(screen.getByRole('combobox', { name: zh.selectCapability }), { target: { value: 'dag_approval_decide' } })
    fireEvent.click(screen.getByRole('button', { name: zh.run }))
    await screen.findByText(zh.supplementalInput)
    expect(call).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('combobox', { name: 'decision' }), { target: { value: 'approved' } })
    fireEvent.click(screen.getByRole('button', { name: zh.submitInput }))
    await waitFor(() => { expect(call).toHaveBeenCalledWith('dag_approval_decide', expect.any(Object), { requestState: 'state', inputResponses: { business_input: { action: 'accept', content: { decision: 'approved' } } } }) })
  })
})
describe('enterprise resource reads', () => {
  it('accepts the platform tenant context envelope', async () => {
    const provider = enterpriseResourceProvider(async () => ({
      current: { id: 1, code: 'fixture', name: 'Fixture', current: true },
      list: [{ id: 1, code: 'fixture', name: 'Fixture', current: true }],
    }))
    const frames = []
    for await (const frame of provider.open('dsh-resource://yuanshu-enterprise/identity', { signal: new AbortController().signal })) frames.push(frame)
    expect(frames).toEqual([{ ok: true, value: { kind: 'identity', tenants: [{ id: 1, code: 'fixture', name: 'Fixture' }] } }])
  })

  it('drops cancelled reads and reports unavailable dependencies as failed frames', async () => {
    const controller = new AbortController()
    const provider = enterpriseResourceProvider(async () => { controller.abort(); return [] })
    const frames = []
    for await (const frame of provider.open('dsh-resource://yuanshu-enterprise/identity', { signal: controller.signal })) frames.push(frame)
    expect(frames).toEqual([])
    const failed = enterpriseResourceProvider(async () => { throw new Error('unavailable') })
    for await (const frame of failed.open('dsh-resource://yuanshu-enterprise/identity', { signal: new AbortController().signal })) expect(frame.ok).toBe(false)
  })
})
