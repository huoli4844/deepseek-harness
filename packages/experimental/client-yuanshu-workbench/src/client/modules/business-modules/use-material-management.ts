/** 编排物料查询、分类树检索和分类写入，不渲染页面。 */
import { useEffect, useRef, useState } from 'react'
import { fetchMaterialCategories, fetchMaterialPage, createMaterialCategory } from './material-api.ts'
import type { MaterialCategory, MaterialCategoryDraft, MaterialFilters, MaterialPage, MaterialSort } from './material-model.ts'
import { materialCategoryAncestors, materialCategoryTree, nextMaterialSort } from './material-viewmodel.ts'
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

/** 加载物料档案，任何筛选、分类或排序变化都从第一页开始。 */
export function useMaterialRecords() {
  const [query, setQuery] = useState<{
    readonly page: number
    readonly categoryId: number | undefined
    readonly filters: MaterialFilters
    readonly sort: MaterialSort | undefined
  }>({ page: 1, categoryId: undefined, filters: { code: '', name: '', materialType: '', criticalLevel: '' }, sort: undefined })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<MaterialPage>()
  const [error, setError] = useState<RequestError>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchMaterialPage({ ...query, pageSize: RECORD_PAGE_SIZE }, controller.signal).then((data) => {
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
    categoryId: query.categoryId, page: query.page, sort: query.sort, pageCount, loading, error, result,
    chooseCategory: (categoryId: number | undefined) => {
      setQuery(previous => previous.categoryId === categoryId ? previous : { ...previous, categoryId, page: 1 })
    },
    search: (filters: MaterialFilters) => {
      setQuery(previous => ({ ...previous, filters, page: 1 }))
    },
    sortBy: (key: string) => {
      setQuery(previous => ({ ...previous, sort: nextMaterialSort(previous.sort, key), page: 1 }))
    },
    goToPage: (page: number) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > (pageCount ?? 1)) return
      setQuery(previous => previous.page === page ? previous : { ...previous, page })
    },
    retry: () => { setRetry(value => value + 1) },
  }
}

/** 加载分类树并管理搜索词和节点展开状态。 */
export function useMaterialCategories() {
  const [rows, setRows] = useState<readonly MaterialCategory[]>([])
  const [status, setStatus] = useState<RequestError | 'loading' | 'ready'>('loading')
  const [keyword, setKeyword] = useState('')
  const [draft, setDraft] = useState('')
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState<ReadonlyMap<number, boolean>>(() => new Map())

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    void fetchMaterialCategories(keyword, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setRows(data)
      setStatus('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setStatus(requestError(error))
    })
    return () => { controller.abort() }
  }, [keyword, retry])

  return {
    status, nodes: materialCategoryTree(rows), rows, draft, setDraft,
    isExpanded: (id: number) => expanded.get(id) ?? keyword !== '',
    toggle: (id: number) => {
      setExpanded(previous => new Map(previous).set(id, !(previous.get(id) ?? keyword !== '')))
    },
    search: () => {
      const next = draft.trim()
      if (next === keyword) setRetry(value => value + 1)
      else {
        setExpanded(new Map())
        setKeyword(next)
      }
    },
    retry: () => { setRetry(value => value + 1) },
    refreshAfterCreate: (parentId: number | undefined) => {
      setKeyword('')
      setDraft('')
      setRetry(value => value + 1)
      if (parentId !== undefined) setExpanded((previous) => {
        const next = new Map(previous)
        for (const id of materialCategoryAncestors(rows, parentId)) next.set(id, true)
        return next
      })
    },
  }
}

type SaveErrorKey = 'material.login' | 'material.writeUnauthorized' | 'material.denied' | 'material.conflict' | 'material.invalidCategory' | 'material.saveError'

function saveError(error: unknown): SaveErrorKey {
  if (error instanceof Error && 'kind' in error && error.kind === 'missingToken') return 'material.login'
  switch (responseStatus(error)) {
    case 401: return 'material.writeUnauthorized'
    case 403: return 'material.denied'
    case 409: return 'material.conflict'
    case 400: return 'material.invalidCategory'
    default: return 'material.saveError'
  }
}

/** 控制分类新增弹窗提交，卸载后取消请求与状态更新。 */
export function useMaterialCategoryCreate(onCreated: (category: MaterialCategory) => void) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SaveErrorKey>()
  const active = useRef<AbortController>()

  useEffect(() => () => { active.current?.abort() }, [])

  return {
    open, pending, error,
    start: () => {
      setError(undefined)
      setOpen(true)
    },
    close: () => { if (active.current === undefined) setOpen(false) },
    save: (draft: MaterialCategoryDraft) => {
      if (active.current !== undefined) return
      if (draft.code.trim() === '' || draft.name.trim() === '') {
        setError('material.invalidCategory')
        return
      }
      const controller = new AbortController()
      active.current = controller
      setPending(true)
      setError(undefined)
      void createMaterialCategory(draft, controller.signal).then((category) => {
        if (controller.signal.aborted) return
        onCreated(category)
        setOpen(false)
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setError(saveError(error))
      }).finally(() => {
        if (controller.signal.aborted) return
        active.current = undefined
        setPending(false)
      })
    },
  }
}
