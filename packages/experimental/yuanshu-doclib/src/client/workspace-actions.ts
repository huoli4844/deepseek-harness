/** 资料库本地工作区写操作：经宿主同源路由执行文件服务器式动作，不依赖 React。 */
import type { WorkspaceEntryDetail } from './model.ts'

/** 目标工作区：会话身份与工作区根目录。 */
export interface WorkspaceTarget {
  readonly sessionId: string
  readonly root: string
}

/** 单次上传的超时（毫秒）。 */
const UPLOAD_TIMEOUT_MS = 5 * 60_000

/** 统一的授权请求头。 */
function authHeaders(extra?: Readonly<Record<string, string>>): Headers {
  const headers = new Headers({
    authorization: `Bearer ${localStorage.getItem('workbench-client-token') ?? ''}`,
    'X-Active-Tenant': localStorage.getItem('yuanshu-active-tenant') ?? '',
    ...extra,
  })
  return headers
}

/** 解析失败响应，抛出携带状态码的错误。 */
async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return
  let reason = `workspace request failed: ${response.status}`
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      reason = body.error
    }
  } catch {
    // 非 JSON 错误体保留状态码描述。
  }
  throw Object.assign(new Error(reason), { status: response.status })
}

/** 判断 JSON 解析结果是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 把工作区写错误归类为界面提示所需的结果。 */
export function workspaceFailure(error: unknown): 'exists' | 'notFound' | 'denied' | 'failed' {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
  if (status === 409) return 'exists'
  if (status === 404) return 'notFound'
  if (status === 403) return 'denied'
  return 'failed'
}

/** 发送一条 JSON 工作区命令。 */
async function post(command: string, body: Record<string, unknown>, signal: AbortSignal): Promise<void> {
  const response = await fetch(`/yuanshu-doclib/workspace/${command}`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  })
  await ensureOk(response)
}

/** 新建文件夹。 */
export async function createWorkspaceFolder(
  target: WorkspaceTarget,
  directory: string,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  await post('mkdir', { session: target.sessionId, root: target.root, directory, name }, signal)
}

/** 重命名条目。 */
export async function renameWorkspaceEntry(
  target: WorkspaceTarget,
  source: string,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  await post('rename', { session: target.sessionId, root: target.root, source, name }, signal)
}

/** 批量移动条目到目标目录。 */
export async function moveWorkspaceEntries(
  target: WorkspaceTarget,
  sources: readonly string[],
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  await post('move', { session: target.sessionId, root: target.root, sources, target: destination }, signal)
}

/** 批量复制条目到目标目录。 */
export async function copyWorkspaceEntries(
  target: WorkspaceTarget,
  sources: readonly string[],
  destination: string,
  signal: AbortSignal,
): Promise<void> {
  await post('copy', { session: target.sessionId, root: target.root, sources, target: destination }, signal)
}

/** 批量删除条目。 */
export async function deleteWorkspaceEntries(
  target: WorkspaceTarget,
  sources: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  await post('delete', { session: target.sessionId, root: target.root, sources }, signal)
}

/**
 * 逐份上传文件到指定目录；每份单独请求，便于报告进度。
 * @param target - 目标工作区。
 * @param directory - 目标目录（工作区相对路径）。
 * @param files - 待上传文件列表。
 * @param signal - 取消信号。
 * @param onProgress - 每份完成后的回调（已完成份数，总份数）。
 */
export async function uploadWorkspaceFiles(
  target: WorkspaceTarget,
  directory: string,
  files: readonly File[],
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  for (const [index, file] of files.entries()) {
    const query = new URLSearchParams({
      session: target.sessionId,
      root: target.root,
      directory,
      name: file.name,
    })
    const response = await fetch(`/yuanshu-doclib/workspace/upload?${query.toString()}`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': file.type || 'application/octet-stream' }),
      body: file,
      signal: AbortSignal.any([signal, AbortSignal.timeout(UPLOAD_TIMEOUT_MS)]),
    })
    await ensureOk(response)
    onProgress(index + 1, files.length)
  }
}

/** 读取条目属性。 */
export async function fetchWorkspaceStat(
  target: WorkspaceTarget,
  path: string,
  signal: AbortSignal,
): Promise<WorkspaceEntryDetail> {
  const query = new URLSearchParams({ session: target.sessionId, root: target.root, path })
  const response = await fetch(`/yuanshu-doclib/workspace/stat?${query.toString()}`, {
    headers: authHeaders(),
    signal,
  })
  await ensureOk(response)
  const body: unknown = await response.json()
  if (!isRecord(body)) throw new Error('invalid workspace stat')
  return {
    relative: path,
    name: typeof body.name === 'string' ? body.name : '',
    type: typeof body.type === 'string' ? body.type : 'other',
    size: typeof body.size === 'number' ? body.size : 0,
    modifiedAt: typeof body.modifiedAt === 'string' ? body.modifiedAt : '',
  }
}

/** 读取条目字节流，供另存为使用。 */
export async function fetchWorkspaceBlob(
  target: WorkspaceTarget,
  path: string,
  signal: AbortSignal,
): Promise<Blob> {
  const query = new URLSearchParams({ session: target.sessionId, root: target.root, path })
  const response = await fetch(`/yuanshu-doclib/workspace/download?${query.toString()}`, {
    headers: authHeaders({ accept: '*/*' }),
    signal,
  })
  await ensureOk(response)
  return response.blob()
}
