/** 向工作台子树提供实时外观类，供挂载到页面根节点的弹窗复用。 */
import { createContext } from 'react'

/** 原生对话没有工作台外观时，弹窗使用宿主页面的主题和字号。 */
export const WorkbenchAppearanceContext = createContext('')
