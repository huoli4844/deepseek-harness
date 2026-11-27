/** 发现业务应用公开的新增契约。目录仅供查询，不能授予写入权限或注册路由。 */
import { openApiCreateTitle } from './openapi-create-action.ts'
import { parseCreatePreviews, parseDynamicCreates, parseOperationForms } from './dynamic-catalog.ts'
import { field } from '../../business-forms/model.ts'

interface CreateOperation {
  readonly object: string
  readonly path: string
  readonly aliases: readonly string[]
  readonly fields: readonly string[]
}

const apps = /^\/api\/v1\/apps\/(?:shaoshi|deepseek-harness)\//u
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const
const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase()

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOperations(doc: unknown) {
  const paths = field(doc, 'paths')
  if (!object(paths)) throw new Error('无效的 Swagger 路由目录')
  return Object.entries(paths).flatMap(([path, entry]) => methods.flatMap((method) => {
    const operation = field(entry, method)
    if (!object(operation)) return []
    const summary = field(operation, 'summary')
    const id = field(operation, 'operationId')
    const declared = field(operation, 'x-yuanshu-workbench-permission') ?? field(field(operation, 'x-yuanshu-workbench-create'), 'permission')
    const permission = typeof declared === 'string' && /^[\w.:-]{1,256}$/u.test(declared) ? declared : undefined
    return [{ permission, path, method: method.toUpperCase(), summary: typeof summary === 'string' ? summary.slice(0, 200) : '',
      operationId: typeof id === 'string' ? id.slice(0, 160) : '' }]
  }))
}

/** 提取业务应用中声明为创建的 POST，外部引用及非对象请求体不作为字段来源。 */
export function parseSwaggerCreates(doc: unknown): readonly CreateOperation[] {
  const paths = field(doc, 'paths')
  if (!object(paths)) throw new Error('无效的 Swagger 路由目录')
  const schemas = field(field(doc, 'components'), 'schemas')
  return Object.entries(paths).flatMap(([path, item]) => {
    if (!apps.test(path)) return []
    const post = field(item, 'post')
    const label = openApiCreateTitle(post)
    if (!label) return []
    const body = field(post, 'requestBody')
    const schema = field(field(field(body, 'content'), 'application/json'), 'schema')
    const ref = field(schema, '$ref')
    const local = typeof ref === 'string' ? /^#\/components\/schemas\/([\w.-]+)$/u.exec(ref)?.[1] : undefined
    const resolved = local ? field(schemas, local) : schema
    const properties = field(resolved, 'properties')
    const operationId = field(post, 'operationId')
    const resource = path.split('/').at(-1) ?? ''
    return [{
      object: label, path, aliases: [label, resource, ...(typeof operationId === 'string' ? [operationId] : [])].map(normalize),
      fields: object(properties) ? Object.keys(properties).slice(0, 100) : [],
    }]
  })
}

/** 查找同名创建操作，避免将不同业务应用里的同名对象自动视为同一动作。 */
export function findSwaggerCreate(operations: readonly CreateOperation[], target: string) {
  const query = normalize(target)
  const matches = operations.filter(operation => operation.aliases.includes(query))
  if (matches.length > 1) return { state: 'ambiguous', candidates: matches.slice(0, 10).map(item => ({
    object: item.object, path: item.path,
  })) }
  const [match] = matches
  if (!match) return { state: 'unknown' }
  return { state: 'documented', object: match.object, fields: match.fields,
    reason: '云端已发布新增接口，但当前对话动态表单缺少可用字段、权限或成功回执契约，无法安全生成复核表单。此状态只说明对话动态表单未就绪，不代表工作台独立业务页面未接入。' }
}

/** 同一个宿主合并目录请求，成功后短期复用；失败不等同于查无接口。 */
export function createSwaggerLookup(api: string, signal: AbortSignal, previewEnabled = false) {
  interface Catalog {
    readonly dynamic: ReturnType<typeof parseDynamicCreates>
    readonly previews: ReturnType<typeof parseCreatePreviews>
    readonly creates: readonly CreateOperation[]
    readonly operations: ReturnType<typeof parseOperations>
    readonly forms: ReturnType<typeof parseOperationForms>
  }
  let cache: { readonly until: number; readonly catalog: Catalog } | undefined
  let pending: Promise<Catalog> | undefined
  let retryAt = 0

  async function load() {
    const response = await fetch(`${api.replace(/\/+$/u, '')}/swagger/doc.json`, {
      redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    })
    if (!response.ok) throw new Error('无法读取 Swagger')
    const doc: unknown = await response.json()
    const catalog = { dynamic: parseDynamicCreates(doc), previews: previewEnabled ? parseCreatePreviews(doc) : [],
      creates: parseSwaggerCreates(doc), operations: parseOperations(doc), forms: parseOperationForms(doc) }
    cache = { until: Date.now() + 300_000, catalog }
    return catalog
  }

  async function read(refresh: boolean): Promise<Catalog | undefined> {
    if (!pending && !refresh && cache && cache.until > Date.now()) return cache.catalog
    if (!pending && Date.now() < retryAt) return undefined
    pending ??= load().catch((error: unknown) => {
      retryAt = Date.now() + 15_000
      throw error
    }).finally(() => { pending = undefined })
    try {
      return await pending
    } catch {
      return undefined
    }
  }

  return {
    async refresh() {
      return (await read(true))?.operations.length
    },
    async dynamicTargets(target: string) {
      const catalog = await read(false)
      return catalog?.dynamic.filter(action => action.aliases.some(alias => normalize(alias) === normalize(target)))
    },
    async dynamicOperation(operationId: string) {
      const catalog = await read(false)
      return catalog?.dynamic.find(action => action.operationId === operationId)
    },
    async previewTargets(target: string) {
      const catalog = await read(false)
      return catalog?.previews.filter(action => action.aliases.some(alias => normalize(alias) === normalize(target)))
    },
    async previewOperation(operationId: string) {
      return (await read(false))?.previews.find(action => action.operationId === operationId)
    },
    async operationFields(operationId: string) {
      return (await read(false))?.forms.get(operationId)
    },
    async findCreate(target: string) {
      const catalog = await read(false)
      return catalog ? findSwaggerCreate(catalog.creates, target) : { state: 'catalog_unavailable' }
    },
    async search(query: string) {
      const catalog = await read(false)
      if (!catalog) return { state: 'catalog_unavailable' }
      const words = normalize(query).split(/\s+/u)
      const matches = catalog.operations.filter((operation) => {
        const text = normalize(`${operation.method} ${operation.summary} ${operation.path} ${operation.operationId}`)
        return words.every(word => text.includes(word))
      })
      return { state: 'documented', operations: matches.slice(0, 12), total: matches.length }
    },
  }
}
