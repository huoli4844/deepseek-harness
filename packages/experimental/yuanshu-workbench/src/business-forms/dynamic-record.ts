/** 运行时登记字段及值转换。宿主与客户端共享，不依赖网络或视图框架。 */
import { field } from './model.ts'

/** 当前编辑模板支持的请求字段。 */
export interface DynamicField {
  readonly key: string
  readonly label: string
  readonly type: 'string' | 'integer' | 'number' | 'boolean'
  readonly required: boolean
  readonly format?: 'date'
  readonly maxLength?: number
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  /** 后台契约声明但当前模板无法渲染的字段；不渲染也不提交。 */
  readonly unsupported?: boolean
  /** 字段说明，仅用于提示，不参与提交。 */
  readonly description?: string
}

/** 传给客户端的投影仅含表单定义，不包含执行地址和权限标识。 */
export interface DynamicDraft {
  readonly id: string
  readonly kind: 'dynamic'
  readonly title: string
  readonly fields: readonly DynamicField[]
  readonly content: Readonly<Record<string, string>>
  readonly receipt?: string
  readonly uncertain?: boolean
  readonly preview?: boolean
  readonly simulated?: boolean
}

const fieldKey = /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/u

/** 验证字段标识，拒绝对象原型属性。 */
export function validDynamicKey(key: unknown): key is string {
  return typeof key === 'string' && fieldKey.test(key) && !Object.hasOwn(Object.prototype, key) && key !== 'prototype'
}

/** 预填只接受正式字段，能够唯一匹配中文标签时写入原枚举值。 */
export function dynamicPrefill(fields: readonly DynamicField[], input: unknown): Record<string, string> {
  return Object.fromEntries(fields.flatMap((def) => {
    if (def.unsupported) return []
    const raw = field(input, def.key)
    if (typeof raw !== 'string' || raw.length > 8000) return []
    const exact = def.options?.find(option => option.value === raw)
    const labels = def.options?.filter(option => option.label === raw)
    return [[def.key, exact?.value ?? (labels?.length === 1 ? labels[0]?.value : raw) ?? raw]]
  }))
}

function valueOf(def: DynamicField, raw: string): string | number | boolean | undefined {
  if (raw.includes('\0') || raw.length > 8000 || (def.maxLength !== undefined && Array.from(raw).length > def.maxLength)) return
  if (def.options && !def.options.some(option => option.value === raw)) return
  if (def.format === 'date') {
    const date = new Date(raw)
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== raw) return
  }
  if (def.type === 'string') return raw
  if (def.type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(raw)) return
  const number = Number(raw)
  return (def.type === 'integer' ? Number.isSafeInteger(number) : Number.isFinite(number)) ? number : undefined
}

/** 同时校验和转换。空的选填项交由后台应用默认值。 */
export function dynamicPayload(fields: readonly DynamicField[], input: unknown) {
  const invalid: string[] = []
  const values: Array<[string, string | number | boolean]> = []
  for (const def of fields) {
    if (def.unsupported) continue
    const raw = field(input, def.key)
    if (raw === undefined || raw === '') {
      if (def.required) invalid.push(def.key)
      continue
    }
    const value = typeof raw === 'string' && raw.trim() ? valueOf(def, raw) : undefined
    if (value === undefined) invalid.push(def.key)
    else values.push([def.key, value])
  }
  return { invalid, payload: Object.fromEntries(values) }
}

function isDynamicField(value: unknown): value is DynamicField {
  const type = field(value, 'type'), format = field(value, 'format'), maxLength = field(value, 'maxLength')
  const label = field(value, 'label'), options = field(value, 'options')
  const unsupported = field(value, 'unsupported'), description = field(value, 'description')
  if (!validDynamicKey(field(value, 'key')) || typeof label !== 'string' || label.length > 160
    || typeof field(value, 'required') !== 'boolean'
    || (type !== 'string' && type !== 'integer' && type !== 'number' && type !== 'boolean')) return false
  if (format !== undefined && format !== 'date') return false
  if (unsupported !== undefined && unsupported !== true) return false
  if (description !== undefined && (typeof description !== 'string' || description.length > 300)) return false
  if (maxLength !== undefined && (typeof maxLength !== 'number' || !Number.isSafeInteger(maxLength)
    || maxLength < 1 || maxLength > 8000)) return false
  return options === undefined || (Array.isArray(options) && options.length <= 100
    && options.every(option => typeof field(option, 'value') === 'string' && typeof field(option, 'label') === 'string'))
}

/** 校验单个字段投影，供其他业务复用。 */
export function parseDynamicField(value: unknown): DynamicField | undefined {
  return isDynamicField(value) ? value : undefined
}

/** 校验同源表单投影，丢弃与显示无关的属性。 */
export function parseDynamicDraft(value: unknown): DynamicDraft | undefined {
  const id = field(value, 'id'), title = field(value, 'title'), fields = field(value, 'fields')
  if (field(value, 'kind') !== 'dynamic' || typeof id !== 'string' || !/^[0-9a-f-]{36}$/u.test(id)
    || typeof title !== 'string' || title.length > 128 || !Array.isArray(fields) || !fields.length
    || fields.length > 100 || !fields.every(isDynamicField) || new Set(fields.map(def => def.key)).size !== fields.length) return
  const receipt = field(value, 'receipt')
  const preview = field(value, 'preview') === true
  return { id, title, kind: 'dynamic', fields, content: dynamicPrefill(fields, field(value, 'content')),
    ...(preview ? { preview, simulated: field(value, 'simulated') === true }
      : { ...(typeof receipt === 'string' ? { receipt } : {}), ...(field(value, 'uncertain') === true ? { uncertain: true } : {}) }) }
}
