/** 编排组织架构树与成员列表的加载、筛选和分页，不渲染页面。 */
import { useEffect, useState } from 'react'
import { fetchOrganizationMembers, fetchOrganizationTree } from './organization-api.ts'
import type { DepartmentNode, OrganizationMemberPage } from './organization-model.ts'
import { RECORD_PAGE_SIZE, recordPageCount } from './record-list-viewmodel.ts'

/** 组织架构请求失败时展示的文案类别。 */
export type OrganizationRequestError = 'login' | 'denied' | 'failure'

function requestError(error: unknown): OrganizationRequestError {
  const status = error instanceof Error && 'status' in error ? error.status : undefined
  if (status === 401) return 'login'
  if (status === 403) return 'denied'
  return 'failure'
}

/** 加载部门树与成员列表；部门或搜索词变化时成员列表回到第一页。 */
export function useOrganization() {
  const [tree, setTree] = useState<readonly DepartmentNode[]>()
  const [treeError, setTreeError] = useState<OrganizationRequestError>()
  const [treeRetry, setTreeRetry] = useState(0)
  const [query, setQuery] = useState<{
    readonly departmentId: number | undefined
    readonly keyword: string
    readonly page: number
  }>({ departmentId: undefined, keyword: '', page: 1 })
  const [result, setResult] = useState<OrganizationMemberPage>()
  const [error, setError] = useState<OrganizationRequestError>()
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setTreeError(undefined)
    void fetchOrganizationTree(controller.signal).then((data) => {
      if (!controller.signal.aborted) setTree(data)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setTreeError(requestError(reason))
    })
    return () => { controller.abort() }
  }, [treeRetry])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchOrganizationMembers({ ...query, pageSize: RECORD_PAGE_SIZE }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const lastPage = recordPageCount(data.total, data.pageSize)
      if (lastPage !== undefined && query.page > lastPage) {
        setQuery(previous => ({ ...previous, page: lastPage }))
        return
      }
      setResult(data)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      const kind = requestError(reason)
      if (kind !== 'failure') setResult(undefined)
      setError(kind)
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [query, retry])

  const pageCount = recordPageCount(result?.total, result?.pageSize ?? RECORD_PAGE_SIZE)
  return {
    tree,
    treeError,
    result,
    loading,
    error,
    pageCount,
    departmentId: query.departmentId,
    page: query.page,
    selectDepartment: (departmentId: number | undefined) => {
      setQuery(previous => previous.departmentId === departmentId ? previous : { ...previous, departmentId, page: 1 })
    },
    search: (keyword: string) => {
      const next = keyword.trim()
      setQuery(previous => ({ ...previous, keyword: next, page: 1 }))
    },
    goToPage: (page: number) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > (pageCount ?? 1)) return
      setQuery(previous => previous.page === page ? previous : { ...previous, page })
    },
    retryTree: () => { setTreeRetry(value => value + 1) },
    retry: () => { setRetry(value => value + 1) },
  }
}
