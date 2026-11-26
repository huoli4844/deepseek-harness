/** 知识库页签状态：集合/文档加载、目录索引、排序、多选与上传删除。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DoclibCollection, DoclibDirectoryNode, DoclibDocument, DoclibRequestError, DocumentSortField, SortState,
} from './model.ts'
import {
  deleteDocument, fetchCollections, fetchDocumentDetail, fetchDocumentIndex, fetchDocuments,
  fetchPreviewBlob, requestErrorKind, uploadDocument,
} from './source.ts'
import {
  DOCLIB_PAGE_SIZE, directoryNodes, doclibPageCount, documentsInDirectory, filterDocuments, matchesKeyword,
  sortDocuments, type DoclibTypeFilter,
} from './viewmodel.ts'
import type { MutationOutcome } from './use-workspace.ts'

export type { DoclibTypeFilter } from './viewmodel.ts'

/** 单个知识库页签的全部状态与动作（动作统一为箭头函数属性，避免引用未绑定方法）。 */
export interface KnowledgeTabController {
  readonly collections: readonly DoclibCollection[]
  readonly collectionId: string
  readonly currentCollection: DoclibCollection | undefined
  readonly draft: string
  readonly keyword: string
  readonly page: number
  readonly pageCount: number | undefined
  readonly total: number | undefined
  readonly documents: readonly DoclibDocument[]
  readonly visibleDocuments: readonly DoclibDocument[]
  readonly directories: readonly DoclibDirectoryNode[]
  readonly directory: string
  readonly indexLoading: boolean
  readonly typeFilter: DoclibTypeFilter
  readonly loading: boolean
  readonly error: DoclibRequestError | undefined
  readonly detail: DoclibDocument | undefined
  readonly previewPending: boolean
  readonly previewError: boolean
  readonly sort: SortState<DocumentSortField> | undefined
  readonly selected: ReadonlySet<string>
  readonly busy: boolean
  readonly selectCollection: (id: string) => void
  readonly inputDraft: (keyword: string) => void
  readonly submitSearch: () => void
  readonly clearSearch: () => void
  readonly setDirectory: (path: string) => void
  readonly setTypeFilter: (filter: DoclibTypeFilter) => void
  readonly setSort: (sort: SortState<DocumentSortField> | undefined) => void
  readonly toggleSortDirection: () => void
  readonly goToPage: (page: number) => void
  readonly retry: () => void
  readonly openDetail: (id: string) => void
  readonly closeDetail: () => void
  readonly preview: () => void
  readonly toggleSelected: (id: string) => void
  readonly toggleAll: () => void
  readonly clearSelection: () => void
  readonly upload: (files: readonly File[], onProgress: (done: number, total: number) => void) => Promise<MutationOutcome>
  readonly remove: (ids: readonly string[]) => Promise<MutationOutcome>
}

/** 一个知识库页签的数据流：集合加载、文档查询、目录聚合、排序与写动作。 */
export function useKnowledgeTab(active: boolean): KnowledgeTabController {
  const [collections, setCollections] = useState<readonly DoclibCollection[]>([])
  const [collectionId, setCollectionId] = useState('')
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<DoclibTypeFilter>('all')
  const [sort, setSort] = useState<SortState<DocumentSortField> | undefined>(undefined)
  const [reloadTick, setReloadTick] = useState(0)
  const [documents, setDocuments] = useState<readonly DoclibDocument[]>([])
  const [index, setIndex] = useState<readonly DoclibDocument[]>([])
  const [indexLoading, setIndexLoading] = useState(false)
  const [directory, setDirectory] = useState('')
  const [total, setTotal] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [collectionsError, setCollectionsError] = useState<DoclibRequestError | undefined>(undefined)
  const [error, setError] = useState<DoclibRequestError | undefined>(undefined)
  const [detail, setDetail] = useState<DoclibDocument | undefined>(undefined)
  const [previewPending, setPreviewPending] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const detailController = useRef<AbortController | undefined>(undefined)
  const busyRef = useRef(false)

  // 集合列表只拉一次；失败后可随重试按钮重新加载。页签未激活时不请求。
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    setCollectionsError(undefined)
    fetchCollections(controller.signal).then((list) => {
      setCollections(list)
      setCollectionId(current => current || (list[0]?.id ?? ''))
    }).catch((cause: unknown) => {
      setCollectionsError(requestErrorKind(cause))
    })
    return () => { controller.abort() }
  }, [active, reloadTick])

  // 文档列表随集合、关键字、页码与重试变化重新拉取，代际号丢弃过期响应。
  useEffect(() => {
    if (!active || collectionId === '') return
    const current = ++generation.current
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    fetchDocuments({ collectionId, keyword, page, pageSize: DOCLIB_PAGE_SIZE }, controller.signal)
      .then((result) => {
        if (current !== generation.current) return
        setDocuments(result.list)
        setTotal(result.total)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (current !== generation.current || controller.signal.aborted) return
        setError(requestErrorKind(cause))
        setLoading(false)
      })
    return () => { controller.abort() }
  }, [active, collectionId, keyword, page, reloadTick])

  // 切换集合同步重建目录索引：后台无目录树接口，按文档的 directory_path 在前端聚合。
  useEffect(() => {
    if (!active) return
    setDirectory('')
    if (collectionId === '') {
      setIndex([])
      return
    }
    const controller = new AbortController()
    setIndexLoading(true)
    fetchDocumentIndex(collectionId, controller.signal).then((documents) => {
      if (controller.signal.aborted) return
      setIndex(documents)
      setIndexLoading(false)
    }).catch(() => {
      if (controller.signal.aborted) return
      setIndex([])
      setIndexLoading(false)
    })
    return () => { controller.abort() }
  }, [active, collectionId, reloadTick])

  const openDetail = useCallback((id: string) => {
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    setPreviewError(false)
    fetchDocumentDetail(id, controller.signal).then((document) => {
      if (!controller.signal.aborted) setDetail(document)
    }).catch(() => {
      if (!controller.signal.aborted) setDetail(undefined)
    })
  }, [])

  const preview = useCallback(() => {
    if (detail === undefined || detail.fileId === '') return
    const controller = new AbortController()
    setPreviewPending(true)
    setPreviewError(false)
    fetchPreviewBlob(detail.fileId, controller.signal).then((blob) => {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => { URL.revokeObjectURL(url) }, 60_000)
      setPreviewPending(false)
    }).catch(() => {
      setPreviewPending(false)
      setPreviewError(true)
    })
  }, [detail])

  // 排序或目录筛选启用时改走本地索引：先筛选整份索引，再排序，最后分页。
  const localMode = directory !== '' || sort !== undefined
  const scoped = useMemo(() => localMode
    ? documentsInDirectory(index, directory).filter(document => matchesKeyword(document, keyword))
    : documents, [localMode, index, directory, keyword, documents])
  const ordered = useMemo(() => localMode ? sortDocuments(scoped, sort) : scoped, [localMode, scoped, sort])
  const scopedTotal = localMode ? ordered.length : total
  const pageCount = doclibPageCount(scopedTotal, DOCLIB_PAGE_SIZE)
  const safePage = pageCount === undefined ? page : Math.min(page, pageCount)
  const pageDocuments = localMode
    ? ordered.slice((safePage - 1) * DOCLIB_PAGE_SIZE, safePage * DOCLIB_PAGE_SIZE)
    : ordered
  const visibleDocuments = filterDocuments(pageDocuments, typeFilter)

  const refresh = useCallback(() => {
    setSelected(new Set())
    setReloadTick(tick => tick + 1)
  }, [])

  const run = useCallback(async (action: (id: string) => Promise<void>): Promise<MutationOutcome> => {
    if (collectionId === '' || busyRef.current) return 'failed'
    busyRef.current = true
    setBusy(true)
    try {
      await action(collectionId)
      refresh()
      return 'ok'
    } catch (cause: unknown) {
      const status = typeof cause === 'object' && cause !== null && 'status' in cause ? cause.status : undefined
      if (status === 401) return 'denied'
      if (status === 404) return 'notFound'
      if (status === 409) return 'exists'
      return 'failed'
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [collectionId, refresh])

  return {
    collections,
    collectionId,
    currentCollection: collections.find(collection => collection.id === collectionId),
    draft,
    keyword,
    page: safePage,
    total: scopedTotal,
    documents: pageDocuments,
    visibleDocuments,
    directories: directoryNodes(index),
    directory,
    indexLoading,
    typeFilter,
    loading: loading || (collectionId === '' && collections.length === 0) || (localMode && indexLoading),
    error: collectionsError ?? error,
    detail,
    pageCount,
    previewPending,
    previewError,
    sort,
    selected,
    busy,
    selectCollection: (id) => {
      setCollectionId(id)
      setDirectory('')
      setPage(1)
      setSelected(new Set())
      setSort(undefined)
    },
    inputDraft: setDraft,
    submitSearch: () => { setPage(1); setKeyword(draft.trim()); setSelected(new Set()) },
    clearSearch: () => { setDraft(''); setKeyword(''); setPage(1); setSelected(new Set()) },
    setDirectory: (path) => { setDirectory(path); setPage(1); setSelected(new Set()) },
    setTypeFilter,
    setSort: (next) => { setSort(next); setPage(1) },
    toggleSortDirection: () => {
      setSort(current => current === undefined
        ? current
        : { field: current.field, direction: current.direction === 'asc' ? 'desc' : 'asc' })
    },
    goToPage: (next) => { setPage(Math.max(1, next)) },
    retry: refresh,
    openDetail,
    closeDetail: () => { setDetail(undefined); setPreviewError(false) },
    preview,
    toggleSelected: (id) => {
      setSelected((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    toggleAll: () => {
      const ids = visibleDocuments.map(document => document.id)
      setSelected(previous => previous.size === ids.length ? new Set() : new Set(ids))
    },
    clearSelection: () => { setSelected(new Set()) },
    upload: (files, onProgress) => run(async (id) => {
      for (const [position, file] of files.entries()) {
        await uploadDocument(id, directory, file, AbortSignal.timeout(5 * 60_000))
        onProgress(position + 1, files.length)
      }
    }),
    remove: ids => run(async () => {
      for (const id of ids) {
        await deleteDocument(id, AbortSignal.timeout(30_000))
      }
    }),
  }
}
