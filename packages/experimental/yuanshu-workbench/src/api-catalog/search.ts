/** 只读查询目录的检索：按关键词、模块与参数名匹配，纯函数不发起请求。 */
import type { ApiCatalogEntry } from './model.ts'

/** 检索条件。 */
export interface ApiSearchOptions {
  /** 模块名，例如 `apps/shaoshi`；提供时先按模块过滤。 */
  readonly tag?: string
  /** 返回条数上限，默认 8，最多 20。 */
  readonly limit?: number
}

/** 默认返回条数。 */
const DEFAULT_LIMIT = 8
/** 返回条数上限，避免一次罗列整库接口。 */
const MAX_LIMIT = 20

/**
 * 在目录中检索接口，按命中位置打分后取前若干条。
 * @param catalog - 只读查询目录。
 * @param query - 员工原话或关键词，可为空；为空时按模块列目录。
 * @param options - 模块与条数限制。
 * @returns 命中的目录条目，按相关度降序。
 */
export function searchApiCatalog(catalog: readonly ApiCatalogEntry[], query: string,
  options: ApiSearchOptions = {}): readonly ApiCatalogEntry[] {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const tag = options.tag?.trim().toLowerCase()
  const scoped = tag === undefined || tag === '' ? catalog : catalog.filter(entry => entry.tag.toLowerCase() === tag)
  const tokens = tokenize(query)
  if (tokens.length === 0) return scoped.slice(0, limit)
  const normalized = query.trim().toLowerCase()
  const scored = scoped.map(entry => ({ entry, score: scoreEntry(entry, tokens, normalized) }))
    .filter(item => item.score > 0)
  scored.sort((left, right) => right.score - left.score || left.entry.path.localeCompare(right.entry.path))
  return scored.slice(0, limit).map(item => item.entry)
}

/**
 * 拆分检索词：整句保留，英文按单词、中文按相邻两字补充，便于匹配中文说明。
 * @param query - 检索词。
 * @returns 去重后的检索词。
 */
function tokenize(query: string): readonly string[] {
  const whole = query.trim().toLowerCase()
  if (whole === '') return []
  const words = whole.split(/[\s,，、;；/|]+/u).filter(word => word !== '')
  const grams = Array.from(whole).filter(char => /[\u4e00-\u9fff]/u.test(char))
    .flatMap((_char, index, chars) => {
      const current = chars[index]
      const next = chars[index + 1]
      return current !== undefined && next !== undefined ? [current + next] : []
    })
  return [...new Set([whole, ...words, ...grams])]
}

/**
 * 单条目录的匹配得分。
 * @param entry - 目录条目。
 * @param tokens - 检索词。
 * @param whole - 完整检索词，用于整句命中加分。
 * @returns 得分，0 表示不相关。
 */
function scoreEntry(entry: ApiCatalogEntry, tokens: readonly string[], whole: string): number {
  const path = entry.path.toLowerCase()
  const summary = entry.summary.toLowerCase()
  const tag = entry.tag.toLowerCase()
  const params = entry.params.map(param => param.name.toLowerCase())
  let score = 0
  if (summary.includes(whole)) score += 12
  if (path.includes(whole)) score += 8
  if (tag === whole) score += 10
  for (const token of tokens) {
    if (token.length < 2 && !/[\u4e00-\u9fff]/u.test(token)) continue
    if (tag === token) score += 6
    else if (tag.includes(token)) score += 3
    if (summary.includes(token)) score += 4
    if (path.includes(token)) score += 3
    if (params.some(name => name.includes(token))) score += 2
  }
  return score
}

/**
 * 把命中的目录条目转成模型可读的精简结构。
 * @param entries - 命中的目录条目。
 * @returns 可直接序列化的条目数组。
 */
export function apiEntriesToWire(entries: readonly ApiCatalogEntry[]): readonly object[] {
  return entries.map(entry => ({
    path: entry.path,
    summary: entry.summary,
    tag: entry.tag,
    params: entry.params.map(param => ({
      name: param.name,
      in: param.in,
      type: param.type,
      required: param.required,
      ...(param.description === '' ? {} : { description: param.description }),
    })),
  }))
}
