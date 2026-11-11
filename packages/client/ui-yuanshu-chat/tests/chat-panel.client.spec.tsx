// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AskKnowledgeQuestionRequest, YuanShuSseEvent } from '@deepseek-ai/dsh-yuanshu-client'
import { ChatPanel, type YuanShuChatInjected } from '../src/client/ChatPanel.tsx'
import { zh, type YuanShuChatKey } from '../src/client/locales.ts'
import { WorkbenchRequestError, type CapabilityOption } from '../src/client/workbench.ts'
import { loadQaSession, QA_SESSION_STORAGE_KEY } from '../src/client/storage.ts'

type PanelProps = Parameters<typeof ChatPanel>[0]

function translate(key: YuanShuChatKey, params?: Record<string, unknown>): string {
  const template = zh[key] as string
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => String(params[name] ?? ''))
}

const baseInjected: YuanShuChatInjected = {
  askQuestionStream: () => streamOf([]),
  listCapabilities: async () => [],
  runSkill: async () => undefined,
  runAlgorithm: async () => undefined,
  invokeDag: async () => undefined,
  listAlgorithmExecutions: async () => undefined,
  listDagHistory: async () => undefined,
  getDagHistoryDetail: async () => undefined,
}

function props(overrides: Partial<YuanShuChatInjected> = {}): PanelProps {
  return { t: translate, ...baseInjected, ...overrides } as unknown as PanelProps
}

function streamOf(events: readonly YuanShuSseEvent[]): AsyncIterable<YuanShuSseEvent> {
  return (async function* generate() {
    for (const event of events) yield event
  })()
}

async function selectCapability(name: string, key: string): Promise<void> {
  await screen.findByRole('option', { name })
  fireEvent.change(screen.getByRole('combobox', { name: '选择能力' }), { target: { value: key } })
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

describe('capability workbench', () => {
  it('loads the catalog and runs a skill with parsed JSON input', async () => {
    const runSkill = vi.fn(async () => ({ result: { ok: true } }))
    const capabilities: CapabilityOption[] = [{ kind: 'skill', id: 's1', name: '报表技能', description: '生成月报' }]
    render(<ChatPanel {...props({ listCapabilities: async () => capabilities, runSkill })} />)

    await selectCapability('报表技能', 'skill:s1')
    fireEvent.change(screen.getByPlaceholderText('输入参数（JSON，可留空）'), {
      target: { value: '{"month":"2026-10"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await waitFor(() => expect(runSkill).toHaveBeenCalledWith('s1', { month: '2026-10' }))
    const output = await screen.findByText(/"ok": true/u)
    expect(output.tagName).toBe('PRE')
  })

  it('shows a resource hint instead of a run button for Agent-loaded skills', async () => {
    const runSkill = vi.fn(async () => undefined)
    render(<ChatPanel {...props({
      listCapabilities: async () => [{ kind: 'skill', id: 's2', name: '本体资源', executable: false, interactionMode: 'resource' }],
      runSkill,
    })} />)

    await selectCapability('本体资源', 'skill:s2')
    await screen.findByText('该技能由 Agent 装载使用，不支持在此直接运行')
    expect(screen.queryByRole('button', { name: '运行' })).toBeNull()
    expect(runSkill).not.toHaveBeenCalled()
  })

  it('blocks malformed JSON before calling YuanShu', async () => {
    const runSkill = vi.fn(async () => undefined)
    render(<ChatPanel {...props({
      listCapabilities: async () => [{ kind: 'skill', id: 's1', name: '报表技能' }],
      runSkill,
    })} />)

    await selectCapability('报表技能', 'skill:s1')
    fireEvent.change(screen.getByPlaceholderText('输入参数（JSON，可留空）'), { target: { value: '{month:1}' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await screen.findByText('JSON 格式不正确')
    expect(runSkill).not.toHaveBeenCalled()
  })

  it('renders a 404 as an invisible capability instead of a generic failure', async () => {
    const runSkill = vi.fn(async () => { throw new WorkbenchRequestError('not found', 404) })
    render(<ChatPanel {...props({
      listCapabilities: async () => [{ kind: 'skill', id: 's1', name: '报表技能' }],
      runSkill,
    })} />)

    await selectCapability('报表技能', 'skill:s1')
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await screen.findByText('能力不存在或当前账号不可见')
  })

  it('shows the login prompt when the catalog rejects with 401', async () => {
    render(<ChatPanel {...props({
      listCapabilities: async () => { throw new WorkbenchRequestError('expired', 401) },
    })} />)

    await screen.findByText('登录已过期，请重新登录元枢')
  })

  it('renders a schema form and submits typed input', async () => {
    const runSkill = vi.fn(async () => ({ result: { ok: true } }))
    render(<ChatPanel {...props({
      listCapabilities: async () => [{
        kind: 'skill',
        id: 's1',
        name: '报表技能',
        inputSchema: {
          type: 'object',
          properties: {
            month: { type: 'string', description: '月份' },
            count: { type: 'number' },
            flag: { type: 'boolean' },
            extra: { type: 'object' },
          },
          required: ['month'],
        },
      }],
      runSkill,
    })} />)

    await selectCapability('报表技能', 'skill:s1')
    expect(screen.getByRole('button', { name: '表单模式' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('*')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('month'), { target: { value: '2026-10' } })
    fireEvent.change(screen.getByLabelText('count'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('flag'), { target: { value: 'true' } })
    fireEvent.change(screen.getByLabelText('extra'), { target: { value: '{"a":1}' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await waitFor(() => expect(runSkill).toHaveBeenCalledWith('s1', {
      month: '2026-10', count: 5, flag: true, extra: { a: 1 },
    }))
  })

  it('rejects invalid schema values and can switch back to JSON mode', async () => {
    const runSkill = vi.fn(async () => undefined)
    render(<ChatPanel {...props({
      listCapabilities: async () => [{
        kind: 'skill',
        id: 's1',
        name: '报表技能',
        inputSchema: {
          type: 'object',
          properties: { count: { type: 'number' }, extra: { type: 'object' } },
        },
      }],
      runSkill,
    })} />)

    await selectCapability('报表技能', 'skill:s1')
    fireEvent.change(screen.getByLabelText('extra'), { target: { value: '{bad' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await screen.findByText('参数格式不正确，请检查数字、布尔与对象字段')
    expect(runSkill).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'JSON 模式' }))
    fireEvent.change(screen.getByPlaceholderText('输入参数（JSON，可留空）'), { target: { value: '{"count":2}' } })
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await waitFor(() => expect(runSkill).toHaveBeenCalledWith('s1', { count: 2 }))
  })

  it('renders the DAG run timeline after an invocation', async () => {
    const invokeDag = vi.fn(async () => ({ execution_id: 'exec-1', status: 'success' }))
    const listDagHistory = vi.fn(async () => ({ list: [{ id: 7, execution_id: 'exec-1' }], total: 1 }))
    const getDagHistoryDetail = vi.fn(async () => ({
      id: 7,
      status: 'success',
      execution_id: 'exec-1',
      duration_ms: 120,
      node_executions: [
        { node_id: 'start', node_label: '开始', node_type: 'start', status: 'success', duration_ms: 10, started_at: '2026-11-11T10:00:01Z' },
        { node_id: 'llm', node_label: '生成', node_type: 'llm', status: 'failed', duration_ms: 110, started_at: '2026-11-11T10:00:02Z', error: '模型超时' },
      ],
    }))
    render(<ChatPanel {...props({
      listCapabilities: async () => [{
        kind: 'dag',
        id: 'd1',
        name: '审批场景',
        inputSchema: { type: 'object', properties: { month: { type: 'string' } } },
      }],
      invokeDag,
      listDagHistory,
      getDagHistoryDetail,
    })} />)

    await selectCapability('审批场景', 'dag:d1')
    fireEvent.click(screen.getByRole('button', { name: '运行' }))

    await waitFor(() => expect(invokeDag).toHaveBeenCalledWith('d1', {}))
    await screen.findByText('运行时间线')
    expect(await screen.findByText('开始')).toBeTruthy()
    expect(await screen.findByText('生成')).toBeTruthy()
    expect(await screen.findByText('模型超时')).toBeTruthy()
    expect(listDagHistory).toHaveBeenCalledWith(20, 'd1')
    expect(getDagHistoryDetail).toHaveBeenCalledWith('7')
  })

  it('lists algorithm executions as structured rows', async () => {
    render(<ChatPanel {...props({
      listCapabilities: async () => [{ kind: 'algorithm', id: 'a1', name: '评分算法' }],
      listAlgorithmExecutions: async () => ({
        list: [
          { id: 11, status: 'success', duration_ms: 30, created_at: '2026-11-11T09:00:00Z' },
          { id: 12, status: 'failed', duration_ms: 5, error_message: '参数缺失' },
        ],
        total: 2,
      }),
    })} />)

    await selectCapability('评分算法', 'algorithm:a1')
    fireEvent.click(screen.getByRole('button', { name: '查看历史' }))

    await screen.findByText('执行记录')
    expect(screen.getByText('11')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('参数缺失')).toBeTruthy()
  })
})

describe('knowledge Q&A session', () => {
  it('reuses the server session id and persists the transcript across refreshes', async () => {
    const requests: AskKnowledgeQuestionRequest[] = []
    const askQuestionStream = (request: AskKnowledgeQuestionRequest): AsyncIterable<YuanShuSseEvent> => {
      requests.push(request)
      return streamOf([
        { event: 'begin', data: { type: 'knowledge_qa_begin' } },
        { event: 'complete', data: { answer: `答案${String(requests.length)}`, session_id: 'sess-1', citations: [] } },
      ])
    }
    render(<ChatPanel {...props({ askQuestionStream })} />)

    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: '第一个问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('答案1')

    await waitFor(() => expect(loadQaSession().sessionId).toBe('sess-1'))
    expect(window.localStorage.getItem(QA_SESSION_STORAGE_KEY)).not.toBeNull()

    fireEvent.change(screen.getByPlaceholderText('输入你的问题...'), { target: { value: '第二个问题' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText('答案2')

    expect(requests[1]).toEqual({ question: '第二个问题', session_id: 'sess-1' })
  })

  it('restores a stored transcript when the panel mounts', () => {
    window.localStorage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify({
      sessionId: 'sess-9',
      messages: [
        { role: 'user', content: '上次的问题' },
        { role: 'assistant', content: '上次的答案' },
      ],
    }))
    render(<ChatPanel {...props()} />)

    expect(screen.getByText('上次的问题')).toBeTruthy()
    expect(screen.getByText('上次的答案')).toBeTruthy()
    expect(loadQaSession().sessionId).toBe('sess-9')
  })

  it('starts a fresh session when the user clears the conversation', async () => {
    window.localStorage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify({
      sessionId: 'sess-9',
      messages: [{ role: 'user', content: '旧问题' }],
    }))
    render(<ChatPanel {...props()} />)

    fireEvent.click(screen.getByRole('button', { name: '新对话' }))

    expect(screen.queryByText('旧问题')).toBeNull()
    expect(loadQaSession()).toEqual({ messages: [] })
  })
})
