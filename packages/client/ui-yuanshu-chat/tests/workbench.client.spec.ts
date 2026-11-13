import { describe, expect, it } from 'vitest'
import {
  buildFieldValues,
  buildSchemaInput,
  capabilityKey,
  describeFailure,
  extractExecutionId,
  findHistoryId,
  formatExecutionResult,
  formatOutput,
  groupCapabilities,
  isRunnable,
  parseCapabilityKey,
  parseJsonInput,
  schemaFields,
  sectionForCapabilityKind,
  toAlgorithmExecutionRows,
  toCapabilityOptions,
  toCatalogRows,
  toOverviewEntries,
  toRunTimeline,
  WORKBENCH_SECTIONS,
  WorkbenchRequestError,
  type CapabilityOption,
} from '../src/client/workbench.ts'
import {
  clearQaSession,
  defaultStorage,
  loadQaSession,
  QA_SESSION_STORAGE_KEY,
  qaStorageIdentity,
  readAuthToken,
  saveQaSession,
  TOKEN_STORAGE_KEYS,
  type KeyValueStorage,
} from '../src/client/storage.ts'

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { readonly entries: Map<string, string> } {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: (key) => { entries.delete(key) },
  }
}

const skill: CapabilityOption = { kind: 'skill', id: 's-1', name: '报表技能', description: '生成报表' }
const algorithm: CapabilityOption = { kind: 'algorithm', id: 'a-1', name: '评分算法' }
const dag: CapabilityOption = { kind: 'dag', id: 'd-1', name: '审批场景' }

describe('capability catalog shaping', () => {
  it('keeps addressable rows and normalizes numeric ids', () => {
    expect(toCapabilityOptions([
      { kind: 'skill', id: 1, name: 'A', description: 'd' },
      { kind: 'algorithm', id: 'a', name: 'B' },
    ])).toEqual([
      { kind: 'skill', id: '1', name: 'A', description: 'd', executable: true },
      { kind: 'algorithm', id: 'a', name: 'B', executable: true },
    ])
  })

  it('marks resource skills as non-executable and keeps their interaction mode', () => {
    expect(toCapabilityOptions([
      { kind: 'skill', id: 3, name: '本体资源', executable: false, interaction_mode: 'resource' },
    ])).toEqual([
      { kind: 'skill', id: '3', name: '本体资源', executable: false, interactionMode: 'resource' },
    ])
    expect(isRunnable('skill', false)).toBe(false)
    expect(isRunnable('skill')).toBe(true)
    expect(isRunnable('algorithm', false)).toBe(false)
  })

  it('drops unknown kinds, missing ids, and unnamed rows instead of inventing capabilities', () => {
    expect(toCapabilityOptions([
      { kind: 'plugin', id: 'x', name: 'X' },
      { kind: 'skill', name: 'no id' },
      { kind: 'skill', id: 'y', name: '' },
      null,
      'skill',
    ])).toEqual([])
  })

  it('accepts the paged `{ list }` envelope', () => {
    expect(toCapabilityOptions({ list: [{ kind: 'dag', id: 'd', name: 'D' }], total: 1 })).toEqual([
      { kind: 'dag', id: 'd', name: 'D', executable: true },
    ])
  })

  it('returns an empty catalog for unusable payloads', () => {
    expect(toCapabilityOptions(undefined)).toEqual([])
    expect(toCapabilityOptions({ data: [] })).toEqual([])
    expect(toCapabilityOptions('skills')).toEqual([])
  })

  it('keeps the published input schema, accepting both gateway and base-record keys', () => {
    const schema = { type: 'object', properties: { month: { type: 'string' } } }
    expect(toCapabilityOptions([
      { kind: 'skill', id: 's', name: 'S', input_schema: schema },
      { kind: 'algorithm', id: 'a', name: 'A', inputSchema: schema },
    ])).toEqual([
      { kind: 'skill', id: 's', name: 'S', inputSchema: schema, executable: true },
      { kind: 'algorithm', id: 'a', name: 'A', inputSchema: schema, executable: true },
    ])
  })
})

describe('capability grouping and selection keys', () => {
  it('always starts with knowledge Q&A and follows the fixed kind order', () => {
    const groups = groupCapabilities([dag, skill, algorithm, { kind: 'agent', id: 'g', name: 'G' }])
    expect(groups.map(group => group.kind)).toEqual(['qa', 'skill', 'algorithm', 'dag', 'agent'])
    expect(groups[0]?.items).toEqual([])
    expect(groups[1]?.items).toEqual([skill])
  })

  it('omits empty groups but keeps Q&A available', () => {
    expect(groupCapabilities([])).toEqual([{ kind: 'qa', items: [] }])
  })

  it('round-trips ids containing reserved characters', () => {
    const key = capabilityKey({ kind: 'dag', id: 'app:场景/1', name: '场景' })
    expect(parseCapabilityKey(key)).toEqual({ kind: 'dag', id: 'app:场景/1' })
  })

  it('rejects the QA pseudo-kind and malformed keys', () => {
    expect(parseCapabilityKey('qa')).toBeUndefined()
    expect(parseCapabilityKey('skill:')).toBeUndefined()
    expect(parseCapabilityKey('unknown:1')).toBeUndefined()
  })

  it('only treats skill, algorithm, and DAG as directly runnable', () => {
    expect(isRunnable('skill')).toBe(true)
    expect(isRunnable('algorithm')).toBe(true)
    expect(isRunnable('dag')).toBe(true)
    expect(isRunnable('agent')).toBe(false)
    expect(isRunnable('worker')).toBe(false)
  })
})

describe('capability input parsing', () => {
  it('treats an empty input as no parameters', () => {
    expect(parseJsonInput('')).toEqual({ ok: true, value: undefined })
    expect(parseJsonInput('  \n ')).toEqual({ ok: true, value: undefined })
  })

  it('accepts any JSON value including arrays and primitives', () => {
    expect(parseJsonInput('{"month":"2026-10"}')).toEqual({ ok: true, value: { month: '2026-10' } })
    expect(parseJsonInput('[1,2]')).toEqual({ ok: true, value: [1, 2] })
    expect(parseJsonInput('"text"')).toEqual({ ok: true, value: 'text' })
  })

  it('rejects malformed JSON without throwing', () => {
    expect(parseJsonInput('{month: 1}')).toEqual({ ok: false })
  })
})

describe('capability output formatting', () => {
  it('unwraps the `{ result }` envelope of synchronous execution', () => {
    expect(formatExecutionResult({ result: { score: 0.9 } })).toBe('{\n  "score": 0.9\n}')
    expect(formatExecutionResult({ result: 'plain answer' })).toBe('plain answer')
  })

  it('formats unwrapped values and handles empty results', () => {
    expect(formatExecutionResult({ score: 1 })).toBe('{\n  "score": 1\n}')
    expect(formatExecutionResult(undefined)).toBe('')
    expect(formatOutput([])).toBe('[]')
  })
})

describe('schema-driven form', () => {
  const schema = {
    type: 'object',
    properties: {
      month: { type: 'string', description: '月份' },
      count: { type: 'integer', default: 3 },
      flag: { type: 'boolean' },
      mode: { type: 'string', enum: ['fast', 'slow'] },
      extra: { type: 'object' },
      items: { type: 'array' },
    },
    required: ['month'],
  }

  it('flattens object schemas into typed fields', () => {
    expect(schemaFields(schema).map(field => [field.name, field.type, field.required])).toEqual([
      ['month', 'string', true],
      ['count', 'number', false],
      ['flag', 'boolean', false],
      ['mode', 'enum', false],
      ['extra', 'object', false],
      ['items', 'array', false],
    ])
    expect(schemaFields(schema)[3]?.enum).toEqual(['fast', 'slow'])
    expect(schemaFields(schema)[0]?.description).toBe('月份')
  })

  it('returns no fields for unusable schemas', () => {
    expect(schemaFields(undefined)).toEqual([])
    expect(schemaFields({ type: 'string' })).toEqual([])
    expect(schemaFields({ type: 'object' })).toEqual([])
    expect(schemaFields({ properties: 'nope' })).toEqual([])
  })

  it('seeds defaults and serializes complex defaults as JSON text', () => {
    expect(buildFieldValues(schemaFields(schema))).toEqual({ count: '3' })
  })

  it('builds a typed input object and skips unset fields', () => {
    expect(buildSchemaInput(schemaFields(schema), {
      month: '2026-10', count: '5', flag: 'false', mode: 'fast', extra: '{"a":1}', items: '[1,2]',
    })).toEqual({
      ok: true,
      value: { month: '2026-10', count: 5, flag: false, mode: 'fast', extra: { a: 1 }, items: [1, 2] },
    })
    expect(buildSchemaInput(schemaFields(schema), { month: '2026-10' })).toEqual({ ok: true, value: { month: '2026-10' } })
    expect(buildSchemaInput(schemaFields(schema), {})).toEqual({ ok: true, value: {} })
  })

  it('rejects malformed numbers, booleans, and structured JSON', () => {
    const fields = schemaFields(schema)
    expect(buildSchemaInput(fields, { count: 'five' })).toEqual({ ok: false })
    expect(buildSchemaInput(fields, { flag: 'yes' })).toEqual({ ok: false })
    expect(buildSchemaInput(fields, { extra: '{a:1}' })).toEqual({ ok: false })
    expect(buildSchemaInput(fields, { items: '[1,' })).toEqual({ ok: false })
  })
})

describe('DAG run timeline shaping', () => {
  it('reads the execution id from the response or its data envelope', () => {
    expect(extractExecutionId({ execution_id: 'exec-1' })).toBe('exec-1')
    expect(extractExecutionId({ data: { execution_id: 42 } })).toBe('42')
    expect(extractExecutionId({ result: {} })).toBeUndefined()
    expect(extractExecutionId(undefined)).toBeUndefined()
  })

  it('finds the history row id by execution id across paged and bare payloads', () => {
    const history = { list: [{ id: 7, execution_id: 'exec-1' }, { id: '8', execution_id: 'exec-2' }], total: 2 }
    expect(findHistoryId(history, 'exec-2')).toBe('8')
    expect(findHistoryId([{ id: 3, execution_id: 'exec-3' }], 'exec-3')).toBe('3')
    expect(findHistoryId(history, 'missing')).toBeUndefined()
    expect(findHistoryId(history, undefined)).toBeUndefined()
  })

  it('orders nodes by start time and keeps labels, status, and errors', () => {
    const timeline = toRunTimeline({
      id: 7,
      status: 'success',
      execution_id: 'exec-1',
      duration_ms: 120,
      created_at: '2026-11-11T10:00:00Z',
      node_executions: [
        { node_id: 'end', node_label: '结束', node_type: 'end', status: 'success', duration_ms: 5, started_at: '2026-11-11T10:00:02Z' },
        { node_id: 'start', node_type: 'start', status: 'success', duration_ms: 15, started_at: '2026-11-11T10:00:01Z' },
        { node_id: 'llm', node_label: '生成', status: 'failed', duration_ms: 100, started_at: '2026-11-11T10:00:03Z', error: 'boom' },
        { node_id: '' },
      ],
    })
    expect(timeline?.id).toBe('7')
    expect(timeline?.executionId).toBe('exec-1')
    expect(timeline?.nodes.map(node => node.nodeId)).toEqual(['start', 'end', 'llm'])
    expect(timeline?.nodes[0]?.label).toBe('start')
    expect(timeline?.nodes[2]?.error).toBe('boom')
  })

  it('rejects unusable run details', () => {
    expect(toRunTimeline(undefined)).toBeUndefined()
    expect(toRunTimeline('detail')).toBeUndefined()
    expect(toRunTimeline({ node_executions: [] })?.nodes).toEqual([])
  })
})

describe('algorithm history shaping', () => {
  it('normalizes executions and keeps error messages', () => {
    expect(toAlgorithmExecutionRows({
      list: [
        { id: 1, status: 'success', created_at: '2026-11-11T09:00:00Z', duration_ms: 30 },
        { id: '2', status: 'failed', duration_ms: 0, error_message: 'bad input' },
        { status: 'running' },
      ],
    })).toEqual([
      { id: '1', status: 'success', createdAt: '2026-11-11T09:00:00Z', durationMs: 30 },
      { id: '2', status: 'failed', createdAt: '', durationMs: 0, error: 'bad input' },
    ])
  })

  it('returns no rows for unusable payloads', () => {
    expect(toAlgorithmExecutionRows(undefined)).toEqual([])
    expect(toAlgorithmExecutionRows({ list: 'nope' })).toEqual([])
  })
})
describe('failure semantics', () => {
  it('maps HTTP status to stable interface states', () => {
    expect(describeFailure(new WorkbenchRequestError('expired', 401)).kind).toBe('unauthorized')
    expect(describeFailure(new WorkbenchRequestError('denied', 403)).kind).toBe('forbidden')
    expect(describeFailure(new WorkbenchRequestError('missing', 404)).kind).toBe('invisible')
    expect(describeFailure(new WorkbenchRequestError('slow down', 429)).kind).toBe('rateLimited')
    expect(describeFailure(new WorkbenchRequestError('boom', 503)).kind).toBe('unavailable')
    expect(describeFailure(new Error('network')).kind).toBe('failed')
  })

  it('keeps status and message for diagnostics', () => {
    const failure = describeFailure(new WorkbenchRequestError('能力不存在', 404, 40401))
    expect(failure.status).toBe(404)
    expect(failure.message).toBe('能力不存在')
  })

  it('does not trust non-numeric status fields', () => {
    expect(describeFailure({ status: '404' }).kind).toBe('failed')
    expect(describeFailure(undefined).kind).toBe('failed')
  })
})

describe('workbench catalogs', () => {
  it('keeps the navigation order stable and maps capability kinds to sections', () => {
    expect(WORKBENCH_SECTIONS).toEqual([
      'home', 'qa', 'knowledge', 'overview', 'ontology', 'skill', 'algorithm', 'scenario', 'dag',
    ])
    expect(sectionForCapabilityKind('skill')).toBe('skill')
    expect(sectionForCapabilityKind('algorithm')).toBe('algorithm')
    expect(sectionForCapabilityKind('dag')).toBe('dag')
    expect(sectionForCapabilityKind('agent')).toBe('scenario')
    expect(sectionForCapabilityKind('worker')).toBe('scenario')
  })

  it('normalizes bare arrays and paged envelopes', () => {
    expect(toCatalogRows([{ id: 1, name: '空间一', summary: '说明', status: 'active' }])).toEqual([
      { id: '1', name: '空间一', description: '说明', status: 'active' },
    ])
    expect(toCatalogRows({ list: [{ space_id: 'sp-1', title: '标题' }], total: 1 })).toEqual([
      { id: 'sp-1', name: '标题' },
    ])
    expect(toCatalogRows({ data: [{ id: 'x' }] })).toEqual([{ id: 'x', name: 'x' }])
  })

  it('drops rows that carry neither id nor name and ignores hostile payloads', () => {
    expect(toCatalogRows([{ description: 'only text' }, null, 'row', { id: 'ok', name: '保留' }])).toEqual([
      { id: 'ok', name: '保留' },
    ])
    expect(toCatalogRows(undefined)).toEqual([])
    expect(toCatalogRows({ list: 'nope' })).toEqual([])
  })

  it('flattens primitive overview fields for display', () => {
    expect(toOverviewEntries({ spaces: 2, healthy: true, name: '本体', nested: { x: 1 }, list: [] })).toEqual([
      { label: 'spaces', value: '2' },
      { label: 'healthy', value: 'true' },
      { label: 'name', value: '本体' },
    ])
    expect(toOverviewEntries(undefined)).toEqual([])
    expect(toOverviewEntries([1, 2])).toEqual([])
  })
})

describe('browser storage', () => {
  it('returns no default storage outside a browser', () => {
    expect(defaultStorage()).toBeUndefined()
  })

  it('reads the first non-blank token in priority order', () => {
    const storage = memoryStorage({ 'workbench-client-token': 'second', 'yuanshu-login-token': 'third' })
    expect(readAuthToken(storage)).toBe('second')
    storage.setItem(TOKEN_STORAGE_KEYS[0], 'first')
    expect(readAuthToken(storage)).toBe('first')
    storage.setItem(TOKEN_STORAGE_KEYS[0], '   ')
    expect(readAuthToken(storage)).toBe('second')
  })

  it('reports no token when storage is missing or empty', () => {
    expect(readAuthToken(undefined)).toBeUndefined()
    expect(readAuthToken(memoryStorage())).toBeUndefined()
  })

  it('round-trips the Q&A session and clears it', () => {
    const storage = memoryStorage({ 'yuanshu-token': `e30.${btoa(JSON.stringify({ user_id: 1 }))}.signature`, 'yuanshu-active-tenant': '1' })
    saveQaSession({
      sessionId: 'sess-1',
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '答案', citations: [{ evidence_id: 'e1', document_id: 'doc-1', title: '制度' }] },
      ],
    }, storage)
    expect(storage.entries.has(QA_SESSION_STORAGE_KEY)).toBe(true)
    expect(loadQaSession(storage)).toEqual({
      sessionId: 'sess-1',
      messages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '答案', citations: [{ evidence_id: 'e1', document_id: 'doc-1', title: '制度' }] },
      ],
    })
    clearQaSession(storage)
    expect(loadQaSession(storage)).toEqual({ messages: [] })
  })

  it('does not restore another subject, tenant, or an unowned legacy transcript', () => {
    const storage = memoryStorage({ 'yuanshu-token': `e30.${btoa(JSON.stringify({ user_id: 1 }))}.signature`, 'yuanshu-active-tenant': '1' })
    saveQaSession({ sessionId: 'private', messages: [{ role: 'user', content: 'private' }] }, storage)
    storage.setItem('yuanshu-active-tenant', '2')
    expect(loadQaSession(storage)).toEqual({ messages: [] })
    storage.setItem('yuanshu-active-tenant', '1')
    storage.setItem('yuanshu-token', `e30.${btoa(JSON.stringify({ user_id: 2 }))}.signature`)
    expect(loadQaSession(storage)).toEqual({ messages: [] })
    storage.setItem('yuanshu-token', 'opaque')
    expect(loadQaSession(storage)).toEqual({ messages: [] })
    storage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify({ sessionId: 'legacy', messages: [] }))
    expect(loadQaSession(storage)).toEqual({ messages: [] })
  })

  it('recovers from corrupted or hostile stored transcripts', () => {
    const storage = memoryStorage({ [QA_SESSION_STORAGE_KEY]: '{not json', 'yuanshu-token': `e30.${btoa(JSON.stringify({ user_id: 1 }))}.signature`, 'yuanshu-active-tenant': '1' })
    expect(loadQaSession(storage)).toEqual({ messages: [] })

    storage.setItem(QA_SESSION_STORAGE_KEY, JSON.stringify({
      owner: qaStorageIdentity(storage),
      sessionId: 42,
      messages: [
        { role: 'system', content: 'ignore' },
        { role: 'user', content: '' },
        { role: 'assistant', content: 'ok', citations: [{ evidence_id: 'e1' }] },
        { role: 'user', content: 'kept', citations: [{ evidence_id: 'e2', document_id: 2 }] },
      ],
    }))
    expect(loadQaSession(storage)).toEqual({
      messages: [
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'kept' },
      ],
    })
  })
})
