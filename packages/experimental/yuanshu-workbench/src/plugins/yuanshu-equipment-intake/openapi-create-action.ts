/** 将已有新增接口的权限和回执定义转换成通用表单动作。不进行授权或网络调用。 */
import { field } from '../../business-forms/model.ts'

const creationTitle = /^(?:创建|新增|新建|添加)\s*(?:少仕\s*)?(.+)$/u

/** Swagger 标题首段使用业务名称。 */
export function openApiCreateTitle(operation: unknown): string | undefined {
  const summary = field(operation, 'summary')
  if (typeof summary !== 'string') return
  return creationTitle.exec(summary.split(' / ')[0]?.trim() ?? '')?.[1]?.trim()
}

function resolveSchema(schema: unknown, schemas: unknown): unknown {
  const ref = field(schema, '$ref')
  if (typeof ref !== 'string') return schema
  const key = /^#\/components\/schemas\/([\w.-]+)$/u.exec(ref)?.[1]
  return key ? field(schemas, key) : undefined
}

function hasReceiptId(schema: unknown): boolean {
  const id = field(field(schema, 'properties'), 'id')
  const type = field(id, 'type'), required = field(schema, 'required')
  return Array.isArray(required) && required.includes('id') && (type === 'integer' || type === 'string')
}

function declaresReceipt(operation: unknown, schemas: unknown): boolean {
  const responses = field(operation, 'responses')
  return ['200', '201'].some((status) => {
    const content = field(field(responses, status), 'content')
    const schema = resolveSchema(field(field(content, 'application/json'), 'schema'), schemas)
    const data = resolveSchema(field(field(schema, 'properties'), 'data'), schemas)
    return hasReceiptId(schema) || hasReceiptId(data)
  })
}

/** 复用 Swagger 接口权限声明和成功响应。 */
export function openApiCreateAction(path: string, operation: unknown, schemas: unknown) {
  const title = openApiCreateTitle(operation)
  const permission = field(operation, 'x-yuanshu-workbench-permission')
  if (!title || typeof permission !== 'string' || !declaresReceipt(operation, schemas)) return
  const resource = path.split('/').at(-1) ?? ''
  return { version: 1, title, permission, aliases: [resource], receipt_field: 'id' }
}
