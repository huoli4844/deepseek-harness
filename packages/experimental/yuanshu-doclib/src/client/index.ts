/** 资料库客户端模块：向元枢工作台导出浏览面板与文案，不再注册独立主面板或侧栏入口。 */
import type { Context } from '@deepseek-ai/cordis'

export { DoclibWorkbench } from './DoclibWorkbench.tsx'
export type { DoclibPanelProps } from './DoclibWorkbench.tsx'
export { en, zh } from './locales.ts'

/**
 * 面板挂载已移交工作台，模块本身不再注册槽位。
 * 保留 apply 导出以兼容客户端插件加载器。
 */
export function apply(_ctx: Context): void {}
