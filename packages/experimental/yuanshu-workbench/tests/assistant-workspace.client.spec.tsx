// @vitest-environment jsdom
/** 验证输入区工作区选择器的局部挂载、浮层关闭和切换；不调用真实后台。 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { WorkspaceId, WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { AssistantWorkspaceDock, AssistantWorkspaceProvider } from '../src/client/app/AssistantWorkspace.tsx'
import { RailWorkspaceTree } from '../src/client/app/RailWorkspaceTree.tsx'
import { field } from '../src/business-forms/model.ts'
import { zh } from '../src/client/core/locales/locales.ts'

const workspaceId = brandString<WorkspaceId>('workspace-test')
const sessionId = brandString<SessionId>('session-test')
const strings: Readonly<Record<string, string>> = zh
const t = (key: string) => strings[key] ?? key
const snapshot: WorkspaceSnapshot = {
  items: [{ workspaceId, path: '/workspace/test', title: '一个很长的工作区名称用于验证目录与会话不丢失', sessionIds: [sessionId],
    createdAt: '2026-11-27T00:00:00Z', updatedAt: '2026-11-27T00:00:00Z' }],
  archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready', state: 'idle', error: null,
}

afterEach(cleanup)

function fixture() {
  const openWorkspace = vi.fn(async (_id: WorkspaceId) => {})
  const openSession = vi.fn(async (_id: SessionId) => {})
  const renderFactorySlot = vi.fn<PropsRenderFactories['renderFactorySlot']>(() => null)
  const view = render(<aside data-testid="rail" style={{ overflow: 'hidden', width: 280 }}>
    <header>智能问答</header>
    <AssistantWorkspaceProvider control={
      <RailWorkspaceTree t={t} workspaces={snapshot} sessions={{ [sessionId]: { displayTitle: '工作记录' } }}
        openWorkspace={openWorkspace} openSession={openSession} renderFactorySlot={renderFactorySlot} />
    }>
      <div data-testid="composer"><AssistantWorkspaceDock /><textarea aria-label="消息" /></div>
    </AssistantWorkspaceProvider>
  </aside>)
  return { ...view, openWorkspace, openSession, renderFactorySlot }
}

it('只在提供控件的右栏输入区显示，顶栏和独立会话均不重复显示', () => {
  const { container } = fixture()
  const composer = screen.getByTestId('composer')
  const trigger = within(composer).getByRole('button', { name: '工作区' })
  expect(container.querySelector('header')?.contains(trigger)).toBe(false)
  expect(trigger.compareDocumentPosition(screen.getByRole('textbox', { name: '消息' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  const independent = render(<AssistantWorkspaceDock />)
  expect(independent.container.childElementCount).toBe(0)
})

it('菜单脱离裁切容器，支持折叠、Esc 关闭与返回触发按钮焦点', async () => {
  fixture()
  const trigger = screen.getByRole('button', { name: '工作区' })
  fireEvent.click(trigger)
  const navigation = screen.getByRole('navigation', { name: '工作区' })
  expect(screen.getByTestId('rail').contains(navigation)).toBe(false)
  fireEvent.click(within(navigation).getByRole('button', { name: '收起会话' }))
  expect(within(navigation).queryByRole('button', { name: '工作记录' })).toBeNull()
  fireEvent.click(within(navigation).getByRole('button', { name: '展开会话' }))
  expect(within(navigation).getByRole('button', { name: '工作记录' })).toBeDefined()
  fireEvent.keyDown(document.activeElement ?? trigger, { key: 'Escape' })
  await waitFor(() => { expect(screen.queryByRole('navigation')).toBeNull() })
  expect(document.activeElement).toBe(trigger)
})

it('切换工作区与会话后关闭菜单，新建目录流始终使用存活的输入区锚点', async () => {
  const { openWorkspace, openSession, renderFactorySlot } = fixture()
  const trigger = screen.getByRole('button', { name: '工作区' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: /一个很长的工作区名称/ }))
  await waitFor(() => { expect(screen.queryByRole('navigation')).toBeNull() })
  expect(openWorkspace).toHaveBeenCalledWith(workspaceId)
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '工作记录' }))
  await waitFor(() => { expect(screen.queryByRole('navigation')).toBeNull() })
  expect(openSession).toHaveBeenCalledWith(sessionId)
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '新建工作区' }))
  expect(screen.queryByRole('navigation')).toBeNull()
  const factory = renderFactorySlot.mock.calls.at(-1)
  expect(factory?.[0]).toBe('workspace.picker')
  expect(field(factory?.[1], 'open')).toBe(true)
  expect(field(field(factory?.[1], 'anchorRef'), 'current')).toBe(trigger)
  expect(trigger.isConnected).toBe(true)
})
