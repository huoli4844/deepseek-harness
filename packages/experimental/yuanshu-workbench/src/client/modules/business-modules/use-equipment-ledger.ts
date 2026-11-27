/** 编排设备台账查询与新建、编辑、删除弹窗，不渲染页面。 */
import { useEffect, useRef, useState } from 'react'
import { createEquipment, deleteEquipment, fetchEquipmentPage, updateEquipment } from './equipment-api.ts'
import type { EquipmentDraft, EquipmentFilters, EquipmentPage, EquipmentRecord, EquipmentSort } from './equipment-model.ts'
import { equipmentDraft, nextEquipmentSort } from './equipment-viewmodel.ts'
import { RECORD_PAGE_SIZE, recordPageCount } from './record-list-viewmodel.ts'

type RequestError = 'login' | 'denied' | 'failure'

/** 设备台账写入失败时展示的文案键。 */
export type EquipmentWriteError =
  | 'equipment.login' | 'equipment.writeUnauthorized' | 'equipment.denied'
  | 'equipment.conflict' | 'equipment.invalid' | 'equipment.updateError' | 'equipment.deleteError'

function responseStatus(error: unknown): unknown {
  return error instanceof Error && 'status' in error ? error.status : undefined
}

function requestError(error: unknown): RequestError {
  switch (responseStatus(error)) {
    case 401: return 'login'
    case 403: return 'denied'
    default: return 'failure'
  }
}

function writeError(error: unknown, fallback: EquipmentWriteError): EquipmentWriteError {
  if (error instanceof Error && 'kind' in error && error.kind === 'missingToken') return 'equipment.login'
  switch (responseStatus(error)) {
    case 401: return 'equipment.writeUnauthorized'
    case 403: return 'equipment.denied'
    case 409: return 'equipment.conflict'
    case 400: return 'equipment.invalid'
    default: return fallback
  }
}

/** 加载设备台账，任何筛选或排序变化都从第一页开始。 */
export function useEquipmentRecords() {
  const [query, setQuery] = useState<{
    readonly page: number
    readonly filters: EquipmentFilters
    readonly sort: EquipmentSort | undefined
  }>({ page: 1, filters: { keyword: '' }, sort: undefined })
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<EquipmentPage>()
  const [error, setError] = useState<RequestError>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    void fetchEquipmentPage({ ...query, pageSize: RECORD_PAGE_SIZE }, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      const lastPage = recordPageCount(data.total, data.pageSize)
      if (lastPage !== undefined && query.page > lastPage) {
        setQuery(previous => ({ ...previous, page: lastPage }))
        return
      }
      setResult(data)
      setLoading(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const kind = requestError(error)
      if (kind !== 'failure') setResult(undefined)
      setError(kind)
      setLoading(false)
    })
    return () => { controller.abort() }
  }, [query, retry])

  const pageCount = recordPageCount(result?.total, result?.pageSize ?? RECORD_PAGE_SIZE)
  return {
    page: query.page, sort: query.sort, pageCount, loading, error, result,
    search: (filters: EquipmentFilters) => {
      setQuery(previous => ({ ...previous, filters, page: 1 }))
    },
    sortBy: (key: string) => {
      setQuery(previous => ({ ...previous, sort: nextEquipmentSort(previous.sort, key), page: 1 }))
    },
    goToPage: (page: number) => {
      if (!Number.isSafeInteger(page) || page < 1 || page > (pageCount ?? 1)) return
      setQuery(previous => previous.page === page ? previous : { ...previous, page })
    },
    retry: () => { setRetry(value => value + 1) },
  }
}

/** 控制设备新建、编辑与删除弹窗的提交状态，卸载后取消请求。 */
export function useEquipmentWrite(onSaved: (outcome: 'created' | 'updated' | 'deleted') => void) {
  const [editing, setEditing] = useState<{ readonly id?: number; readonly draft: EquipmentDraft }>()
  const [removing, setRemoving] = useState<EquipmentRecord>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<EquipmentWriteError>()
  const active = useRef<AbortController>()

  useEffect(() => () => { active.current?.abort() }, [])

  const run = (task: (signal: AbortSignal) => Promise<void>, fallback: EquipmentWriteError, outcome: 'created' | 'updated' | 'deleted') => {
    if (active.current !== undefined) return
    const controller = new AbortController()
    active.current = controller
    setPending(true)
    setError(undefined)
    void task(controller.signal).then(() => {
      if (controller.signal.aborted) return
      setEditing(undefined)
      setRemoving(undefined)
      onSaved(outcome)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(writeError(error, fallback))
    }).finally(() => {
      if (controller.signal.aborted) return
      active.current = undefined
      setPending(false)
    })
  }

  return {
    editing, removing, pending, error,
    startCreate: () => {
      setError(undefined)
      setEditing({ draft: equipmentDraft(undefined) })
    },
    startEdit: (record: EquipmentRecord) => {
      setError(undefined)
      setEditing({ id: record.id, draft: equipmentDraft(record) })
    },
    close: () => { if (active.current === undefined) setEditing(undefined) },
    change: (patch: Partial<EquipmentDraft>) => {
      setEditing(previous => previous === undefined ? previous : { ...previous, draft: { ...previous.draft, ...patch } })
    },
    save: () => {
      if (editing === undefined) return
      const { draft, id } = editing
      if (draft.code.trim() === '' || draft.name.trim() === '' ||
        !/^\d+$/.test(draft.maintIntervalDays) || Number(draft.maintIntervalDays) > 2_147_483_647) {
        setError('equipment.invalid')
        return
      }
      const task = id === undefined
        ? (signal: AbortSignal) => createEquipment(draft, signal)
        : (signal: AbortSignal) => updateEquipment(id, draft, signal)
      run(task, 'equipment.updateError', id === undefined ? 'created' : 'updated')
    },
    askDelete: (record: EquipmentRecord) => {
      setError(undefined)
      setRemoving(record)
    },
    cancelDelete: () => { if (active.current === undefined) setRemoving(undefined) },
    confirmDelete: () => {
      if (removing === undefined) return
      run(signal => deleteEquipment(removing.id, signal), 'equipment.deleteError', 'deleted')
    },
  }
}
