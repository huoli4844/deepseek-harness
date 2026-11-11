/** 元枢在侧栏中的入口图标。 */
import { IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * 渲染与侧栏其他入口一致的图标；可访问名称由侧栏统一提供。
 * @param props - 侧栏传入的尺寸与选中态。
 * @returns 元枢入口图标。
 */
export function YuanShuIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconSparkleRegular size={size} />
}
