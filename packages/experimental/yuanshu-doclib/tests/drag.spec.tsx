// @vitest-environment jsdom
/** 验证资料库文件行可拖拽到对话输入框：按下预取字节、dragstart 交给宿主拖拽服务。 */
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FileDragActions } from '@deepseek-ai/dsh-client-ui-primitives'
import { DoclibWorkbench } from '../src/client/DoclibWorkbench.tsx'
import { DocumentTable } from '../src/client/components/DocumentTable.tsx'
import type { DoclibDocument } from '../src/client/model.ts'
import { remoteStub, sessionsStub, t, urlText } from './support.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

/** 拖拽服务桩：记录预取内容，返回可观察的 start/release。 */
function dragStub() {
  const start = vi.fn(() => true)
  const release = vi.fn()
  const prepare = vi.fn(async () => ({ start, release }))
  const reportFailure = vi.fn()
  return { actions: { prepare, reportFailure } satisfies FileDragActions, prepare, start, release, reportFailure }
}

/** 拖拽事件载荷：jsdom 没有 DataTransfer 构造器，用最小可写对象代替。 */
function transfer(): DataTransfer {
  return { types: ['application/x-dsh-file'], setData: vi.fn(), items: [], effectAllowed: 'copy' } as unknown as DataTransfer
}

/** 等预取的 Promise 链跑完，再触发 dragstart。 */
async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

it('本地文件行按下时预取字节，拖拽交给宿主服务', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/workspace/download')) {
      return new Response('hello workspace', { headers: { 'content-type': 'text/markdown' } })
    }
    return Response.json({ ok: true })
  }))
  const drag = dragStub()
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileDrag={drag.actions} />)

  const name = await screen.findByRole('button', { name: 'README.md' })
  const row = name.closest('tr')
  expect(row?.getAttribute('draggable')).toBe('true')

  fireEvent.pointerDown(name, { button: 0 })
  await waitFor(() => { expect(drag.prepare).toHaveBeenCalled() })
  expect(drag.prepare).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'blob', name: 'README.md', mediaType: 'text/markdown',
  }), expect.any(AbortSignal))

  const data = transfer()
  await settle()
  fireEvent.dragStart(row!, { dataTransfer: data })
  expect(drag.start).toHaveBeenCalledWith(data, row)
})

it('勾选框按下不触发预取，未提供拖拽服务时文件行不可拖', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ ok: true })))
  const drag = dragStub()
  const { unmount } = render(
    <DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} fileDrag={drag.actions} />,
  )
  const name = await screen.findByRole('button', { name: 'README.md' })
  const row = name.closest('tr')!
  fireEvent.pointerDown(row.querySelector('input[type="checkbox"]')!, { button: 0 })
  expect(drag.prepare).not.toHaveBeenCalled()
  unmount()

  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  const plain = await screen.findByRole('button', { name: 'README.md' })
  expect(plain.closest('tr')?.getAttribute('draggable')).toBe('false')
})

it('文件右键菜单提供「添加至对话」，点击后进入附件入口', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    const url = urlText(input)
    if (url.includes('/workspace/download')) {
      return new Response('hello workspace', { headers: { 'content-type': 'text/markdown' } })
    }
    return Response.json({ ok: true })
  }))
  render(<DoclibWorkbench t={t} sessions={sessionsStub()} remote={remoteStub()} />)
  const name = await screen.findByRole('button', { name: 'README.md' })
  fireEvent.contextMenu(name.closest('tr')!, { clientX: 24, clientY: 24 })
  fireEvent.click(await screen.findByText('添加至对话'))
  // jsdom 没有 DataTransfer，也没有对话输入框，走到失败提示即证明菜单已接到附件入口。
  expect(await screen.findByText('无法添加至对话，请先打开对话')).toBeTruthy()
})

it('知识库文档行按文件类型与标题预取', async () => {
  const drag = dragStub()
  const document: DoclibDocument = {
    id: 'doc-1', title: '质量手册', originalName: 'quality.pdf', directoryPath: '体系文件',
    mimeType: 'application/pdf', sensitivity: 'internal', parseStatus: 'parsed', tags: [],
    createdAt: '2026-11-25T00:30:00+08:00', updatedAt: '2026-11-25T01:00:00+08:00', fileId: 'file-9',
  }
  const noop = vi.fn()
  render(<DocumentTable documents={[document]} page={1} pageCount={1} total={1}
    loading={false} error={undefined} t={t} selected={new Set()} sort={undefined}
    onPage={noop} onOpen={noop} onMenu={noop} onToggle={noop} onToggleAll={noop}
    onSort={noop} onRetry={noop} fileDrag={drag.actions}
    dragFile={() => ({ name: 'quality.pdf', mimeType: 'application/pdf', load: async () => new Blob(['pdf']) })} />)

  const name = screen.getByRole('button', { name: '质量手册' })
  const row = name.closest('tr')!
  expect(row.getAttribute('draggable')).toBe('true')
  fireEvent.pointerDown(name, { button: 0 })
  await waitFor(() => { expect(drag.prepare).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'blob', name: 'quality.pdf', mediaType: 'application/pdf',
  }), expect.any(AbortSignal)) })

  await settle()
  fireEvent.dragStart(row, { dataTransfer: transfer() })
  expect(drag.start).toHaveBeenCalled()
})
