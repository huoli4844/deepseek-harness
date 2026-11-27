/** 资料库工作区路由表：把同源请求映射到本地文件操作，不访问网络。 */

/** 工作区支持的文件操作。 */
export type WorkspaceAction =
  | 'mkdir' | 'rename' | 'move' | 'copy' | 'delete' | 'upload' | 'download' | 'stat'

/** 路由解析结果：命中动作、方法不匹配，或不是工作区路径。 */
export type WorkspaceRoute =
  | { readonly type: 'call'; readonly action: WorkspaceAction; readonly method: 'GET' | 'POST' }
  | { readonly type: 'method'; readonly allow: string }

/** 每个动作允许的 HTTP 方法。 */
const WORKSPACE_ACTIONS: Readonly<Record<string, { readonly action: WorkspaceAction; readonly method: 'GET' | 'POST' }>> = {
  '/yuanshu-doclib/workspace/mkdir': { action: 'mkdir', method: 'POST' },
  '/yuanshu-doclib/workspace/rename': { action: 'rename', method: 'POST' },
  '/yuanshu-doclib/workspace/move': { action: 'move', method: 'POST' },
  '/yuanshu-doclib/workspace/copy': { action: 'copy', method: 'POST' },
  '/yuanshu-doclib/workspace/delete': { action: 'delete', method: 'POST' },
  '/yuanshu-doclib/workspace/upload': { action: 'upload', method: 'POST' },
  '/yuanshu-doclib/workspace/download': { action: 'download', method: 'GET' },
  '/yuanshu-doclib/workspace/stat': { action: 'stat', method: 'GET' },
}

/**
 * 解析工作区请求路径与方法。
 * @param pathname - 同源请求路径。
 * @param method - HTTP 方法。
 * @returns 命中返回 call，方法不匹配返回 method，非工作区路径返回 undefined。
 */
export function workspaceRoute(pathname: string, method: string): WorkspaceRoute | undefined {
  const entry = WORKSPACE_ACTIONS[pathname]
  if (entry === undefined) return undefined
  if (method !== entry.method) return { type: 'method', allow: entry.method }
  return { type: 'call', action: entry.action, method: entry.method }
}
