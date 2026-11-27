/** 管理会话中的运行时表单与人工提交。不向模型暴露写入、凭证或执行地址。 */
import { randomUUID } from 'node:crypto'
import { dynamicPayload, dynamicPrefill, type DynamicDraft } from '../../business-forms/dynamic-record.ts'
import { field } from '../../business-forms/model.ts'
import type { EmployeeAccessStore } from '../../employee-access.ts'
import type { BusinessForms } from '../yuanshu-business-forms/index.ts'
import { ReportRequestError, type Credential } from '../yuanshu-work-records/index.ts'
import type { CreatePreview, DynamicCreate } from './dynamic-catalog.ts'
import type { createSwaggerLookup } from './swagger-create-catalog.ts'

import { checkActionAccess } from './action-access.ts'
interface EntryState {
  readonly at: number
  draft: DynamicDraft
  writing: boolean
}
type Entry = EntryState & (
  | { readonly mode: 'live'; readonly action: DynamicCreate }
  | { readonly mode: 'preview'; readonly action: CreatePreview }
)

const definiteRejection = new Set([400, 401, 403, 404, 409, 422, 429])
const successCode = new Set(['0', '200', '201'])

/** 只将明确的字段校验提示投影给界面。 */
export class DynamicValidationError extends ReportRequestError {
  constructor(status: number, readonly detail: string) { super(status) }
}

function writeFailure(status: number, body: unknown): ReportRequestError {
  if (status !== 400 && status !== 422) return new ReportRequestError(status)
  const raw = field(body, 'message')
  const message = typeof raw === 'string' ? raw.trim() : ''
  if (!message || message.length > 500 || /[<>\p{Cc}]/u.test(message)
    || /(?:https?:\/\/|\bbearer\b|\bSQLSTATE\b|\bpanic:)/iu.test(message)) return new ReportRequestError(status)
  return new DynamicValidationError(status, message)
}

/** 建立可热更新的宿主表单注册表，人工提交时重新验证契约和权限。 */
export function createDynamicRegistry(forms: BusinessForms, lookup: ReturnType<typeof createSwaggerLookup>,
  api: string, lifetime: AbortSignal, access?: Pick<EmployeeAccessStore, 'read'>, previewEnabled = false) {
  const drafts = new Map<string, Entry>()
  const pending = (session: string) => {
    const entry = drafts.get(session)
    return entry && (entry.writing || Date.now() - entry.at < 30 * 60_000) ? entry : undefined
  }

  async function send(action: DynamicCreate, values: object, credential: Credential, signal: AbortSignal): Promise<string> {
    const endpoint = new URL(action.path, api)
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, lifetime, AbortSignal.timeout(20_000)]),
      headers: { authorization: credential.authorization, 'X-Active-Tenant': credential.tenant, 'content-type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!response.ok) {
      const rejected: unknown = response.status === 400 || response.status === 422
        ? await response.json().catch(() => null) : null
      throw writeFailure(response.status, rejected)
    }
    const json: unknown = await response.json()
    const code = field(json, 'code')
    if (field(json, 'success') === false || (code !== undefined && !((typeof code === 'number' || typeof code === 'string') && successCode.has(String(code))))) {
      const status = typeof code === 'number' || typeof code === 'string' ? Number(code) : NaN
      throw writeFailure(definiteRejection.has(status) ? status : 502, json)
    }
    const receipt = field(field(json, 'data') ?? json, action.receiptField)
    if (typeof receipt === 'string' && receipt.trim() && receipt.length <= 256) return receipt
    if (typeof receipt === 'number' && Number.isSafeInteger(receipt) && receipt > 0) return String(receipt)
    throw new ReportRequestError(502)
  }

  function state(session: string, action: CreatePreview, input: unknown): EntryState {
    for (const key of drafts.keys()) if (!pending(key)) drafts.delete(key)
    if (drafts.has(session) || drafts.size >= 100) throw new ReportRequestError(409)
    const draft: DynamicDraft = { id: randomUUID(), kind: 'dynamic', title: action.title, fields: action.fields,
      content: dynamicPrefill(action.fields, input) }
    return { draft, at: Date.now(), writing: false }
  }

  return {
    pending: (session: string) => pending(session)?.draft,
    dismiss(session: string, id: unknown) {
      const entry = pending(session)
      if (entry && entry.draft.id === id && !entry.writing) drafts.delete(session)
    },
    open(session: string, action: DynamicCreate, input: unknown) {
      if (previewEnabled) throw new ReportRequestError(403)
      drafts.set(session, { ...state(session, action, input), action, mode: 'live' })
    },
    openPreview(session: string, action: CreatePreview, input: unknown) {
      if (!previewEnabled) throw new ReportRequestError(403)
      const entry = state(session, action, input)
      drafts.set(session, { ...entry, draft: { ...entry.draft, preview: true }, action, mode: 'preview' })
    },
    async submit(session: string, credential: Credential, input: unknown, signal: AbortSignal) {
      forms.browser(session, credential)
      const entry = pending(session)
      if (!entry || entry.draft.id !== field(input, 'id')) throw new ReportRequestError(404)
      if (entry.writing || entry.draft.uncertain) throw new ReportRequestError(409)
      if (entry.draft.receipt) return { receipt: entry.draft.receipt }
      const content = field(input, 'content')
      if (typeof content !== 'object' || content === null || Array.isArray(content)) throw new ReportRequestError(400)
      const { invalid, payload } = dynamicPayload(entry.action.fields, content)
      if (invalid.length) throw new ReportRequestError(422)
      if (entry.mode === 'preview') {
        signal.throwIfAborted()
        entry.draft = { ...entry.draft, simulated: true, content: dynamicPrefill(entry.action.fields, content) }
        return { simulated: true }
      }
      entry.writing = true
      let dispatched = false
      try {
        const current = await lookup.dynamicOperation(entry.action.operationId)
        if (!current || JSON.stringify(current) !== JSON.stringify(entry.action)) throw new ReportRequestError(412)
        const result = await checkActionAccess(forms, forms.browser(session, credential), access, current.permission)
        if (result !== 'permission_granted') throw new ReportRequestError(403)
        signal.throwIfAborted()
        dispatched = true
        const receipt = await send(entry.action, payload, credential, signal)
        entry.draft = { ...entry.draft, receipt }
        return { receipt }
      } catch (error) {
        if (!dispatched || (error instanceof ReportRequestError && definiteRejection.has(error.status))) throw error
        entry.draft = { ...entry.draft, content: dynamicPrefill(entry.action.fields, content), uncertain: true }
        throw new ReportRequestError(502)
      } finally {
        entry.writing = false
      }
    },
  }
}
