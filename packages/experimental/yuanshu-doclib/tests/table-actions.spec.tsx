// @vitest-environment jsdom
/** 验证资料库表格的列宽拖动，以及本地/远端文件的预览与下载入口。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { FileActions } from '@deepseek-ai/dsh-client-ui-file-actions/types'
import { DoclibWorkbench } from '../src/client/DoclibWorkbench.tsx'
import { remoteStub, sessionsStub, t, urlText } from './support.client.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('表头列宽可拖动调整', async () => {
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  await screen.findByText('README.md')

  // 个人资料表格只有类型、大小两列可拖；把手在列左边界，向左拖动加宽本列。
  const handles = screen.getAllByRole('separator', { name: '调整列宽' })
  expect(handles.length).toBe(2)
  const kindHeader = handles[0]?.closest('th') as HTMLTableCellElement
  Object.defineProperty(kindHeader, 'getBoundingClientRect', { value: () => ({ width: 110 }) })
  Object.assign(handles[0], {
    setPointerCapture: vi.fn(), hasPointerCapture: () => false, releasePointerCapture: vi.fn(),
  })
  fireEvent.pointerDown(handles[0], { button: 0, clientX: 300, pointerId: 1 })
  fireEvent.pointerMove(handles[0], { clientX: 260, pointerId: 1 })
  fireEvent.pointerUp(handles[0], { clientX: 260, pointerId: 1 })
  expect(kindHeader.style.width).toBe('150px')
})

it('点击本地文本文件打开应用内预览，可直接下载到本地', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/workspace/download')) {
      return new Response('hello workspace', { headers: { 'content-type': 'text/markdown' } })
    }
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  await screen.findByText('README.md')

  // 本地文件按扩展名进入文本预览，单次点击即可看到内容。
  fireEvent.click(screen.getByRole('button', { name: 'README.md' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  await waitFor(() => { expect(dialog.textContent).toContain('hello workspace') })

  const downloads = () => fetchMock.mock.calls.filter(([input]) => urlText(input).includes('/workspace/download')).length
  const before = downloads()
  fireEvent.click(within(dialog).getByRole('button', { name: '下载到本地' }))
  await waitFor(() => { expect(downloads()).toBeGreaterThan(before) })
})

it('远端文档预览弹窗的详情入口保留字段详情，并可直接下载到本地', async () => {
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
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  const save = vi.fn(async () => ({ status: 'saved' as const, path: '/Users/me/quality.pdf' }))
  const fileActions = { save, copyImage: vi.fn(), canSaveAs: true } as unknown as FileActions
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileActions={fileActions} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '质量手册' }))
  await screen.findByRole('dialog', { name: '文件预览' })
  fireEvent.click(screen.getByRole('button', { name: '详情' }))
  const detail = await screen.findByRole('dialog', { name: '文档详情' })
  fireEvent.click(within(detail).getByRole('button', { name: '下载到本地' }))
  await waitFor(() => { expect(save).toHaveBeenCalled() })
  const [source, mode] = save.mock.calls[0] as unknown as [
    { name: string; mediaType: string }, string,
  ]
  expect(mode).toBe('saveAs')
  expect(source.name).toBe('quality.pdf')
  expect(source.mediaType).toBe('application/pdf')
})
