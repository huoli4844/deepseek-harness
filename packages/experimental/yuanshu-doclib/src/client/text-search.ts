/** 预览内文本搜索纯函数：按字面量返回全部匹配区间与命中数，不依赖 React、DOM 或请求。 */

/** 单次渲染的高亮上限：命中过多时只标记前若干处，避免一次生成上万个节点。 */
export const MAX_TEXT_MATCHES = 1000

/** 一处匹配的字符区间，`end` 不包含在内。 */
export interface TextSearchMatch {
  readonly start: number
  readonly end: number
}

/** 搜索结果：可高亮的区间与完整命中数。 */
export interface TextSearchResult {
  readonly matches: readonly TextSearchMatch[]
  /** 完整命中数；超过 {@link MAX_TEXT_MATCHES} 时大于 `matches.length`。 */
  readonly total: number
}

const EMPTY_RESULT: TextSearchResult = { matches: [], total: 0 }

/**
 * 查找文本中的全部字面量匹配（不做正则解析）。
 * 不区分大小写时用两份小写文本定位；个别字符小写后会改变长度，位置仍按原串下标对齐，
 * 极端字符可能错位，但不影响常规中英文文档。
 * @param text - 待搜索的预览文本。
 * @param query - 搜索关键字，空串表示未搜索。
 * @param caseSensitive - 是否区分大小写。
 * @returns 前 {@link MAX_TEXT_MATCHES} 处匹配区间与完整命中数。
 */
export function findTextMatches(text: string, query: string, caseSensitive: boolean): TextSearchResult {
  if (query === '') return EMPTY_RESULT
  const haystack = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: TextSearchMatch[] = []
  let total = 0
  let from = 0
  for (;;) {
    const start = haystack.indexOf(needle, from)
    if (start === -1) break
    total += 1
    if (matches.length < MAX_TEXT_MATCHES) matches.push({ start, end: start + needle.length })
    from = start + Math.max(needle.length, 1)
  }
  return { matches, total }
}
