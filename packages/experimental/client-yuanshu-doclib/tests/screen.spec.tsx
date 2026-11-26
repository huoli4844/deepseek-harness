// @vitest-environment jsdom
/** 验证资料库面板：左分类栏、工作区目录浏览与知识库文档表格、详情与预览。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import { zh } from '../src/client/locales.ts'
import { DoclibWorkbench } from '../src/client/DoclibWorkbench.tsx'
import type { SessionsService } from '../src/client/workspace-source.ts'

const t = (key: keyof typeof zh, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

const SESSION_ID = 'sess-1'
const WORKSPACE_ROOT = '/tmp/project'

/** 取 fetch 请求的 URL 文本，兼容字符串与 URL 入参。 */
function urlText(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** 找到包含指定文本的表格行（同名文本可能同时出现在左侧栏）。 */
function rowOf(text: string): HTMLElement {
  const row = screen.getAllByText(text)
    .map(element => element.closest('tr'))
    .find(candidate => candidate !== null)
  if (row === undefined || row === null) throw new Error(`row missing: ${text}`)
  return row
}

/** 构造带一个主会话的宿主会话服务桩：快照缓存一次，保持引用稳定。 */
function sessionsStub(): SessionsService {
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
function remoteStub() {
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('个人资料页签以表格浏览工作区，点击文件夹进入下一层', async () => {
  const remote = remoteStub()
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remote} />)

  expect(screen.getByText('资料库')).toBeDefined()
  expect(screen.getByText(WORKSPACE_ROOT)).toBeDefined()
  expect(await screen.findByText('README.md')).toBeDefined()
  expect(screen.getByRole('button', { name: 'docs' })).toBeDefined()
  expect(remote.workspaceFiles.list).toHaveBeenCalledWith(SESSION_ID, WORKSPACE_ROOT, expect.anything())

  fireEvent.click(screen.getByRole('button', { name: 'docs' }))
  expect(await screen.findByText('方案.pdf')).toBeDefined()
  expect(remote.workspaceFiles.list).toHaveBeenCalledWith(SESSION_ID, `${WORKSPACE_ROOT}/docs`, expect.anything())

  fireEvent.click(screen.getByRole('button', { name: '工作区' }))
  expect(await screen.findByText('README.md')).toBeDefined()
})

it('项目文件夹页签按集合加载文档，支持搜索、类型筛选与详情预览', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  localStorage.setItem('yuanshu-active-tenant', 'shaoshi')
  const open = vi.fn()
  vi.stubGlobal('open', open)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    if (url.includes('/documents/')) return Response.json({ data: { document: {
      id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '体系文件第三套/质量手册',
      mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '质量,手册',
      created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00', file_id: 'file-9',
    } } })
    const params = new URL(url, 'http://localhost').searchParams
    return Response.json({ data: { list: [
      { id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '体系文件第三套/质量手册',
        mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00' },
      { id: 'doc-2', title: '项目计划', original_name: 'plan.docx', directory_path: '计划',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sensitivity: 'public', parse_status: 'failed', tags_json: '',
        created_at: '2026-11-24T00:30:00+08:00', updated_at: '2026-11-24T01:00:00+08:00' },
    ], page: Number(params.get('page')), page_size: 20, total: 2 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  expect(await screen.findByText('项目资料')).toBeDefined()
  expect(await screen.findByRole('button', { name: '质量手册' })).toBeDefined()
  expect(screen.getByText('项目计划')).toBeDefined()
  expect(fetchMock.mock.calls.some(([input]) => urlText(input).includes('collection_id=col-1'))).toBe(true)
  expect(screen.getByText('共 2 份文档')).toBeDefined()

  // 类型筛选只影响当前页展示，计数提示同步更新。
  fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'pdf' } })
  expect(screen.queryByText('项目计划')).toBeNull()
  expect(screen.getByText('本页 1/2 份')).toBeDefined()

  fireEvent.change(screen.getByLabelText('搜索'), { target: { value: '质量' } })
  fireEvent.submit(screen.getByLabelText('搜索').closest('form') as HTMLFormElement)
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([input]) =>
      new URL(urlText(input), 'http://localhost').searchParams.get('keyword') === '质量')).toBe(true)
  })

  fireEvent.click(await screen.findByRole('button', { name: '质量手册' }))
  const dialog = await screen.findByRole('dialog', { name: '文档详情' })
  expect(dialog.textContent).toContain('quality.pdf')
  expect(dialog.textContent).toContain('质量、手册')
  fireEvent.click(screen.getByRole('button', { name: '预览原文' }))
  await waitFor(() => {
    expect(open).toHaveBeenCalledWith('blob:mock', '_blank', 'noopener')
    expect(fetchMock.mock.calls.some(([input]) => urlText(input).includes('/files/file-9/preview'))).toBe(true)
  })
})

it('目录由文档目录字段聚合，点击后本地过滤文档', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    return Response.json({ data: { list: [
      { id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '体系文件第三套/质量手册',
        mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00' },
      { id: 'doc-2', title: '项目计划', original_name: 'plan.docx', directory_path: '计划',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sensitivity: 'public', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-24T00:30:00+08:00', updated_at: '2026-11-24T01:00:00+08:00' },
    ], page: 1, page_size: 200, total: 2 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  expect(await screen.findByRole('button', { name: '项目计划' })).toBeDefined()
  expect(screen.getByRole('button', { name: /^体系文件第三套/ })).toBeDefined()

  fireEvent.click(screen.getByRole('button', { name: /^体系文件第三套/ }))
  await waitFor(() => { expect(screen.queryByText('项目计划')).toBeNull() })
  expect(screen.getByRole('button', { name: '质量手册' })).toBeDefined()
  expect(screen.getByText('共 1 份文档')).toBeDefined()
})

it('存储设置弹窗读取 NAS 配置与健康状态并保存', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = urlText(input)
    if (url.includes('/storage/health')) return Response.json({ data: {
      healthy: true, readable: true, writable: false, message: 'ok', latency_ms: 4,
    } })
    if (url.includes('/storage/config')) {
      if (init?.method === 'PUT') return Response.json({ data: {} })
      return Response.json({ data: {
        endpoint: '8.148.158.251:9001', bucket: 'southx', region: 'us-east-1', use_ssl: false,
        configured: true, credentials_configured: true, credential_source: 'environment',
      } })
    }
    return Response.json({ data: { list: [] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '存储设置' }))
  const dialog = await screen.findByRole('dialog', { name: '存储设置' })
  expect(await screen.findByDisplayValue('8.148.158.251:9001')).toBeDefined()
  expect(dialog.textContent).toContain('连接正常')

  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([input, init]) =>
      urlText(input).includes('/storage/config') && init?.method === 'PUT')).toBe(true)
  })
  const put = fetchMock.mock.calls.find(([input, init]) =>
    urlText(input).includes('/storage/config') && init?.method === 'PUT')
  const payload = put?.[1]?.body
  const body = JSON.parse(typeof payload === 'string' ? payload : '{}') as Record<string, unknown>
  expect(body).toMatchObject({ endpoint: '8.148.158.251:9001', bucket: 'southx', region: 'us-east-1', use_ssl: false })
  expect(body.access_key).toBeUndefined()
})

it('本地文件双击用默认应用打开，右键可定位与复制路径', async () => {
  const remote = remoteStub()
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remote} />)
  await screen.findByText('README.md')

  fireEvent.doubleClick(rowOf('README.md'))
  await waitFor(() => {
    expect(remote.session.openWorkspacePath).toHaveBeenCalledWith(
      { path: `${WORKSPACE_ROOT}/README.md` }, expect.anything())
  })

  fireEvent.contextMenu(rowOf('README.md'), { clientX: 12, clientY: 24 })
  expect(screen.getByRole('menu')).toBeDefined()
  fireEvent.click(screen.getByRole('menuitem', { name: '打开所在文件夹' }))
  await waitFor(() => {
    expect(remote.session.openWorkspacePath).toHaveBeenCalledWith(
      { path: `${WORKSPACE_ROOT}/README.md`, action: 'reveal' }, expect.anything())
  })

  fireEvent.contextMenu(rowOf('README.md'), { clientX: 12, clientY: 24 })
  fireEvent.click(screen.getByRole('menuitem', { name: '复制路径' }))
  await waitFor(() => { expect(writeText).toHaveBeenCalledWith(`${WORKSPACE_ROOT}/README.md`) })
})

it('本地资料支持新建文件夹与查看属性，写操作走工作区路由', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/workspace/stat')) {
      return Response.json({ name: 'README.md', type: 'file', size: 1024, modifiedAt: '2026-11-25T00:00:00.000Z' })
    }
    return Response.json({ ok: true, changed: 1 })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  await screen.findByText('README.md')

  fireEvent.click(screen.getByRole('button', { name: /新建文件夹/u }))
  const dialog = await screen.findByRole('dialog', { name: '新建文件夹' })
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新目录' } })
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
  await waitFor(() => {
    const write = fetchMock.mock.calls.find(([input]) => urlText(input).includes('/workspace/mkdir'))
    expect(write).toBeDefined()
    const rawBody = write?.[1]?.body
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}') as Record<string, unknown>
    expect(body).toMatchObject({ session: SESSION_ID, root: WORKSPACE_ROOT, directory: '', name: '新目录' })
  })
  await waitFor(() => { expect(screen.queryByRole('dialog', { name: '新建文件夹' })).toBeNull() })
  expect(dialog).toBeDefined()

  fireEvent.contextMenu(rowOf('README.md'), { clientX: 12, clientY: 24 })
  fireEvent.click(screen.getByRole('menuitem', { name: '属性' }))
  const detail = await screen.findByRole('dialog', { name: '属性' })
  expect(detail.textContent).toContain('1.0 KB')
  expect(fetchMock.mock.calls.some(([input]) => urlText(input).includes('/workspace/stat?session=sess-1')))
    .toBe(true)
})

it('远端文档右键下载走桌面另存对话框', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    if (url.includes('/files/file-9/preview')) {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } })
    }
    if (url.includes('/documents/doc-1')) return Response.json({ data: { document: {
      id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '体系文件第三套/质量手册',
      mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
      created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00', file_id: 'file-9',
    } } })
    return Response.json({ data: { list: [
      { id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '体系文件第三套/质量手册',
        mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00' },
    ], page: 1, page_size: 20, total: 1 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const save = vi.fn(async () => ({ status: 'saved' as const, path: '/Users/me/quality.pdf' }))
  const fileActions = { save, copyImage: vi.fn(), canSaveAs: true } as unknown as FileActions
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileActions={fileActions} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  await screen.findByRole('button', { name: '质量手册' })
  fireEvent.contextMenu(rowOf('质量手册'), { clientX: 20, clientY: 30 })
  fireEvent.click(screen.getByRole('menuitem', { name: '下载' }))

  await waitFor(() => { expect(save).toHaveBeenCalled() })
  const [source, mode] = save.mock.calls[0] as unknown as [
    { name: string; mediaType: string; read: (signal: AbortSignal) => Promise<Blob> }, string,
  ]
  expect(mode).toBe('saveAs')
  expect(source.name).toBe('quality.pdf')
  expect(source.mediaType).toBe('application/pdf')
  const blob = await source.read(new AbortController().signal)
  expect(blob.size).toBe(3)
})
