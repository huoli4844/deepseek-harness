/** 编排合同台账查询，不渲染页面。 */
import { useEffect, useState } from 'react'
import { fetchContractPage } from './contract-api.ts'
import type { ContractFilters, ContractPage, ContractSort } from './contract-model.ts'
import { nextContractSort } from './contract-viewmodel.ts'
import { RECORD_PAGE_SIZE, recordPageCount } from './record-list-viewmodel.ts'

type RequestError = 'login' | 'denied' | 'failure'

function responseStatus(error: unknown): unknown {
  return error instanceof Error && 'status' in error ? error.status : undefined
}

function requestError(error: unknown): RequestError {
  switch (responseStatus(error)) {
    case 401: return 'login'
    case 403: return 'denied'
    default: return 'failure'
  }
}

/** 加载合同台账，任何筛选或排序变化都从第一页开始。 */
export function useContracts() {
  const [query, setQuery] = useState<{
    readonly page: number
    readonly filters: ContractFilters
    readonly sort: ContractSort | undefined
  }>({ page: 1, filters: { keyword: '' }, sort: undefined })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<ContractPage>()
  const [error, setError] = useState<RequestError>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchContractPage({ ...query, pageSize: RECORD_PAGE_SIZE }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const lastPage = recordPageCount(data.total, data.pageSize)
      if (lastPage !== undefined && query.page > lastPage) {
        setQuery(previous => ({ ...previous, page: lastPage }))
        return
      }
      setResult(data)
      setLoading(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const kind = requestError(error)
      if (kind !== 'failure') setResult(undefined)
      setError(kind)
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [query, retry])

  const pageCount = recordPageCount(result?.total, result?.pageSize ?? RECORD_PAGE_SIZE)
  return {
    page: query.page, sort: query.sort, pageCount, loading, error, result,
    search: (filters: ContractFilters) => {
      setQuery(previous => ({ ...previous, filters, page: 1 }))
    },
    sortBy: (key: string) => {
      setQuery(previous => ({ ...previous, sort: nextContractSort(previous.sort, key), page: 1 }))
    },
    goToPage: (page: number) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > (pageCount ?? 1)) return
      setQuery(previous => previous.page === page ? previous : { ...previous, page })
    },
    retry: () => { setRetry(value => value + 1) },
  }
}
