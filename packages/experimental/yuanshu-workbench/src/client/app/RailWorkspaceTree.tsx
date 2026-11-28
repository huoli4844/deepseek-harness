/** 输入框右上方的工作区切换树：与官方侧栏一致的「工作区 → 会话」二级结构，支持切换工作区、打开会话、新建工作区与重命名。
 * 新建走官方 workspace.picker 工厂（目录选择流 + 失败弹窗），重命名走远程 workspace.rename；本组件负责树形展示与编辑交互。 */
import { useRef, useState } from 'react'
import {
  IconChevronDownOutlineRegular, IconEditOutlineRegular, IconFolderCloseRegular, IconPlusOutlineRegular,
  Input, Menu,
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

/** 渲染工作区切换触发按钮与向上弹出的二级树面板。 */
export function RailWorkspaceTree({ t, workspaces, sessions, openWorkspace, openSession, renameWorkspace, renderFactorySlot }: {
  readonly t: WorkbenchT
  /** 工作区列表响应式快照（框架 useWorkspaces 席位结果）。 */
  readonly workspaces: WorkspaceSnapshot
  /** 会话摘要快照（框架 useSessions 席位结果），用于显示会话标题。 */
  readonly sessions: Readonly<Record<SessionId, SessionRow>>
  readonly openWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  readonly openSession: (sessionId: SessionId) => Promise<void>
  /** 重命名工作区：远程提交，失败时抛出错误由本组件展示。 */
  readonly renameWorkspace: (workspaceId: WorkspaceId, title: string) => Promise<void>
  readonly renderFactorySlot: PropsRenderFactories['renderFactorySlot']
}) {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<ReadonlySet<WorkspaceId>>(new Set())
  const [flowOpen, setFlowOpen] = useState(false)
  /** 行内重命名状态：正在编辑的工作区与草稿标题；空草稿不提交。 */
  const [editingId, setEditingId] = useState<WorkspaceId>()
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState(false)
  const triggerAnchor = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); setFlowOpen(false); setEditingId(undefined); setRenameError(false) }
  /** 提交重命名：成功后退出编辑；标题为空或远程失败时保留输入并提示。 */
  const submitRename = (workspaceId: WorkspaceId) => {
    const title = renameDraft.trim()
    if (title === '') { setRenameError(true); return }
    void renameWorkspace(workspaceId, title)
      .then(() => { setEditingId(undefined); setRenameError(false) })
      .catch(() => { setRenameError(true) })
  }
  return <div className={shellCss.railWorkspace}>
    <Menu open={open} onClose={close} portal side="top" align="end" autoFocus
      listClassName={shellCss.railWorkspacePanel} anchor={
        <button ref={triggerAnchor} type="button" className={shellCss.railWorkspaceTrigger} aria-expanded={open || flowOpen}
          onClick={() => { setOpen(value => !value) }}>
          <IconFolderCloseRegular size={14} />
          <span>{t('rail.workspaceBar')}</span>
          <IconChevronDownOutlineRegular size={12} />
        </button>
      }>
      <div role="navigation" aria-label={t('rail.workspaceBar')}>
        {workspaces.phase === 'pending' && <p className={shellCss.railWorkspaceState}>{t('conversation.loading')}</p>}
        {workspaces.items.map((workspace) => {
          const expanded = !collapsed.has(workspace.workspaceId)
          const title = workspace.title.trim() === '' ? t('rail.workspaceDefault') : workspace.title
          return <div key={workspace.workspaceId} className={shellCss.railWsGroup}>
            <div className={shellCss.railWsHead}>
              {editingId === workspace.workspaceId ? <form className={shellCss.railWsRename}
                onSubmit={(event) => { event.preventDefault(); submitRename(workspace.workspaceId) }}>
                <Input autoFocus value={renameDraft} aria-label={t('rail.rename')}
                  onChange={(event) => { setRenameDraft(event.target.value); setRenameError(false) }}
                  onKeyDown={(event) => { if (event.key === 'Escape') setEditingId(undefined) }} />
                <button type="submit" className={shellCss.railWsRenameSave}>{t('rail.renameSave')}</button>
                {renameError && <span className={shellCss.railWsRenameError} role="alert">{t('rail.renameInvalid')}</span>}
              </form>
                : <>
                  <button type="button" className={shellCss.railWsOpen} title={workspace.path}
                    onClick={() => { void openWorkspace(workspace.workspaceId).then(close) }}>
                    <IconFolderCloseRegular size={15} />
                    <span className={shellCss.railWsTitle}>{title}</span>
                    <span className={shellCss.railWsCount}>{String(workspace.sessionIds.length)}</span>
                  </button>
                  <button type="button" className={shellCss.railWsRenameBtn} aria-label={`${t('rail.rename')}: ${title}`}
                    onClick={() => { setRenameDraft(workspace.title.trim()); setRenameError(false); setEditingId(workspace.workspaceId) }}>
                    <IconEditOutlineRegular size={13} />
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
                </>}
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
        <button type="button" className={shellCss.railWsAdd}
          onClick={() => { setOpen(false); setFlowOpen(true) }}>
          <IconPlusOutlineRegular size={14} />
          <span>{t('rail.addWorkspace')}</span>
        </button>
      </div>
    </Menu>
    {/* 目录选择流锚定常驻按钮，切换菜单关闭后锚点仍保留。 */}
    {renderFactorySlot('workspace.picker', {
      open: flowOpen,
      anchorRef: triggerAnchor,
      onPick: (id) => {
        setFlowOpen(false)
        void openWorkspace(id).then(close)
      },
      onClose: () => { setFlowOpen(false) },
    })}
  </div>
}
