/** 编排客户和供应商列表的搜索、分页与加载生命周期，不渲染页面。 */
import { useEffect, useState } from 'react'
import { RECORD_PAGE_SIZE, recordPageCount } from './record-list-viewmodel.ts'
import type { RecordListFilters, RecordListSort } from './record-list-query.ts'

interface RecordPage<T> {
  readonly items: readonly T[]
  readonly total: number | undefined
  readonly archiveTotal: number | undefined
  readonly pageSize: number
}

type ListStatus = 'login' | 'denied' | 'failure'

function listError(error: unknown): ListStatus {
  if (error instanceof Error && 'kind' in error && (error.kind === 'login' || error.kind === 'denied')) return error.kind
  return 'failure'
}

/** 从后台拉取指定页，搜索条件变化时回到第一页并取消过时请求。 */
export function useRecordList<T>(
  fetchPage: (
    page: number, size: number, filters: RecordListFilters, sort: RecordListSort | undefined, signal: AbortSignal,
  ) => Promise<RecordPage<T>>,
) {
  const [filters, setFilters] = useState<RecordListFilters>({})
  const [sort, setSort] = useState<RecordListSort>()
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<RecordPage<T>>()
  const [archiveTotal, setArchiveTotal] = useState<number>()
  const [state, setState] = useState<ListStatus | 'loading' | 'ready'>('loading')
  const pageCount = recordPageCount(result?.total, result?.pageSize || RECORD_PAGE_SIZE)

  useEffect(() => {
    const controller = new AbortController()
    void fetchPage(page, RECORD_PAGE_SIZE, filters, sort, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setArchiveTotal(previous => data.archiveTotal ?? (Object.values(filters).some(Boolean) ? previous : data.total))
      setResult(data)
      const lastPage = recordPageCount(data.total, data.pageSize || RECORD_PAGE_SIZE)
      if (lastPage !== undefined && page > lastPage) {
        setPage(lastPage)
        return
      }
      setState('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const failure = listError(error)
      if (failure === 'login' || failure === 'denied') setArchiveTotal(undefined)
      setState(failure)
    })
    return () => { controller.abort() }
  }, [attempt, fetchPage, filters, page, sort])

  return {
    sort, page, pageCount, state, archiveTotal, items: result?.items ?? [],
    canGoNext: pageCount === undefined ? (result?.items.length ?? 0) >= RECORD_PAGE_SIZE : page < pageCount,
    search(value: RecordListFilters) {
      setFilters(value)
      setState('loading')
      setPage(1)
    },
    sortBy: (key: string) => {
      setSort(previous => ({
        key, direction: previous?.key === key && previous.direction === 'asc' ? 'desc' : 'asc',
      }))
      setState('loading')
      setPage(1)
    },
    goToPage: (target: number) => {
      if (!Number.isInteger(target) || target < 1 || target > (pageCount ?? 1_000_000) || target === page) return
      setState('loading')
      setPage(target)
    },
    reload(resetPage = false) {
      if (resetPage) setPage(1)
      setState('loading')
      setAttempt(value => value + 1)
    },
  }
}
