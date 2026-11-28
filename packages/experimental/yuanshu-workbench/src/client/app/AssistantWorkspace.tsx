/** 工作台右侧会话的输入区附件；通过上下文传递现有选择器，不依赖网络或宿主服务。 */
import { createContext, useContext, type ReactNode } from 'react'
import css from './shell.module.css'

const WorkspaceControl = createContext<ReactNode>(null)

/**
 * 将右栏已有的工作区控件交给嵌入会话的输入区，其他会话不提供该控件。
 * @param props - 当前右栏的控件及原生会话内容。
 * @returns 带工作区控件上下文的会话子树。
 */
export function AssistantWorkspaceProvider({ control, children }: {
  readonly control: ReactNode
  readonly children: ReactNode
}) {
  return <WorkspaceControl.Provider value={control}>{children}</WorkspaceControl.Provider>
}

/**
 * 在原生输入框上方靠右显示当前右栏提供的工作区选择器。
 * @returns 工作区切换行；独立会话未提供控件时不占空间。
 */
export function AssistantWorkspaceDock() {
  const control = useContext(WorkspaceControl)
  return control === null ? null : <div className={css.railComposerWorkspace}>{control}</div>
}
