#!/usr/bin/env node
/**
 * 从 Swagger/OpenAPI 快照生成本地只读查询目录。
 * 只收录 GET、剔除导出/下载/模板/流式接口，输出供宿主检索与调用的静态数据。
 * 后台接口更新后重跑：node scripts/generate-api-catalog.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const input = resolve(process.argv[2] ?? resolve(here, '../../../../../swagger/openapi.json'))
const output = resolve(process.argv[3] ?? resolve(here, '../src/api-catalog/catalog.generated.ts'))

/** 路径片段精确命中时剔除：导出、下载、模板与流式响应无法作为结构化查询结果。 */
const excludedSegment = /(?:^|\/)(?:exports?|downloads?|templates?|stream)(?:\/|$)/iu
/** 摘要出现这些动作时同样剔除。 */
const excludedSummary = /导出|下载|模板|流式|打包/u
const methods = ['get']

const doc = JSON.parse(await readFile(input, 'utf8'))
const paths = doc?.paths
if (typeof paths !== 'object' || paths === null) throw new Error('OpenAPI 缺少 paths')

const text = (value, max) => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().slice(0, max) : ''

/** 合并路径级与操作级参数，操作级覆盖同名同位置定义，仅保留路径与查询参数。 */
function readParams(item, operation) {
  const merged = new Map()
  for (const raw of [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
    if (typeof raw !== 'object' || raw === null) continue
    if (raw.in !== 'path' && raw.in !== 'query') continue
    if (typeof raw.name !== 'string' || raw.name === '') continue
    const schema = typeof raw.schema === 'object' && raw.schema !== null ? raw.schema : {}
    const type = typeof schema.type === 'string' ? schema.type : 'string'
    merged.set(`${raw.in}:${raw.name}`, {
      name: raw.name,
      in: raw.in,
      type,
      required: raw.required === true || raw.in === 'path',
      description: text(raw.description, 60),
    })
  }
  return [...merged.values()]
}

const entries = []
/** 解析 OpenAPI $ref 到组件 schema，限制深度防止循环引用。 */
function resolveRef(schema, depth = 0) {
  if (typeof schema !== 'object' || schema === null || depth > 4) return schema
  const ref = typeof schema.$ref === 'string' ? schema.$ref : ''
  if (ref.startsWith('#/components/schemas/')) {
    const target = doc.components?.schemas?.[ref.slice('#/components/schemas/'.length)]
    return resolveRef(target, depth + 1)
  }
  return schema
}

/** 从记录数组 schema 中提取字段的中文说明；无说明字段不收录。 */
function readFields(operation) {
  const content = operation.responses?.['200']?.content
  const root = resolveRef(content?.['application/json']?.schema)
  // 常见包装结构：data 直接是数组，或 data.items 是数组。
  const data = resolveRef(root?.properties?.data)
  const rowsSchema = resolveRef(data?.type === 'array' ? data.items : resolveRef(data?.properties?.items)?.items)
  const properties = rowsSchema?.type === 'object' ? rowsSchema.properties : undefined
  if (typeof properties !== 'object' || properties === null) return []
  const fields = []
  for (const [name, raw] of Object.entries(properties)) {
    const description = text(resolveRef(raw)?.description, 40)
    // 该后台泛型包装的响应多为「中文说明：字段 x / field x」样板文案，无信息量，跳过。
    if (description === '' || /^中文说明：字段 \S+ \/ field/u.test(description)) continue
    fields.push({ name, description })
    if (fields.length >= 40) break
  }
  return fields
}

for (const [path, item] of Object.entries(paths)) {
  if (typeof item !== 'object' || item === null) continue
  if (!path.startsWith('/api/v1/')) continue
  for (const method of methods) {
    const operation = item[method]
    if (typeof operation !== 'object' || operation === null) continue
    const summary = text(operation.summary, 120)
    if (excludedSegment.test(path) || excludedSummary.test(summary)) continue
    // 只收录 JSON 响应；二进制预览/字节流无法作为结构化查询结果返回给模型。
    const content = operation.responses?.['200']?.content
    if (typeof content === 'object' && content !== null && !Object.hasOwn(content, 'application/json')) continue
    const tag = Array.isArray(operation.tags) && typeof operation.tags[0] === 'string' ? operation.tags[0] : ''
    entries.push({ path, summary, tag, params: readParams(item, operation), fields: readFields(operation) })
  }
}

entries.sort((a, b) => a.path.localeCompare(b.path))

/** 生成为单引号字符串，避免生成文件触发仓库风格规则。 */
const quote = (value) => `'${JSON.stringify(value).slice(1, -1).replace(/'/gu, "\\'")}'`
/** 数据行保持单行，便于和 Swagger 快照逐行比对。 */
const renderEntry = (entry) => {
  const params = entry.params.map(param => `{ name: ${quote(param.name)}, in: ${quote(param.in)}, type: ${quote(param.type)}, required: ${param.required}, description: ${quote(param.description)} }`)
  const fields = entry.fields.map(field => `{ name: ${quote(field.name)}, description: ${quote(field.description)} }`)
  return `  { path: ${quote(entry.path)}, summary: ${quote(entry.summary)}, tag: ${quote(entry.tag)}, params: [${params.join(', ')}], fields: [${fields.join(', ')}] },`
}
const lines = entries.map(renderEntry)
const source = [
  '/** 由 scripts/generate-api-catalog.mjs 生成；请勿手工修改。数据来源：swagger/openapi.json。 */',
  "import type { ApiCatalogEntry } from './model.ts'",
  '',
  '/** 可供员工实时查询的只读 GET 接口，按路径排序。 */',
  'export const API_CATALOG: readonly ApiCatalogEntry[] = [',
  ...lines,
  ']',
  '',
].join('\n')

await mkdir(dirname(output), { recursive: true })
await writeFile(output, source)
console.log(`已生成 ${entries.length} 个只读查询接口 → ${output}`)
