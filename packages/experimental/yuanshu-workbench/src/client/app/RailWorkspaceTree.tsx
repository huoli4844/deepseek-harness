/** 对话栏右上角的工作区切换树：与官方侧栏一致的「工作区 → 会话」二级结构，支持切换工作区、打开会话与新建工作区。
 * 新建走官方 workspace.picker 工厂（目录选择流 + 失败弹窗），本组件只负责树形展示与跳转。 */
import { useRef, useState } from 'react'
import {
  IconChevronDownOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  WorkspaceId, WorkspaceSnapshot,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchT } from './page-api.ts'
import shellCss from './shell.module.css'

/** 会话行展示所需的最小字段。 */
type SessionRow = { readonly displayTitle: string } | undefined

/** 渲染工作区切换触发按钮与向下弹出的二级树面板。 */
export function RailWorkspaceTree({ t, workspaces, sessions, openWorkspace, openSession, renderFactorySlot }: {
  readonly t: WorkbenchT
  /** 工作区列表响应式快照（框架 useWorkspaces 席位结果）。 */
  readonly workspaces: WorkspaceSnapshot
  /** 会话摘要快照（框架 useSessions 席位结果），用于显示会话标题。 */
  readonly sessions: Readonly<Record<SessionId, SessionRow>>
  readonly openWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  readonly openSession: (sessionId: SessionId) => Promise<void>
  readonly renderFactorySlot: PropsRenderFactories['renderFactorySlot']
}) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<WorkspaceId>>(new Set())
  const [flowOpen, setFlowOpen] = useState(false)
  const addAnchor = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); setFlowOpen(false) }
  return <div className={shellCss.railWorkspace}>
    <button type="button" className={shellCss.railWorkspaceTrigger} aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}>
      <IconFolderCloseRegular size={14} />
      <span>{t('rail.workspaceBar')}</span>
      <IconChevronDownOutlineRegular size={12} />
    </button>
    {open && <>
      <div className={shellCss.railNavBackdrop} aria-hidden="true" onClick={close} />
      <div className={shellCss.railWorkspacePanel} role="navigation" aria-label={t('rail.workspaceBar')}>
        {workspaces.phase === 'pending' && <p className={shellCss.railWorkspaceState}>{t('conversation.loading')}</p>}
        {workspaces.items.map((workspace) => {
          const expanded = !collapsed.has(workspace.workspaceId)
          const title = workspace.title.trim() === '' ? t('rail.workspaceDefault') : workspace.title
          return <div key={workspace.workspaceId} className={shellCss.railWsGroup}>
            <div className={shellCss.railWsHead}>
              <button type="button" className={shellCss.railWsOpen} title={workspace.path}
                onClick={() => { void openWorkspace(workspace.workspaceId).then(close) }}>
                <IconFolderCloseRegular size={15} />
                <span className={shellCss.railWsTitle}>{title}</span>
                <span className={shellCss.railWsCount}>{String(workspace.sessionIds.length)}</span>
              </button>
              {workspace.sessionIds.length > 0 && <button type="button" className={shellCss.railWsChevron}
                aria-expanded={expanded} aria-label={expanded ? t('rail.collapseGroup') : t('rail.expandGroup')}
                onClick={() => {
                  setCollapsed((previous) => {
                    const next = new Set(previous)
                    if (next.has(workspace.workspaceId)) next.delete(workspace.workspaceId)
                    else next.add(workspace.workspaceId)
                    return next
                  })
                }}>
                <span className={shellCss.railWsChevronIcon}
                  style={{ transform: expanded ? undefined : 'rotate(-90deg)' }}>
                  <IconChevronDownOutlineRegular size={12} />
                </span>
              </button>}
            </div>
            {expanded && <div className={shellCss.railWsSessions}>
              {workspace.sessionIds.map(sessionId => <button key={sessionId} type="button"
                className={shellCss.railWsSession}
                onClick={() => { void openSession(sessionId).then(close) }}>
                <span className={shellCss.railWsSessionTitle}>
                  {sessions[sessionId]?.displayTitle ?? t('rail.blankSession')}
                </span>
              </button>)}
            </div>}
          </div>
        })}
        <button ref={addAnchor} type="button" className={shellCss.railWsAdd}
          onClick={() => { setFlowOpen(true) }}>
          <IconPlusOutlineRegular size={14} />
          <span>{t('rail.addWorkspace')}</span>
        </button>
      </div>
    </>}
    {/* 官方工作区选择菜单（含“添加工作区”目录流），由面板底部按钮锚定。 */}
    {renderFactorySlot('workspace.picker', {
      open: flowOpen,
      anchorRef: addAnchor,
      onPick: (id) => {
        setFlowOpen(false)
        void openWorkspace(id).then(close)
      },
      onClose: () => { setFlowOpen(false) },
    })}
  </div>
}
