/** 通过 DSH 平台自身能力读取当前工作区目录树，不经过元枢代理，不依赖 React。 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** `workspaceFiles.list` 的返回切片：目录条目与截断标记。 */
type WorkspaceListResult = Awaited<ReturnType<ClientRemote['workspaceFiles']['list']>>

/** 工作区目录条目。 */
export type WorkspaceDirEntry = Extract<WorkspaceListResult, { ok: true }>['value']['entries'][number]

/** 当前工作区定位：主会话身份、工作区根路径与原生工作区名称。 */
export interface CurrentWorkspace {
  readonly sessionId: SessionId
  readonly root: string
  /** 与左侧栏「工作区」一致的用户可见标题；未分组会话没有标题。 */
  readonly title?: string
  readonly workspaceId?: string
}

/** 原生工作区行：与左侧栏工作区列表同源。 */
export interface WorkspaceViewLike {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionIds: readonly SessionId[]
}

/** 宿主工作区服务切片：只读快照与订阅。 */
export interface WorkspacesService {
  readonly list: {
    readonly getSnapshot: () => { readonly items: readonly WorkspaceViewLike[] }
    readonly subscribe: (listener: () => void) => () => void
  }
}

/** 未归入任何工作区的会话在切换项中的标识。 */
export const UNGROUPED_WORKSPACE_ID = '__ungrouped__'

/** 工作区切换项：供左栏下拉选择；title 缺省表示「未分组」。 */
export interface WorkspaceOption {
  readonly workspaceId: string
  readonly title?: string
}

/** 带工作区根路径的会话行。 */
type RootedSession = SessionListState['byId'][SessionId] & { readonly cwd: string }

/** 过滤出带根路径的会话。 */
function rootedSessions(state: SessionListState, ids: readonly SessionId[]): RootedSession[] {
  return ids
    .map(id => state.byId[id])
    .filter((session): session is RootedSession =>
      session !== undefined && session.cwd !== undefined && session.cwd !== '')
}

/** 在一个工作区内挑选可用会话：优先运行中的非空会话，避免未挂载历史会话导致接口失败。 */
function pickWorkspaceSession(state: SessionListState, ids: readonly SessionId[]): RootedSession | undefined {
  const rooted = rootedSessions(state, ids)
  return rooted.find(session => session.running && !session.blank)
    ?? rooted.find(session => session.running)
    ?? rooted.find(session => !session.blank)
    ?? rooted[0]
}

/** 工作区根路径的末级目录名，作为找不到原生工作区时的兜底标题。 */
function rootBasename(root: string): string {
  const trimmed = root.replace(/\/+$/u, '')
  return trimmed.slice(trimmed.lastIndexOf('/') + 1) || root
}

/** 不属于任何工作区的会话。 */
function ungroupedSessions(state: SessionListState, items: readonly WorkspaceViewLike[]): RootedSession[] {
  const members = new Set(items.flatMap(item => item.sessionIds))
  return rootedSessions(state, state.ids.filter(id => !members.has(id)))
}

/**
 * 从会话列表快照解析"当前工作区"。
 * 指定 workspaceId 时优先使用该工作区内的会话，指定未分组标识时使用未分组会话；
 * 否则优先取已归入工作区的运行会话，再退回任意运行中的非空会话。
 * 标题取原生工作区标题，找不到归属时退回工作区目录名。
 */
export function currentWorkspace(
  state: SessionListState,
  workspaces?: WorkspacesService,
  preferredId?: string,
): CurrentWorkspace | undefined {
  const items = workspaces?.list.getSnapshot().items ?? []
  if (preferredId === UNGROUPED_WORKSPACE_ID) {
    const ungrouped = ungroupedSessions(state, items)
    const session = pickWorkspaceSession(state, ungrouped.map(item => item.id))
    if (session !== undefined) {
      return { sessionId: session.id, root: session.cwd, workspaceId: UNGROUPED_WORKSPACE_ID }
    }
  }
  if (preferredId !== undefined && preferredId !== UNGROUPED_WORKSPACE_ID) {
    const preferred = items.find(item => item.workspaceId === preferredId)
    const session = preferred === undefined ? undefined : pickWorkspaceSession(state, preferred.sessionIds)
    if (preferred !== undefined && session !== undefined) {
      return {
        sessionId: session.id,
        root: session.cwd,
        title: preferred.title,
        workspaceId: preferred.workspaceId,
      }
    }
  }
  // 自动选择：优先已归入工作区的会话，保证名称与左侧栏一致。
  const members = new Set(items.flatMap(item => item.sessionIds))
  const grouped = pickWorkspaceSession(state, state.ids.filter(id => members.has(id)))
  const withRoot = rootedSessions(state, state.ids)
  const running = withRoot.filter(session => session.running)
  const chosen = grouped
    ?? running.find(session => !session.blank)
    ?? running[0]
    ?? withRoot.find(session => !session.blank)
    ?? withRoot[0]
  if (chosen === undefined) return undefined
  const owner = items.find(item => item.sessionIds.includes(chosen.id))
    ?? items.find(item => item.path === chosen.cwd)
  if (owner !== undefined) {
    return {
      sessionId: chosen.id,
      root: chosen.cwd,
      title: owner.title,
      workspaceId: owner.workspaceId,
    }
  }
  return {
    sessionId: chosen.id,
    root: chosen.cwd,
    title: rootBasename(chosen.cwd),
    workspaceId: UNGROUPED_WORKSPACE_ID,
  }
}

/** 列出可切换的工作区：真实工作区在前，「未分组」在最后。 */
export function workspaceOptions(
  state: SessionListState,
  workspaces?: WorkspacesService,
): readonly WorkspaceOption[] {
  const items = workspaces?.list.getSnapshot().items ?? []
  const options: WorkspaceOption[] = items
    .filter(item => pickWorkspaceSession(state, item.sessionIds) !== undefined)
    .map(item => ({ workspaceId: item.workspaceId, title: item.title }))
  if (pickWorkspaceSession(state, ungroupedSessions(state, items).map(item => item.id)) !== undefined) {
    options.push({ workspaceId: UNGROUPED_WORKSPACE_ID })
  }
  return options
}

/** 宿主会话服务切片：资料库只读列表快照与订阅。 */
export interface SessionsService {
  readonly list: {
    readonly getSnapshot: () => SessionListState
    readonly subscribe: (listener: () => void) => () => void
  }
}

/** 宿主 Remote 服务切片：资料库只调用 workspaceFiles.list。 */
export type WorkspaceFilesRemote = Pick<ClientRemote, 'workspaceFiles'>

/**
 * 列出工作区内一个目录的直接子项。
 * 路径使用绝对路径（工作区根或其子目录）；Remote 失败抛出携带业务码的错误。
 */
export async function listWorkspaceDirectory(
  remote: WorkspaceFilesRemote,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): Promise<readonly WorkspaceDirEntry[]> {
  const result = await remote.workspaceFiles.list(sessionId, path, signal)
  if (!result.ok) {
    throw Object.assign(new Error(`workspace list failed: ${result.error.code}`), {
      code: result.error.code,
    })
  }
  return result.value.entries
}
