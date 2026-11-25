/** 资料库容器状态：知识库页签数据流与本地工作区目录浏览，不直接渲染。 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DoclibCollection, DoclibDirectoryNode, DoclibDocument, DoclibRequestError } from './model.ts'
import { fetchCollections, fetchDocumentDetail, fetchDocumentIndex, fetchDocuments, fetchPreviewBlob, requestErrorKind } from './source.ts'
import { currentWorkspace, listWorkspaceDirectory, type SessionsService, type WorkspaceDirEntry, type WorkspaceFilesRemote } from './workspace-source.ts'
import {
  DOCLIB_PAGE_SIZE, directoryNodes, doclibPageCount, documentsInDirectory, filterDocuments, matchesKeyword,
  pathSegments, type DoclibTypeFilter,
} from './viewmodel.ts'

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
  readonly selectCollection: (id: string) => void
  readonly inputDraft: (keyword: string) => void
  readonly submitSearch: () => void
  readonly clearSearch: () => void
  readonly setDirectory: (path: string) => void
  readonly setTypeFilter: (filter: DoclibTypeFilter) => void
  readonly goToPage: (page: number) => void
  readonly retry: () => void
  readonly openDetail: (id: string) => void
  readonly closeDetail: () => void
  readonly preview: () => void
}

/** 一个知识库页签的数据流：集合加载、按集合/关键字/页码取文档、类型筛选、详情与预览。 */
export function useKnowledgeTab(active: boolean): KnowledgeTabController {
  const [collections, setCollections] = useState<readonly DoclibCollection[]>([])
  const [collectionId, setCollectionId] = useState('')
  const [draft, setDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<DoclibTypeFilter>('all')
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
  const generation = useRef(0)
  const detailController = useRef<AbortController | undefined>(undefined)

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

  // 切换集合时重建目录索引：后台无目录树接口，按文档的 directory_path 在前端聚合。
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

  // 目录筛选为本地模式：先按目录前缀取索引文档（再叠加本地关键字），再切片分页。
  const localMode = directory !== ''
  const scoped = localMode
    ? (keyword === '' ? documentsInDirectory(index, directory) : documentsInDirectory(index, directory).filter(document => matchesKeyword(document, keyword)))
    : documents
  const scopedTotal = localMode ? scoped.length : total
  const pageCount = localMode ? doclibPageCount(scoped.length, DOCLIB_PAGE_SIZE) : doclibPageCount(total, DOCLIB_PAGE_SIZE)
  const safePage = pageCount === undefined ? page : Math.min(page, pageCount)
  const pageDocuments = localMode
    ? scoped.slice((safePage - 1) * DOCLIB_PAGE_SIZE, safePage * DOCLIB_PAGE_SIZE)
    : scoped

  return {
    collections,
    collectionId,
    currentCollection: collections.find(collection => collection.id === collectionId),
    draft,
    keyword,
    page: safePage,
    total: scopedTotal,
    documents: pageDocuments,
    visibleDocuments: filterDocuments(pageDocuments, typeFilter),
    directories: directoryNodes(index),
    directory,
    indexLoading,
    typeFilter,
    loading: loading || (collectionId === '' && collections.length === 0),
    error: collectionsError ?? error,
    detail,
    pageCount,
    previewPending,
    previewError,
    selectCollection: (id) => { setCollectionId(id); setDirectory(''); setPage(1) },
    inputDraft: setDraft,
    submitSearch: () => { setPage(1); setKeyword(draft.trim()) },
    clearSearch: () => { setDraft(''); setKeyword(''); setPage(1) },
    setDirectory: (path) => { setDirectory(path); setPage(1) },
    setTypeFilter,
    goToPage: (next) => { setPage(Math.max(1, next)) },
    retry: () => { setReloadTick(tick => tick + 1) },
    openDetail,
    closeDetail: () => { setDetail(undefined); setPreviewError(false) },
    preview,
  }
}

/** 一个已加载目录的状态。 */
export interface WorkspaceDirState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly entries: readonly WorkspaceDirEntry[]
}

/** 本地工作区目录浏览状态：当前目录、子项、面包屑与导航动作。 */
export interface WorkspaceBrowser {
  readonly root: string | undefined
  readonly path: string
  readonly entries: readonly WorkspaceDirEntry[]
  readonly loading: boolean
  readonly error: boolean
  readonly segments: readonly { readonly name: string; readonly path: string }[]
  readonly navigate: (path: string) => void
  readonly refresh: () => void
}

/** 按目录逐层读取当前工作区，供个人资料页以表格方式浏览。 */
export function useWorkspaceBrowser(sessions: SessionsService, remote: WorkspaceFilesRemote): WorkspaceBrowser {
  const state = useSyncExternalStore(
    useCallback(listener => sessions.list.subscribe(listener), [sessions]),
    () => sessions.list.getSnapshot(),
  )
  const workspace = useMemo(() => currentWorkspace(state), [state])
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<Record<string, WorkspaceDirState>>({})
  const [reloadTick, setReloadTick] = useState(0)
  const generation = useRef(0)

  // 会话或工作区切换后回到根目录并丢弃旧缓存，避免把上一棵树拼进新工作区。
  useEffect(() => {
    generation.current += 1
    setPath('')
    setDirs({})
  }, [workspace?.sessionId, workspace?.root])

  const root = workspace?.root
  const sessionId = workspace?.sessionId
  useEffect(() => {
    if (root === undefined || sessionId === undefined) return
    const current = ++generation.current
    const controller = new AbortController()
    const absolutePath = path === '' ? root : `${root.replace(/\/+$/u, '')}/${path}`
    setDirs(previous => ({ ...previous, [path]: { status: 'loading', entries: previous[path]?.entries ?? [] } }))
    listWorkspaceDirectory(remote, sessionId, absolutePath, controller.signal)
      .then((entries) => {
        if (current !== generation.current) return
        setDirs(previous => ({ ...previous, [path]: { status: 'ready', entries } }))
      })
      .catch(() => {
        if (current !== generation.current) return
        setDirs(previous => ({ ...previous, [path]: { status: 'error', entries: [] } }))
      })
    return () => { controller.abort() }
  }, [root, sessionId, path, remote, reloadTick])

  const current = dirs[path]
  return {
    root,
    path,
    entries: current?.entries ?? [],
    loading: root !== undefined && (current === undefined || current.status === 'loading'),
    error: current?.status === 'error',
    segments: pathSegments(path),
    navigate: setPath,
    refresh: () => {
      setDirs(previous => Object.fromEntries(
        Object.entries(previous).filter(([key]) => key !== path),
      ))
      setReloadTick(tick => tick + 1)
    },
  }
}
