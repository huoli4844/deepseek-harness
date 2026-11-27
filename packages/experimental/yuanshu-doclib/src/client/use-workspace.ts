/** 个人资料目录浏览状态：目录读取、本地排序筛选、多选与文件服务器式写动作。 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { SortState, WorkspaceEntryDetail, WorkspaceSortField } from './model.ts'
import {
  currentWorkspace, listWorkspaceDirectory, workspaceOptions, type SessionsService, type WorkspaceDirEntry,
  type WorkspaceFilesRemote, type WorkspaceOption, type WorkspacesService,
} from './workspace-source.ts'
import {
  copyWorkspaceEntries, createWorkspaceFolder, deleteWorkspaceEntries, fetchWorkspaceBlob,
  fetchWorkspaceStat, moveWorkspaceEntries, renameWorkspaceEntry, uploadWorkspaceFiles,
  workspaceFailure, type WorkspaceTarget,
} from './workspace-actions.ts'
import { pathSegments, sortWorkspaceEntries } from './viewmodel.ts'

/** 写动作结果：成功或具体失败原因。 */
export type MutationOutcome = 'ok' | 'exists' | 'notFound' | 'denied' | 'failed'

/** 一个已加载目录的状态。 */
export interface WorkspaceDirState {
  readonly status: 'loading' | 'ready' | 'error'
  readonly entries: readonly WorkspaceDirEntry[]
}

/** 本地工作区目录浏览状态：导航、排序、多选、属性与文件动作。 */
export interface WorkspaceBrowser {
  readonly root: string | undefined
  /** 当前工作区的原生名称（与左侧栏一致）。 */
  readonly workspaceTitle: string | undefined
  readonly workspaceId: string | undefined
  readonly workspaceOptions: readonly WorkspaceOption[]
  readonly selectWorkspace: (workspaceId: string) => void
  readonly path: string
  readonly entries: readonly WorkspaceDirEntry[]
  readonly loading: boolean
  readonly error: boolean
  readonly busy: boolean
  readonly segments: readonly { readonly name: string; readonly path: string }[]
  readonly keyword: string
  readonly sort: SortState<WorkspaceSortField>
  readonly selected: ReadonlySet<string>
  readonly detail: WorkspaceEntryDetail | undefined
  readonly navigate: (path: string) => void
  readonly refresh: () => void
  readonly setKeyword: (keyword: string) => void
  readonly setSort: (sort: SortState<WorkspaceSortField>) => void
  readonly toggleSelected: (id: string) => void
  readonly toggleAll: () => void
  readonly clearSelection: () => void
  readonly showDetail: (relativePath: string) => void
  readonly closeDetail: () => void
  readonly createFolder: (name: string) => Promise<MutationOutcome>
  readonly rename: (source: string, name: string) => Promise<MutationOutcome>
  readonly move: (sources: readonly string[], destination: string) => Promise<MutationOutcome>
  readonly copy: (sources: readonly string[], destination: string) => Promise<MutationOutcome>
  readonly remove: (sources: readonly string[]) => Promise<MutationOutcome>
  readonly upload: (files: readonly File[], onProgress: (done: number, total: number) => void) => Promise<MutationOutcome>
  readonly blob: (relativePath: string) => Promise<Blob | undefined>
}

/** 写动作超时（毫秒）：常规文件操作；上传在数据层单独放宽。 */
const MUTATION_TIMEOUT_MS = 60_000

/** 按目录逐层读取当前工作区，并提供本地文件服务器式操作。 */
export function useWorkspaceBrowser(
  sessions: SessionsService,
  remote: WorkspaceFilesRemote,
  workspaces?: WorkspacesService,
): WorkspaceBrowser {
  const state = useSyncExternalStore(
    useCallback(listener => sessions.list.subscribe(listener), [sessions]),
    () => sessions.list.getSnapshot(),
  )
  // 订阅原生工作区列表，名称与左侧栏保持一致；服务缺失时保持空实现。
  const workspaceState = useSyncExternalStore(
    useCallback(
      (listener: () => void) => workspaces?.list.subscribe(listener) ?? (() => {}),
      [workspaces],
    ),
    () => workspaces?.list.getSnapshot(),
  )
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined)
  const workspace = useMemo(
    () => currentWorkspace(state, workspaces, selectedWorkspaceId),
    [state, workspaces, selectedWorkspaceId, workspaceState],
  )
  const options = useMemo(
    () => workspaceOptions(state, workspaces),
    [state, workspaces, workspaceState],
  )
  const [path, setPath] = useState('')
  const [dirs, setDirs] = useState<Record<string, WorkspaceDirState>>({})
  const [reloadTick, setReloadTick] = useState(0)
  const [keyword, setKeywordState] = useState('')
  const [sort, setSort] = useState<SortState<WorkspaceSortField>>({ field: 'name', direction: 'asc' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [detail, setDetail] = useState<WorkspaceEntryDetail | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const busyRef = useRef(false)

  // 会话或工作区切换后回到根目录并丢弃旧缓存与选择，避免把上一棵树拼进新工作区。
  useEffect(() => {
    generation.current += 1
    setPath('')
    setDirs({})
    setSelected(new Set())
    setKeywordState('')
    setDetail(undefined)
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
      .catch((error: unknown) => {
        if (current !== generation.current) return
        console.error('[yuanshu-doclib] 工作区文件加载失败', absolutePath, error)
        setDirs(previous => ({ ...previous, [path]: { status: 'error', entries: [] } }))
      })
    return () => { controller.abort() }
  }, [root, sessionId, path, remote, reloadTick])

  const refresh = useCallback(() => {
    setDirs(previous => Object.fromEntries(
      Object.entries(previous).filter(([key]) => key !== path),
    ))
    setReloadTick(tick => tick + 1)
  }, [path])

  const target: WorkspaceTarget | undefined = root === undefined || sessionId === undefined
    ? undefined
    : { sessionId: String(sessionId), root }

  const run = useCallback(async (action: (at: WorkspaceTarget) => Promise<void>): Promise<MutationOutcome> => {
    if (target === undefined || busyRef.current) return 'failed'
    busyRef.current = true
    setBusy(true)
    try {
      await action(target)
      refresh()
      setSelected(new Set())
      return 'ok'
    } catch (error: unknown) {
      return workspaceFailure(error)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [target, refresh])

  const navigate = useCallback((next: string) => {
    setPath(next)
    setSelected(new Set())
    setKeywordState('')
  }, [])

  const current = dirs[path]
  const entries = current?.entries ?? []
  return {
    root,
    workspaceTitle: workspace?.title,
    workspaceId: workspace?.workspaceId,
    workspaceOptions: options,
    selectWorkspace: setSelectedWorkspaceId,
    path,
    entries,
    loading: root !== undefined && (current === undefined || current.status === 'loading'),
    error: current?.status === 'error',
    busy,
    segments: pathSegments(path),
    keyword,
    sort,
    selected,
    detail,
    navigate,
    refresh,
    setKeyword: setKeywordState,
    setSort,
    toggleSelected: (id) => {
      setSelected((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    toggleAll: () => {
      const ids = sortWorkspaceEntries(entries).map(entry => path === '' ? entry.name : `${path}/${entry.name}`)
      setSelected(previous => previous.size === ids.length ? new Set() : new Set(ids))
    },
    clearSelection: () => { setSelected(new Set()) },
    showDetail: (relativePath) => {
      if (target === undefined) return
      fetchWorkspaceStat(target, relativePath, AbortSignal.timeout(MUTATION_TIMEOUT_MS))
        .then(setDetail)
        .catch(() => { setDetail(undefined) })
    },
    closeDetail: () => { setDetail(undefined) },
    createFolder: name => run(at => createWorkspaceFolder(
      at, path, name, AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    )),
    rename: (source, name) => run(at => renameWorkspaceEntry(
      at, source, name, AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    )),
    move: (sources, destination) => run(at => moveWorkspaceEntries(
      at, sources, destination, AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    )),
    copy: (sources, destination) => run(at => copyWorkspaceEntries(
      at, sources, destination, AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    )),
    remove: sources => run(at => deleteWorkspaceEntries(
      at, sources, AbortSignal.timeout(MUTATION_TIMEOUT_MS),
    )),
    upload: (files, onProgress) => run(at => uploadWorkspaceFiles(
      at, path, files, AbortSignal.timeout(30 * 60_000), onProgress,
    )),
    blob: async (relativePath) => {
      if (target === undefined) return undefined
      return fetchWorkspaceBlob(target, relativePath, AbortSignal.timeout(MUTATION_TIMEOUT_MS * 5))
    },
  }
}
