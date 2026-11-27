/** 解析云端 Swagger 的工作台新建声明，不进行授权或网络写入。 */
import { openApiCreateAction, openApiCreateTitle } from './openapi-create-action.ts'
import { field } from '../../business-forms/model.ts'
import { validDynamicKey, type DynamicField } from '../../business-forms/dynamic-record.ts'

/** 仅用于预览的字段定义，不携带写入地址和权限。 */
export interface CreatePreview {
  readonly operationId: string
  readonly title: string
  readonly aliases: readonly string[]
  readonly fields: readonly DynamicField[]
}

/** 经过检查的后端写入动作。仅留在宿主内存。 */
export interface DynamicCreate extends CreatePreview {
  readonly path: string
  readonly permission: string
  readonly receiptField: string
}

const pathPattern = /^\/api\/v1\/apps\/(?:shaoshi|deepseek-harness)(?:\/[a-zA-Z0-9_-]+)+$/u
const supportedSchemaKeys = new Set(['type', 'title', 'description', 'enum', 'format', 'nullable', 'maxLength', 'default', 'example', 'examples', 'x-enum-labels'])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionsFor(schema: Record<string, unknown>, type: DynamicField['type']) {
  if (schema.enum === undefined) return type === 'boolean' ? null : undefined
  if (!Array.isArray(schema.enum) || !schema.enum.length || schema.enum.length > 100) return null
  const labels = schema['x-enum-labels']
  const values: Array<{ value: string; label: string }> = []
  for (const value of schema.enum) {
    if (type === 'integer' ? !Number.isSafeInteger(value) : typeof value !== type) return null
    if (typeof value === 'number' && (!Number.isFinite(value) || !/^-?\d+(?:\.\d+)?$/u.test(String(value)))) return null
    if (typeof value === 'string' && (!value.trim() || value.includes('\0') || value.length > 8000)) return null
    const label = field(labels, String(value))
    if (typeof label !== 'string' || !label.trim() || label.length > 160) return null
    values.push({ value: String(value), label })
  }
  return new Set(values.map(option => option.value)).size === values.length ? values : null
}

function parseField(key: string, schema: unknown, required: boolean): DynamicField | undefined {
  if (!validDynamicKey(key) || !record(schema)) return
  const description = typeof schema.description === 'string' ? schema.description.split(' / ')[0]?.trim() : undefined
  const label = (typeof schema.title === 'string' ? schema.title.trim() : '') || description || key
  if (label.length > 160) return
  const supported = parseSupportedField(key, label, schema, required)
  if (supported) return supported
  const type = schema.type === 'integer' || schema.type === 'number' || schema.type === 'boolean' ? schema.type : 'string'
  // 逐字段降级：后台声明但模板不支持的字段保留定义，由界面标注、不参与提交。
  return { key, label, type, required, unsupported: true }
}

function parseSupportedField(key: string, label: string, schema: Record<string, unknown>, required: boolean): DynamicField | undefined {
  if (Object.keys(schema).some(key => !supportedSchemaKeys.has(key))) return
  const { type, format, maxLength, nullable } = schema
  if (nullable !== undefined && typeof nullable !== 'boolean') return
  if (type !== 'string' && type !== 'integer' && type !== 'number' && type !== 'boolean') return
  if (format !== undefined && !(type === 'string' && format === 'date')) return
  if (maxLength !== undefined && (type !== 'string' || typeof maxLength !== 'number'
    || !Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 8000)) return
  const options = optionsFor(schema, type)
  if (options === null) return
  const description = typeof schema.description === 'string' ? schema.description.split(' / ')[0]?.trim() : undefined
  return { key, label, type, required, ...(description ? { description: description.slice(0, 300) } : {}),
    ...(format === 'date' ? { format } : {}),
    ...(typeof maxLength === 'number' ? { maxLength } : {}), ...(options ? { options } : {}) }
}

function jsonSchema(node: unknown) {
  return field(field(field(node, 'content'), 'application/json'), 'schema') ?? field(node, 'schema')
}

function fieldsFor(schema: unknown, schemas: unknown) {
  const ref = field(schema, '$ref')
  const local = typeof ref === 'string' ? /^#\/(?:components\/schemas|definitions)\/([\w.-]+)$/u.exec(ref)?.[1] : undefined
  const resolved = local ? field(schemas, local) : schema
  if (!record(resolved) || (typeof ref === 'string' && (!local || !record(schema) || Object.keys(schema).length !== 1))) return
  if (Object.keys(resolved).some(key => !['type', 'title', 'description', 'properties', 'required', 'additionalProperties'].includes(key))) return
  const properties = field(resolved, 'properties'), required = Object.hasOwn(resolved, 'required') ? field(resolved, 'required') : []
  if (field(resolved, 'type') !== 'object' || !record(properties) || !Array.isArray(required)) return
  const keys = Object.keys(properties)
  if (!keys.length || keys.length > 100 || !required.every(key => validDynamicKey(key) && Object.hasOwn(properties, key))) return
  const fields: DynamicField[] = []
  for (const key of keys) {
    const parsed = parseField(key, properties[key], required.includes(key))
    if (!parsed) return
    fields.push(parsed)
  }
  // 必填字段无法渲染时不能生成提交表单，避免遗漏后台要求的字段。
  if (fields.some(def => def.required && def.unsupported)) return
  return fields
}

function requestFields(item: unknown, post: unknown, schemas: unknown) {
  if (field(item, 'parameters') !== undefined) return
  const rawParameters = field(post, 'parameters')
  const parameters: readonly unknown[] | undefined = Array.isArray(rawParameters) ? rawParameters : undefined
  const requestBody = field(post, 'requestBody')
  const body = requestBody ?? (parameters?.length === 1 && field(parameters[0], 'in') === 'body' ? parameters[0] : undefined)
  if (requestBody !== undefined && rawParameters !== undefined && parameters?.length !== 0) return
  return fieldsFor(jsonSchema(body), schemas)
}

/** 从受支持的静态新增接口提取可编辑字段，无需登记权限或回执。 */
export function parseCreatePreviews(doc: unknown): readonly CreatePreview[] {
  const paths = field(doc, 'paths')
  if (!record(paths)) return []
  const schemas = field(field(doc, 'components'), 'schemas') ?? field(doc, 'definitions')
  const previews: CreatePreview[] = []
  for (const [path, item] of Object.entries(paths)) {
    if (!pathPattern.test(path)) continue
    const post = field(item, 'post')
    const operationId = field(post, 'operationId')
    const title = openApiCreateTitle(post)
    if (typeof operationId !== 'string' || !/^[\w.-]{1,160}$/u.test(operationId) || !title || title.length > 128) continue
    const fields = requestFields(item, post, schemas)
    if (fields) previews.push({ operationId, title, aliases: [title, path.split('/').at(-1) ?? '', operationId], fields })
  }
  return uniqueOperations(previews)
}

function uniqueOperations<T extends CreatePreview>(operations: readonly T[]): readonly T[] {
  const counts = new Map<string, number>()
  for (const action of operations) counts.set(action.operationId, (counts.get(action.operationId) ?? 0) + 1)
  return operations.filter(action => counts.get(action.operationId) === 1)
}

/** 扫描写操作的请求体，按 operationId 提供可渲染字段，供固定流程复用同一份契约。 */
export function parseOperationForms(doc: unknown): ReadonlyMap<string, readonly DynamicField[]> {
  const paths = field(doc, 'paths')
  const schemas = field(field(doc, 'components'), 'schemas') ?? field(doc, 'definitions')
  const forms = new Map<string, readonly DynamicField[]>()
  if (!record(paths)) return forms
  for (const item of Object.values(paths)) {
    if (!record(item)) continue
    for (const method of ['post', 'put', 'patch'] as const) {
      const operation = field(item, method)
      if (!record(operation)) continue
      const operationId = field(operation, 'operationId')
      if (typeof operationId !== 'string' || forms.has(operationId)) continue
      const fields = fieldsFor(jsonSchema(field(operation, 'requestBody')), schemas)
      if (fields) forms.set(operationId, fields)
    }
  }
  return forms
}

/** 仅接入有明确权限、字段与回执定义的静态地址 POST。 */
export function parseDynamicCreates(doc: unknown): readonly DynamicCreate[] {
  const paths = field(doc, 'paths')
  if (!record(paths)) return []
  const schemas = field(field(doc, 'components'), 'schemas') ?? field(doc, 'definitions')
  const actions: DynamicCreate[] = []
  for (const [path, item] of Object.entries(paths)) {
    if (!pathPattern.test(path)) continue
    const post = field(item, 'post'), declaration = field(post, 'x-yuanshu-workbench-create')
    const action = declaration === undefined ? openApiCreateAction(path, post, schemas) : declaration
    const operationId = field(post, 'operationId'), title = field(action, 'title'), aliases = field(action, 'aliases')
    const permission = field(action, 'permission'), receiptField = field(action, 'receipt_field')
    if (field(action, 'version') !== 1 || !validDynamicKey(receiptField)
      || typeof operationId !== 'string' || !/^[\w.-]{1,160}$/u.test(operationId)
      || typeof title !== 'string' || !title.trim() || title.length > 128
      || typeof permission !== 'string' || !/^[\w.:-]{1,256}$/u.test(permission)
      || !Array.isArray(aliases) || aliases.length > 32 || !aliases.every(alias => typeof alias === 'string' && alias.trim() && alias.length <= 128)) continue
    const fields = requestFields(item, post, schemas)
    if (fields) actions.push({ operationId, path, title,
      aliases: [title, ...aliases.filter((alias: unknown): alias is string => typeof alias === 'string')],
      permission, fields, receiptField })
  }
  return uniqueOperations(actions)
}
