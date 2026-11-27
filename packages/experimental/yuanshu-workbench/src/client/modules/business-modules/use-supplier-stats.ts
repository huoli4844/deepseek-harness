/** 供应商统计编排：全量拉取后聚合，支持按类型/准入筛选评分区间与手动刷新。 */
import { useEffect, useState } from 'react'
import { fetchSupplierCatalog } from './supplier-api.ts'
import type { SupplierCatalog } from './supplier-model.ts'
import {
  emptyScoreFilter,
  supplierStats,
  type SupplierScoreFilter,
  type SupplierStats,
} from './supplier-viewmodel.ts'

/** 读取全量供应商档案并聚合统计；revision 或手动刷新时重新拉取。 */
export function useSupplierStats(revision: number) {
  const [catalog, setCatalog] = useState<SupplierCatalog>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'failure'>('loading')
  const [filter, setFilter] = useState<SupplierScoreFilter>(emptyScoreFilter)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    void fetchSupplierCatalog(controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setCatalog(data)
      setStatus('ready')
    }).catch(() => {
      // 统计属于辅助信息，失败时只切换提示，不影响列表主流程。
      if (controller.signal.aborted) return
      setCatalog(undefined)
      setStatus('failure')
    })
    return () => { controller.abort() }
  }, [revision, refreshKey])

  const stats: SupplierStats | undefined = catalog === undefined
    ? undefined
    : supplierStats(catalog.items, catalog.total ?? catalog.items.length, catalog.truncated, filter)

  return {
    stats,
    status,
    filter,
    setFilter,
    refresh: () => { setRefreshKey(value => value + 1) },
  }
}
