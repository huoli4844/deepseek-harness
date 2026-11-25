/** 通过 DSH 平台自身能力读取当前工作区目录树，不经过元枢代理，不依赖 React。 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** `workspaceFiles.list` 的返回切片：目录条目与截断标记。 */
type WorkspaceListResult = Awaited<ReturnType<ClientRemote['workspaceFiles']['list']>>

/** 工作区目录条目。 */
export type WorkspaceDirEntry = Extract<WorkspaceListResult, { ok: true }>['value']['entries'][number]

/** 当前工作区定位：主会话身份与其工作区根路径。 */
export interface CurrentWorkspace {
  readonly sessionId: SessionId
  readonly root: string
}

/** 带工作区根路径的会话行。 */
type RootedSession = SessionListState['byId'][SessionId] & { readonly cwd: string }

/**
 * 从会话列表快照解析"当前工作区"。
 * 优先取第一个非空会话，退而取任意带目录的会话（含空白新会话）；都没有则返回 undefined。
 */
export function currentWorkspace(state: SessionListState): CurrentWorkspace | undefined {
  const withRoot = state.ids
    .map(id => state.byId[id])
    .filter((session): session is RootedSession =>
      session !== undefined && session.cwd !== undefined && session.cwd !== '')
  const chosen = withRoot.find(session => !session.blank) ?? withRoot[0]
  if (chosen === undefined) return undefined
  return { sessionId: chosen.id, root: chosen.cwd }
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
