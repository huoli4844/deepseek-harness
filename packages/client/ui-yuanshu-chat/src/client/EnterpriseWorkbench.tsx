/** Tenant application content driven by authenticated MCP descriptions. */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type { NS } from './locales.ts'
import type { EnterpriseResourceValue } from './enterprise-resource.ts'
import { qaStorageIdentity, readActiveTenant, writeActiveTenant } from './storage.ts'
import { schemaFields, buildFieldValues, buildSchemaInput, extractExecutionId } from './workbench.ts'
import css from './ChatPanel.module.css'
import workbenchCss from './WorkbenchPanel.module.css'

/** Explicit user actions; reads are owned by the standard resource provider. */
export interface EnterpriseWorkbenchInjected {
  readonly authorize: () => Promise<unknown>
  readonly revoke: () => Promise<unknown>
  readonly call: (name: string, args: Record<string, unknown>, continuation?: { requestState: string; inputResponses: Record<string, { action: 'accept'; content: Record<string, unknown> }> }) => Promise<unknown>
}
interface Handle { readonly owner: string; readonly tool: string; readonly args: Record<string, unknown> }
const handleKey = 'yuanshu-enterprise-original-run'
function savedHandle(): Handle | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(handleKey) ?? 'null')
    if (value !== null && typeof value === 'object' && 'owner' in value && typeof value.owner === 'string' && value.owner === qaStorageIdentity() && 'tool' in value && typeof value.tool === 'string' && 'args' in value && value.args !== null && typeof value.args === 'object' && !Array.isArray(value.args)) return { owner: value.owner, tool: value.tool, args: value.args as Record<string, unknown> }
  } catch { /* Unavailable storage disables display restoration only. */ }
  return undefined
}
function dataOf(value: unknown): unknown {
  return value !== null && typeof value === 'object' && 'structuredContent' in value ? value.structuredContent : value
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function address(path: string, generation: number, tool?: string, args?: Record<string, unknown>): string {
  const params = new URLSearchParams({ owner: qaStorageIdentity() ?? 'unauthorized', generation: String(generation) })
  if (tool !== undefined) params.set('tool', tool)
  if (args !== undefined) params.set('args', JSON.stringify(args))
  return `dsh-resource://yuanshu-enterprise/${path}?${params.toString()}`
}

/**
 * Render structured rows, metrics, evidence and original Run records without
 * interpreting platform content as HTML or client authority.
 */
function ResultValue({ value, depth = 0, t }:
  { readonly value: unknown; readonly depth?: number } & PropsLocale<typeof NS>): React.JSX.Element {
  if (depth >= 8) {
    const text = JSON.stringify(value)
    return <><pre className={css.resultBody}>{text.slice(0, 16000)}</pre>{text.length > 16000 && <CompleteResult value={value} t={t} />}</>
  }
  if (Array.isArray(value) && value.length > 0 && value.every(item => record(item) !== undefined)) {
    const allColumns = [...new Set(value.flatMap(item => Object.keys(item as Record<string, unknown>)))]
    const columns = allColumns.slice(0, 12)
    return <><div className={workbenchCss.tableWrap}><table className={`${workbenchCss.table} ${css.enterpriseTable}`}><thead><tr>{columns.map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{value.slice(0, 100).map((row, i) => <tr key={i}>{columns.map((key) => {
      const cell = (row as Record<string, unknown>)[key]
      return <td key={key}>{typeof cell === 'string' ? cell : JSON.stringify(cell)}</td>
    })}</tr>)}</tbody></table></div>{(value.length > 100 || allColumns.length > 12) && <CompleteResult value={value} t={t} />}</>
  }
  const object = record(value)
  if (object !== undefined) {
    const entries = Object.entries(object)
    return <><dl>{entries.slice(0, 100).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(item) || record(item) !== undefined ? <ResultValue value={item} depth={depth + 1} t={t} /> : item == null ? '' : typeof item === 'string' ? item : JSON.stringify(item)}</dd></div>)}</dl>{entries.length > 100 && <CompleteResult value={value} t={t} />}</>
  }
  return <pre className={css.resultBody}>{JSON.stringify(value, null, 2)}</pre>
}

function CompleteResult({ value, t }: { readonly value: unknown } & PropsLocale<typeof NS>): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  return <div><p>{t('resultPreview')}</p><button type="button" aria-expanded={expanded} onClick={() => { setExpanded(value => !value) }}>{t(expanded ? 'collapseResult' : 'completeResult')}</button>{expanded && <pre className={css.resultBody}>{JSON.stringify(value, null, 2)}</pre>}</div>
}

/** Platform application workbench using framework-owned cancellable reads. */
export function EnterpriseWorkbench({ authorize, revoke, call, useResource, t }: InjectFace<EnterpriseWorkbenchInjected> & PropsLocale<typeof NS> & Pick<PropsRuntime<'main'>, 'useResource'>) {
  const [generation, setGeneration] = useState(0)
  const [runGeneration, setRunGeneration] = useState(0)
  const [selected, setSelected] = useState('')
  const [input, setInput] = useState('{}')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [output, setOutput] = useState<{ owner: string | undefined; value: unknown }>()
  const [pending, setPending] = useState<{
    owner: string | undefined
    state: string
    name: string
    args: Record<string, unknown>
    fields: ReturnType<typeof schemaFields>
  }>()
  const [form, setForm] = useState<Record<string, string>>({})
  const [handle, setHandle] = useState(savedHandle)
  const owner = qaStorageIdentity()
  const identity = useResource<'yuanshu-enterprise'>(address('identity', generation))
  const catalog = useResource<'yuanshu-enterprise'>(address('catalog', generation))
  const original = useResource<'yuanshu-enterprise'>(handle !== undefined && handle.owner === owner ? address('run', runGeneration, handle.tool, handle.args) : '')
  const value = catalog.value?.kind === 'catalog' ? catalog.value : undefined
  const tenants = identity.value?.kind === 'identity' ? identity.value.tenants : []
  const refresh = () => { setGeneration(value => value + 1); setRunGeneration(value => value + 1) }
  const perform = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setError(false)
    try { await action(); setRunGeneration(value => value + 1) } catch { setError(true) } finally { setBusy(false) }
  }
  const execute = async (name: string, args: Record<string, unknown>, continuation?: { requestState: string; inputResponses: Record<string, { action: 'accept'; content: Record<string, unknown> }> }) => {
    const response = await call(name, args, continuation)
    if (qaStorageIdentity() !== owner) return
    const envelope = record(response)
    if (envelope?.resultType === 'input_required') {
      const requests = record(envelope.inputRequests), request = record(requests?.business_input)
      if (typeof envelope.requestState !== 'string' || request === undefined || request.method !== 'elicitation/create') throw new Error('Unsupported supplemental input')
      const params = record(request.params)
      const fields = schemaFields(record(params?.requestedSchema))
      if (fields.length === 0) throw new Error('Unsupported supplemental input schema')
      setPending({ owner, name, args, state: envelope.requestState, fields }); setForm(buildFieldValues(fields)); return
    }
    setPending(undefined); setOutput({ owner, value: dataOf(response) })
    const result = record(dataOf(response))
    const business = record(result?.data) ?? result
    const agentID = typeof business?.run_id === 'string' ? business.run_id : undefined
    const scenario = typeof business?.scenario_run_id === 'string'
    const id = agentID ?? extractExecutionId(dataOf(response))
    if (id !== undefined && owner !== undefined) {
      const next: Handle = { owner, tool: scenario ? 'scenario_run_get' : agentID !== undefined ? 'run_get' : name.startsWith('dag_') ? 'dag_queue_get' : 'execution_get', args: agentID !== undefined ? { run_id: id } : name.startsWith('dag_') ? { execution_id: id } : { executionID: id } }
      setHandle(next)
      try { localStorage.setItem(handleKey, JSON.stringify(next)) } catch { /* The original ledger remains authoritative. */ }
    }
    if (envelope?.isError === true) setError(true)
  }
  const run = () => perform(async () => {
    const args: unknown = JSON.parse(input)
    if (record(args) === undefined || selected === '') throw new Error('Invalid enterprise input')
    const schema = value?.tools.find(tool => tool.name === selected)?.inputSchema
    const revision = record(record(schema?.properties)?.revision_id)?.const
    if (typeof revision === 'number' && record(args)?.revision_id !== undefined && record(args)?.revision_id !== revision) throw new Error('Discovered revision changed')
    await execute(selected, { ...record(args), ...(typeof revision === 'number' ? { revision_id: revision } : {}), idempotency_key: record(args)?.idempotency_key ?? randomUUID() })
  })
  const displayed: EnterpriseResourceValue | undefined = original.value
  return <div className={css.container}>
    <div className={css.toolbar}>
      <select aria-label={t('activeTenant')} value={readActiveTenant() ?? ''} disabled={busy} onChange={(event) => { writeActiveTenant(event.target.value); setOutput(undefined); setPending(undefined); setHandle(undefined); refresh() }}>
        <option value="">{t('selectTenant')}</option>{tenants.map(tenant => <option key={tenant.code} value={String(tenant.id ?? tenant.code)}>{tenant.name ?? tenant.code}</option>)}
      </select>
      <button className={css.linkButton} disabled={busy || readActiveTenant() === undefined} onClick={() => { void perform(async () => { await authorize(); refresh() }) }}>{t('authorizeEnterprise')}</button>
      <button className={css.linkButton} disabled={busy} onClick={() => { void perform(async () => { await revoke(); refresh() }) }}>{t('revokeEnterprise')}</button>
      <button className={css.linkButton} disabled={busy} onClick={refresh}>{t('refresh')}</button>
    </div>
    <div className={`${css.workspace} ${css.enterpriseWorkspace}`}>
      {(error || catalog.status === 'failed') && <div role="alert" className={css.error}>{t('enterpriseUnavailable')}</div>}
      {catalog.status === 'loading' && <div role="status">{t('capabilityLoading')}</div>}
      {value !== undefined && <>
        <h2>{value.page.application.name}</h2>
        <div className={css.toolbar}>{value.page.sections.map(section => <button className={css.linkButton} key={section.id}
          disabled={busy} onClick={() => { setSelected(section.tool); void perform(() => execute(section.tool, {})) }}>
          {section.title}</button>)}</div>
        <label>{t('selectCapability')}<select className={css.capabilitySelect} value={selected} disabled={busy} onChange={(event) => { setSelected(event.target.value); setInput('{}'); setPending(undefined) }}><option value="">{t('selectCapability')}</option>{value.tools.map(tool => <option key={tool.name} value={tool.name}>{tool.name}</option>)}</select></label>
        {value.tools.find(tool => tool.name === selected) !== undefined && <details><summary>{t('inputSchema')}</summary><pre className={css.resultBody}>{JSON.stringify(value.tools.find(tool => tool.name === selected)?.inputSchema, null, 2)}</pre></details>}
        <textarea aria-label={t('jsonInputHint')} className={css.jsonInput} rows={5} value={input} disabled={busy} onChange={(event) => { setInput(event.target.value) }} />
        <button className={css.primaryButton} disabled={busy || selected === ''} onClick={() => { void run() }}>{busy ? t('running') : t('run')}</button>
      </>}
      {pending !== undefined && pending.owner === owner && <form onSubmit={(event) => { event.preventDefault(); void perform(async () => { const parsed = buildSchemaInput(pending.fields, form); if (!parsed.ok) throw new Error('Invalid form input'); await execute(pending.name, pending.args, { requestState: pending.state, inputResponses: { business_input: { action: 'accept', content: parsed.value } } }) }) }}>
        <p>{t('supplementalInput')}</p>{pending.fields.map(field => <label className={css.field} key={field.name}>{field.name}{field.enum !== undefined ? <select required value={form[field.name] ?? ''} disabled={busy} onChange={(event) => { setForm(previous => ({ ...previous, [field.name]: event.target.value })) }}><option value="">{t('fieldUnset')}</option>{field.enum.map(option => <option key={option}>{option}</option>)}</select> : <input required={field.required} value={form[field.name] ?? ''} disabled={busy} onChange={(event) => { setForm(previous => ({ ...previous, [field.name]: event.target.value })) }} />}</label>)}<button disabled={busy}>{t('submitInput')}</button><button type="button" disabled={busy} onClick={() => { setPending(undefined) }}>{t('dismissInput')}</button>
      </form>}
      {output !== undefined && output.owner === owner && <ResultValue value={output.value} t={t} />}
      {handle !== undefined && handle.owner === owner && <section><h3>{t('originalRun')}</h3><code>{JSON.stringify(handle.args)}</code><button disabled={busy} onClick={() => { void perform(() => execute(handle.tool === 'scenario_run_get' ? 'scenario_run_cancel' : handle.tool === 'run_get' ? 'run_control' : handle.tool === 'dag_queue_get' ? 'dag_run_cancel' : 'execution_cancel', { ...handle.args, ...(handle.tool === 'run_get' ? { action: 'cancel' } : {}), idempotency_key: randomUUID() })) }}>{t('requestCancel')}</button>{original.status === 'failed' && <p role="alert">{t('enterpriseUnavailable')}</p>}{displayed?.kind === 'result' && <ResultValue value={dataOf(displayed.result)} t={t} />}</section>}
    </div>
  </div>
}
