// @vitest-environment jsdom
/** 验证资料库面板：左分类栏、工作区目录浏览与知识库文档表格、详情与预览。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import { DoclibWorkbench } from '../src/client/DoclibWorkbench.tsx'
import { SESSION_ID, WORKSPACE_ROOT, remoteStub, rowOf, sessionsStub, t, urlText } from './support.client.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})
it('个人资料页签以表格浏览工作区，点击文件夹进入下一层', async () => {
  const remote = remoteStub()
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remote} />)

  expect(screen.getByRole('navigation', { name: '资料库' })).toBeDefined()
  expect(screen.getByText(WORKSPACE_ROOT)).toBeDefined()
  expect(await screen.findByText('README.md')).toBeDefined()
  expect(screen.getByRole('button', { name: 'docs' })).toBeDefined()
  expect(remote.workspaceFiles.list).toHaveBeenCalledWith(SESSION_ID, WORKSPACE_ROOT, expect.anything())

  // 左右区域之间的分隔条支持键盘调整宽度，并持久化到本地。
  const splitter = screen.getByRole('separator', { name: '调整目录栏宽度' })
  expect(splitter.getAttribute('aria-valuenow')).toBe('216')
  fireEvent.keyDown(splitter, { key: 'ArrowRight' })
  expect(splitter.getAttribute('aria-valuenow')).toBe('232')
  expect(localStorage.getItem('yuanshu-doclib-rail-width')).toBe('232')

  // 鼠标拖动按水平位移调整宽度。
  Object.assign(splitter, {
    setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn(),
  })
  fireEvent.pointerDown(splitter, { button: 0, clientX: 300, pointerId: 1 })
  fireEvent.pointerMove(splitter, { clientX: 360, pointerId: 1 })
  fireEvent.pointerUp(splitter, { clientX: 360, pointerId: 1 })
  expect(splitter.getAttribute('aria-valuenow')).toBe('292')
  expect(localStorage.getItem('yuanshu-doclib-rail-width')).toBe('292')

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
  const preview = await screen.findByRole('dialog', { name: '文件预览' })
  expect(preview.textContent).toContain('质量手册')
  // 预览弹窗的「详情」入口保留原字段详情，详情内仍可打开原文预览。
  fireEvent.click(screen.getByRole('button', { name: '详情' }))
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
  // 有子目录的节点显示收起按钮，收起后后代目录行消失，再次点击恢复。
  const toggle = screen.getByRole('button', { name: '收起目录 体系文件第三套' })
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(screen.getByRole('button', { name: '质量手册1' })).toBeDefined()
  fireEvent.click(toggle)
  expect(screen.getByRole('button', { name: '展开目录 体系文件第三套' }).getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('button', { name: '质量手册1' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '展开目录 体系文件第三套' }))
  expect(screen.getByRole('button', { name: '质量手册1' })).toBeDefined()

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

it('勾选多份文档后可批量下载到本地', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    if (url.includes('/files/file-1/preview')) {
      return new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/pdf' } })
    }
    if (url.includes('/files/file-2/preview')) {
      return new Response(new Uint8Array([2, 3]), { headers: { 'content-type': 'application/pdf' } })
    }
    if (url.includes('/documents/doc-1')) return Response.json({ data: { document: {
      id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '',
      mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
      created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00', file_id: 'file-1',
    } } })
    if (url.includes('/documents/doc-2')) return Response.json({ data: { document: {
      id: 'doc-2', title: '项目计划', original_name: 'plan.docx', directory_path: '',
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sensitivity: 'public', parse_status: 'parsed', tags_json: '',
      created_at: '2026-11-24T00:30:00+08:00', updated_at: '2026-11-24T01:00:00+08:00', file_id: 'file-2',
    } } })
    return Response.json({ data: { list: [
      { id: 'doc-1', title: '质量手册', original_name: 'quality.pdf', directory_path: '',
        mime_type: 'application/pdf', sensitivity: 'internal', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00' },
      { id: 'doc-2', title: '项目计划', original_name: 'plan.docx', directory_path: '',
        mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sensitivity: 'public', parse_status: 'parsed', tags_json: '',
        created_at: '2026-11-24T00:30:00+08:00', updated_at: '2026-11-24T01:00:00+08:00' },
    ], page: 1, page_size: 20, total: 2 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  const save = vi.fn(async () => ({ status: 'saved' as const, path: '/Users/me/file' }))
  const fileActions = { save, copyImage: vi.fn(), canSaveAs: true } as unknown as FileActions
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileActions={fileActions} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  await screen.findByRole('button', { name: '质量手册' })
  fireEvent.click(screen.getByRole('checkbox', { name: '全选' }))
  fireEvent.click(await screen.findByRole('button', { name: '下载' }))

  await waitFor(() => { expect(save).toHaveBeenCalledTimes(2) })
  expect(save.mock.calls.map(call => (call as unknown as [{ name: string }])[0].name))
    .toEqual(['quality.pdf', 'plan.docx'])
})
