/** 个人页人员概览：复用组织架构统计的数据层与图表卡片，只读不写。 */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { fetchOrganizationTree } from '../business-modules/organization-api.ts'
import type { DepartmentNode, OrganizationTree } from '../business-modules/organization-model.ts'
import { OrganizationStatsPanel } from '../business-modules/OrganizationStatsPanel.tsx'

/** 递归统计部门树节点数，与组织架构页口径一致。 */
function countDepartments(nodes: readonly DepartmentNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countDepartments(node.children), 0)
}

/** 读取组织树并渲染统计条与五张图表；加载完成后通知预览流程可以发布。 */
export function PersonalHeadcount({ t, onReady }: {
  readonly t: WorkbenchT
  readonly onReady?: ((ready: boolean) => void) | undefined
}) {
  const [tree, setTree] = useState<OrganizationTree>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setTree(undefined)
    setError(false)
    onReady?.(false)
    void fetchOrganizationTree(controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setTree(data)
      onReady?.(true)
    }).catch((reason: unknown) => {
      console.error('[yuanshu] 个人页人员概览加载失败', reason)
      if (!controller.signal.aborted) setError(true)
    })
    return () => { controller.abort() }
  }, [attempt, onReady])
  const departmentCount = useMemo(() => countDepartments(tree?.departments ?? []), [tree])
  if (error) return <div role="alert">{t('registration.loadError')}{' '}
    <Button onClick={() => { setAttempt(value => value + 1) }}>{t('organization.retry')}</Button>
  </div>
  if (tree === undefined) return <p role="status">{t('registration.loading')}</p>
  return <OrganizationStatsPanel stats={tree.stats} departmentCount={departmentCount}
    unassignedCount={tree.unassignedCount} t={t} />
}
