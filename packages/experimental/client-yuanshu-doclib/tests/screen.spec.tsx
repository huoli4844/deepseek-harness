// @vitest-environment jsdom
/** 验证资料库面板：左分类栏、工作区目录浏览与知识库文档表格、详情与预览。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

/** workspaceFiles.list 桩：根目录含一个子目录与一个文件，子目录含一个文件。 */
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
  return { workspaceFiles: { list } }
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
