/** 资料库界面测试共用的文案坐席、宿主桩与表格查询辅助。 */
import { vi } from 'vitest'
import { screen } from '@testing-library/react'
import { zh } from '../src/client/locales.ts'
import type { SessionsService } from '../src/client/workspace-source.ts'

/** 测试用文案函数：直接展开中文键，避免依赖宿主 locale 服务。 */
export const t = (key: keyof typeof zh, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

export const SESSION_ID = 'sess-1'
export const WORKSPACE_ROOT = '/tmp/project'

/** 取 fetch 请求的 URL 文本，兼容字符串与 URL 入参。 */
export function urlText(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** 找到包含指定文本的表格行（同名文本可能同时出现在左侧栏）。 */
export function rowOf(text: string): HTMLElement {
  const row = screen.getAllByText(text)
    .map(element => element.closest('tr'))
    .find(candidate => candidate !== null)
  if (row === undefined || row === null) throw new Error(`row missing: ${text}`)
  return row
}

/** 构造带一个主会话的宿主会话服务桩：快照缓存一次，保持引用稳定。 */
export function sessionsStub(): SessionsService {
  const snapshot = {
    ids: [SESSION_ID],
    byId: { [SESSION_ID]: { id: SESSION_ID, blank: false, cwd: WORKSPACE_ROOT } },
  }
  return {
    list: {
      getSnapshot: () => snapshot as never,
      subscribe: () => () => undefined,
    },
  }
}

/** workspaceFiles.list 桩：根目录含一个子目录与一个文件，子目录含一个文件；并记录桌面打开调用。 */
export function remoteStub() {
  const list = vi.fn(async (_sessionId: string, path: string) => {
    if (path === WORKSPACE_ROOT) {
      return { ok: true as const, value: { path: '', entries: [
        { name: 'docs', type: 'directory' as const },
        { name: 'README.md', type: 'file' as const, size: 1024 },
      ], truncated: false } }
    }
    if (path === `${WORKSPACE_ROOT}/docs`) {
      return { ok: true as const, value: { path: 'docs', entries: [
        { name: '方案.pdf', type: 'file' as const, size: 4096 },
      ], truncated: false } }
    }
    return { ok: false as const, error: { code: 'workspace-file/not-found', message: 'missing' } }
  })
  const openWorkspacePath = vi.fn(async (_request: { path: string; action?: 'reveal' }) => ({ ok: true }))
  return { workspaceFiles: { list }, session: { openWorkspacePath } }
}
