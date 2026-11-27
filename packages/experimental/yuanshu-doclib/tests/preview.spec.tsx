// @vitest-environment jsdom
/** 验证预览弹窗：文本/图片内联渲染、不可渲染类型降级、下载入口与本地地址释放。 */
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

/** 知识库文档列表与详情响应：按给定字段返回一条文档，预览字节每次新建以支持重复读取。 */
function remoteFetchMock(document: Record<string, unknown>, preview: () => Response): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    if (url.includes('/files/')) return preview()
    if (url.includes('/documents/')) return Response.json({ data: { document } })
    return Response.json({ data: { list: [document], page: 1, page_size: 20, total: 1 } })
  })
}

const TEXT_DOC = {
  id: 'doc-1', title: '说明', original_name: '说明.md', directory_path: '',
  mime_type: 'text/markdown', sensitivity: 'public', parse_status: 'parsed', tags_json: '',
  created_at: '2026-11-25T00:30:00+08:00', updated_at: '2026-11-25T01:00:00+08:00', file_id: 'file-1',
}

it('点击文本文档后在弹窗内联展示内容，并可下载到本地', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', remoteFetchMock(TEXT_DOC,
    () => new Response('# 标题\n正文内容', { headers: { 'content-type': 'text/markdown' } })))
  const save = vi.fn(async () => ({ status: 'saved' as const, path: '/Users/me/说明.md' }))
  const fileActions = { save, copyImage: vi.fn(), canSaveAs: true } as unknown as FileActions
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileActions={fileActions} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '说明' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  await waitFor(() => { expect(dialog.textContent).toContain('正文内容') })

  fireEvent.click(within(dialog).getByRole('button', { name: '下载到本地' }))
  await waitFor(() => { expect(save).toHaveBeenCalled() })
  const [source] = save.mock.calls[0] as unknown as [{ name: string }]
  expect(source.name).toBe('说明.md')
})

it('文本预览支持搜索栏、命中高亮与上一个/下一个跳转', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', remoteFetchMock(TEXT_DOC,
    () => new Response('alpha beta\nalpha gamma', { headers: { 'content-type': 'text/plain' } })))
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '说明' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  await waitFor(() => { expect(dialog.textContent).toContain('alpha beta') })

  fireEvent.click(within(dialog).getByRole('button', { name: '搜索' }))
  const input = within(dialog).getByRole('textbox', { name: '在文件中搜索' })
  fireEvent.change(input, { target: { value: 'alpha' } })
  expect(within(dialog).getAllByText('alpha')).toHaveLength(2)
  expect(dialog.textContent).toContain('第 1 / 2 个')

  fireEvent.click(within(dialog).getByRole('button', { name: '下一个匹配' }))
  expect(dialog.textContent).toContain('第 2 / 2 个')
  fireEvent.click(within(dialog).getByRole('button', { name: '上一个匹配' }))
  expect(dialog.textContent).toContain('第 1 / 2 个')

  fireEvent.change(input, { target: { value: 'missing' } })
  expect(dialog.textContent).toContain('无匹配')
})

it('列表带文件 ID 时展示独立窗口入口，点击打开同源窗口并关闭弹窗', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', remoteFetchMock(TEXT_DOC,
    () => new Response('hello', { headers: { 'content-type': 'text/markdown' } })))
  const open = vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '说明' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  fireEvent.click(within(dialog).getByRole('button', { name: '独立窗口' }))
  expect(open).toHaveBeenCalledWith(
    expect.stringContaining('/yuanshu-doclib/window?id=file-1'), '_blank', 'width=960,height=720')
  await waitFor(() => { expect(screen.queryByRole('dialog', { name: '文件预览' })).toBeNull() })
})

it('图片文档在弹窗内联展示预览图', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', remoteFetchMock({
    ...TEXT_DOC, title: '照片', original_name: 'photo.png', mime_type: 'image/png',
  }, () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '照片' }))
  await screen.findByRole('dialog', { name: '文件预览' })
  const image = await screen.findByRole('img', { name: '照片 的预览' })
  expect(image.getAttribute('src')).toBe('blob:photo')
})

it('不可内联渲染的压缩包展示降级说明与醒目下载入口', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  vi.stubGlobal('fetch', remoteFetchMock({
    ...TEXT_DOC, title: '归档包', original_name: 'archive.zip', mime_type: 'application/zip',
  }, () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/zip' } })))
  const save = vi.fn(async () => ({ status: 'saved' as const, path: '/Users/me/archive.zip' }))
  const fileActions = { save, copyImage: vi.fn(), canSaveAs: true } as unknown as FileActions
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileActions={fileActions} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '归档包' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  expect(dialog.textContent).toContain('该文件类型暂不支持应用内预览')
  expect(dialog.textContent).toContain('压缩包')

  fireEvent.click(within(dialog).getByRole('button', { name: '下载到本地' }))
  await waitFor(() => { expect(save).toHaveBeenCalled() })
  const [source] = save.mock.calls[0] as unknown as [{ name: string }]
  expect(source.name).toBe('archive.zip')
})

it('Office 文档经宿主转 PDF 后在弹窗内联展示', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const document = {
    ...TEXT_DOC, title: '项目计划', original_name: 'plan.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/collections')) return Response.json({ data: { list: [
      { id: 'col-1', code: 'project', name: '项目资料' },
    ], total: 1 } })
    if (url.includes('/office/pdf')) {
      return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { headers: { 'content-type': 'application/pdf' } })
    }
    if (url.includes('/files/')) {
      return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { headers: { 'content-type': 'application/octet-stream' } })
    }
    if (url.includes('/documents/')) return Response.json({ data: { document } })
    return Response.json({ data: { list: [document], page: 1, page_size: 20, total: 1 } })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:office-pdf')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)

  fireEvent.click(screen.getByRole('button', { name: '项目文件夹' }))
  fireEvent.click(await screen.findByRole('button', { name: '项目计划' }))
  await screen.findByRole('dialog', { name: '文件预览' })
  const frame = await screen.findByTitle('Office 预览')
  expect(frame.getAttribute('src')).toBe('blob:office-pdf')
  expect(fetchMock.mock.calls.some(([input]) => urlText(input).includes('/office/pdf?ext=docx'))).toBe(true)
})

it('本地 PDF 点击后在弹窗内联展示，关闭时释放本地地址', async () => {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (urlText(input).includes('/workspace/download')) {
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } })
    }
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-pdf')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  await screen.findByText('README.md')

  fireEvent.click(screen.getByRole('button', { name: 'docs' }))
  fireEvent.click(await screen.findByRole('button', { name: '方案.pdf' }))
  const dialog = await screen.findByRole('dialog', { name: '文件预览' })
  expect(await screen.findByTitle('PDF 预览')).toBeDefined()
  // 本地工作区文件没有系统级窗口，不提供独立窗口入口。
  expect(within(dialog).queryByRole('button', { name: '独立窗口' })).toBeNull()

  fireEvent.click(within(dialog).getAllByRole('button', { name: '关闭' })[0])
  await waitFor(() => { expect(revoke).toHaveBeenCalledWith('blob:local-pdf') })
})
