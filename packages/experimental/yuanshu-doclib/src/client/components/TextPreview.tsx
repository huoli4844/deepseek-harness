/** 文本预览：整段文本渲染、关键字高亮与逐处跳转，只消费已解码文本，不请求字节。 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DoclibT } from '../model.ts'
import { findTextMatches } from '../text-search.ts'
import css from '../doclib.module.css'

/** 文本预览属性：文本内容、截断标记、文案函数与由弹窗标题栏托管的搜索栏开关。 */
export interface TextPreviewProps {
  readonly text: string
  readonly truncated: boolean
  readonly t: DoclibT
  /** 搜索栏是否展开。 */
  readonly searchOpen: boolean
  readonly onSearchOpenChange: (open: boolean) => void
}

/** 高亮片段：`match` 为匹配序号，普通文本为 -1。 */
interface TextSegment {
  readonly text: string
  readonly match: number
}

/**
 * 把文本按匹配区间切成普通片段与高亮片段。
 * @param text - 原始文本。
 * @param matches - 已排序且互不重叠的匹配区间。
 * @returns 用于渲染的片段序列。
 */
function textSegments(text: string, matches: readonly { readonly start: number; readonly end: number }[]): readonly TextSegment[] {
  if (matches.length === 0) return [{ text, match: -1 }]
  const segments: TextSegment[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start), match: -1 })
    segments.push({ text: text.slice(match.start, match.end), match: index })
    cursor = match.end
  })
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: -1 })
  return segments
}

/**
 * 文本预览主体：Ctrl/⌘+F 展开搜索栏，Enter / Shift+Enter 跳到下一个或上一个匹配。
 * @param props - 文本、截断标记、文案函数与搜索栏开关。
 */
export function TextPreview(props: TextPreviewProps) {
  const { text, truncated, t, searchOpen, onSearchOpenChange } = props
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const activeMarkRef = useRef<HTMLElement>(null)

  const result = useMemo(() => findTextMatches(text, query, caseSensitive), [text, query, caseSensitive])
  const segments = useMemo(() => textSegments(text, result.matches), [text, result])
  // 命中数变化后当前序号可能越界，渲染时按可用区间收敛。
  const activeIndex = result.matches.length === 0 ? -1 : Math.min(active, result.matches.length - 1)

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [searchOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onSearchOpenChange(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onSearchOpenChange])

  // 只滚动文本容器本身，避免把背后的工作台页面一起滚走。
  useEffect(() => {
    const mark = activeMarkRef.current
    const pre = preRef.current
    if (activeIndex < 0 || mark === null || pre === null) return
    const box = pre.getBoundingClientRect()
    const rect = mark.getBoundingClientRect()
    if (rect.top < box.top || rect.bottom > box.bottom) {
      pre.scrollTop += rect.top - box.top - (box.height - rect.height) / 2
    }
  }, [activeIndex])

  const step = (delta: number) => {
    const count = result.matches.length
    if (count === 0) return
    setActive(current => (Math.min(current, count - 1) + delta + count) % count)
  }

  return <div className={css.previewTextPane}>
    {searchOpen && <div className={css.previewSearch} role="search">
      <input ref={inputRef} className={css.previewSearchInput} value={query}
        placeholder={t('doclib.preview.searchPlaceholder')}
        aria-label={t('doclib.preview.searchPlaceholder')}
        onChange={(event) => { setActive(0); setQuery(event.target.value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            step(event.shiftKey ? -1 : 1)
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onSearchOpenChange(false)
          }
        }} />
      <span className={css.previewSearchCount} aria-live="polite">
        {query === '' ? '' : result.total === 0
          ? t('doclib.preview.searchNoMatch')
          : t('doclib.preview.searchCount', {
            current: activeIndex + 1,
            total: result.total > result.matches.length ? `${result.matches.length}+` : result.total,
          })}
      </span>
      <button type="button" className={css.previewSearchButton} disabled={result.matches.length === 0}
        aria-label={t('doclib.preview.searchPrev')} title={t('doclib.preview.searchPrev')}
        onClick={() => { step(-1) }}>↑</button>
      <button type="button" className={css.previewSearchButton} disabled={result.matches.length === 0}
        aria-label={t('doclib.preview.searchNext')} title={t('doclib.preview.searchNext')}
        onClick={() => { step(1) }}>↓</button>
      <button type="button" className={css.previewSearchButton} aria-pressed={caseSensitive}
        aria-label={t('doclib.preview.searchCase')} title={t('doclib.preview.searchCase')}
        onClick={() => { setCaseSensitive(current => !current) }}>{t('doclib.preview.searchCaseMark')}</button>
      <button type="button" className={css.previewSearchButton}
        aria-label={t('doclib.preview.searchClose')} title={t('doclib.preview.searchClose')}
        onClick={() => { onSearchOpenChange(false) }}>×</button>
    </div>}
    <pre ref={preRef} className={css.previewText}>
      {segments.map((segment, index) => segment.match < 0
        ? segment.text
        : <mark key={index}
          ref={segment.match === activeIndex ? activeMarkRef : undefined}
          className={segment.match === activeIndex
            ? `${css.previewMark} ${css.previewMarkActive}` : css.previewMark}>
          {segment.text}
        </mark>)}
    </pre>
    {truncated && <p className={css.previewHint}>
      {t('doclib.preview.textTruncated', { count: text.length })}</p>}
  </div>
}
