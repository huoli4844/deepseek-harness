/** 在已加载的权限目录内搜索，保留命中项的上级路径，不变更授权状态。 */
import type { PermissionNode } from './profile-permissions-source.ts'

/** 按权限名称和编码筛选；命中分组时保留其完整分支。 */
export function filterProfilePermissions(nodes: readonly PermissionNode[], query: string): readonly PermissionNode[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return nodes
  const filter = (branch: readonly PermissionNode[]): readonly PermissionNode[] => branch.flatMap((node) => {
    if ([node.name, node.code].some(value => value.toLowerCase().includes(keyword))) return [node]
    const children = filter(node.children)
    return children.length ? [{ ...node, children }] : []
  })
  return filter(nodes)
}
