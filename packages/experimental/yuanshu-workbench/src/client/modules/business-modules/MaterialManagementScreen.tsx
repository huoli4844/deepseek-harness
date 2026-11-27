/**
 * 编排物料分类、档案查询和档案写入弹窗。
 * 数据请求经物料数据层完成，不直接读取凭据或实现 HTTP 协议。
 */
import { useEffect, useRef, useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { MaterialCategoryDialog, MaterialCategoryPanel } from './MaterialCategoryPanel.tsx'
import { MaterialDeleteDialog, MaterialRecordDialog } from './MaterialRecordDialogs.tsx'
import { MaterialRecords } from './MaterialRecords.tsx'
import { MaterialStatsPanel } from './MaterialStatsPanel.tsx'
import { deleteMaterial, updateMaterial } from './material-api.ts'
import type { MaterialDraft, MaterialRecord } from './material-model.ts'
import { useMaterialCategories, useMaterialCategoryCreate, useMaterialRecords, useMaterialStats } from './use-material-management.ts'
import css from './material-management.module.css'

type MaterialActionError = 'material.materialWriteUnauthorized' | 'material.denied' | 'material.materialConflict' | 'material.invalidMaterial' | 'material.updateError'

function nullableText(value: string | number | undefined): string | null {
  const result = value === undefined ? '' : String(value)
  return result === '' ? null : result
}

function draftFor(record: MaterialRecord): MaterialDraft {
  return {
    code: String(record.values.code ?? ''), name: String(record.values.name ?? ''), spec: nullableText(record.values.spec),
    materialType: String(record.values.material_type ?? ''), categoryCode: String(record.values.category_code ?? ''),
    categoryCode2: String(record.values.category_code2 ?? ''), unit: String(record.values.unit ?? ''),
    brand: String(record.values.brand ?? ''), model: String(record.values.model ?? ''), drawingNo: nullableText(record.values.drawing_no),
    priceSuggested: String(record.values.price_suggested ?? ''), safetyStock: String(record.values.safety_stock ?? ''),
    leadTimeDays: String(record.values.lead_time_days ?? ''), criticalLevel: String(record.values.critical_level ?? ''),
    remark: String(record.values.remark ?? ''), status: String(record.values.status ?? ''),
  }
}

function actionError(error: unknown): MaterialActionError {
  const status = error instanceof Error && 'status' in error ? error.status : undefined
  if (status === 401) return 'material.materialWriteUnauthorized'
  if (status === 403) return 'material.denied'
  if (status === 409) return 'material.materialConflict'
  if (status === 400) return 'material.invalidMaterial'
  return 'material.updateError'
}

function validDraft(draft: MaterialDraft): boolean {
  return draft.code.trim() !== '' && draft.name.trim() !== '' && draft.materialType.trim() !== '' && draft.criticalLevel.trim() !== '' &&
    /^(0|[1-9]\d*)(\.\d{1,4})?$/u.test(draft.priceSuggested) && /^(0|[1-9]\d*)(\.\d{1,4})?$/u.test(draft.safetyStock) &&
    /^\d+$/u.test(draft.leadTimeDays) && /^-?\d+$/u.test(draft.status)
}

/** 渲染分类树、物料档案表和档案操作弹窗。 */
export function MaterialManagementScreen({ t }: { readonly t: WorkbenchT }) {
  const categories = useMaterialCategories()
  const records = useMaterialRecords()
  const [revision, setRevision] = useState(0)
  const stats = useMaterialStats(revision)
  const categoryCreate = useMaterialCategoryCreate((category) => {
    categories.refreshAfterCreate(category.parentId)
    records.chooseCategory(category.id)
  })
  const selectedCategory = categories.rows.find(category => category.id === records.categoryId)
  const categoryNames = new Map(categories.rows.map(category => [category.code, category.name]))
  // 统计尚未就绪时回退到列表接口返回的筛选项，避免下拉框暂时为空。
  const statsTypes = stats.stats?.types.map(bucket => bucket.key).filter(key => key !== '')
  const statsLevels = stats.stats?.levels.map(bucket => bucket.key).filter(key => key !== '')
  const [editing, setEditing] = useState<MaterialRecord>()
  const [deleting, setDeleting] = useState<MaterialRecord>()
  const [draft, setDraft] = useState<MaterialDraft>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MaterialActionError>()
  const [notice, setNotice] = useState<string>()
  const active = useRef<AbortController>()

  useEffect(() => () => { active.current?.abort() }, [])
  const openEdit = (record: MaterialRecord) => {
    setEditing(record); setDraft(draftFor(record)); setError(undefined); setNotice(undefined)
  }
  const closeActions = () => {
    if (busy) return
    setEditing(undefined); setDeleting(undefined); setDraft(undefined); setError(undefined)
  }
  const save = () => {
    if (editing === undefined || draft === undefined || busy) return
    if (!validDraft(draft)) { setError('material.invalidMaterial'); return }
    const controller = new AbortController()
    active.current = controller; setBusy(true); setError(undefined)
    void updateMaterial(editing.id, draft, controller.signal).then(() => {
      if (controller.signal.aborted) return
      setEditing(undefined); setDraft(undefined); setNotice(t('material.saved')); records.retry()
      setRevision(value => value + 1)
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(actionError(caught))
    }).finally(() => { if (!controller.signal.aborted) { active.current = undefined; setBusy(false) } })
  }
  const remove = () => {
    if (deleting === undefined || busy) return
    const controller = new AbortController()
    active.current = controller; setBusy(true); setError(undefined)
    void deleteMaterial(deleting.id, controller.signal).then(() => {
      if (controller.signal.aborted) return
      setDeleting(undefined); setNotice(t('material.deleted')); records.retry()
      setRevision(value => value + 1)
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(actionError(caught))
    }).finally(() => { if (!controller.signal.aborted) { active.current = undefined; setBusy(false) } })
  }
  const changeDraft = <K extends keyof MaterialDraft>(key: K, value: MaterialDraft[K]) => {
    setDraft(previous => previous === undefined ? previous : { ...previous, [key]: value })
  }

  return <div className={css.screen}>
    <MaterialStatsPanel stats={stats.stats} categoryNames={categoryNames} status={stats.status} t={t} />
    <div className={css.layout}>
      <MaterialCategoryPanel t={t} selectedId={records.categoryId} status={categories.status}
        nodes={categories.nodes} keyword={categories.draft} onKeyword={categories.setDraft} onSearch={categories.search}
        isExpanded={categories.isExpanded} onExpand={categories.toggle} onSelect={records.chooseCategory}
        onAdd={categoryCreate.start} onRetry={categories.retry} />
      <MaterialRecords t={t} result={records.result} loading={records.loading} error={records.error} disabled={busy || records.loading}
        typeOptions={statsTypes === undefined || statsTypes.length === 0 ? undefined : statsTypes}
        levelOptions={statsLevels === undefined || statsLevels.length === 0 ? undefined : statsLevels}
        onEdit={openEdit} onDelete={(record) => { setDeleting(record); setError(undefined); setNotice(undefined) }} page={records.page}
        pageCount={records.pageCount} sort={records.sort} onSearch={records.search} onSort={records.sortBy}
        onPage={records.goToPage} onRetry={records.retry} />
    </div>
    {notice !== undefined && <p role="status">{notice}</p>}
    {categoryCreate.open && <MaterialCategoryDialog t={t} parent={selectedCategory} onClose={categoryCreate.close}
      error={categoryCreate.error === undefined ? undefined : t(categoryCreate.error)}
      onSave={categoryCreate.save} pending={categoryCreate.pending} />}
    {editing !== undefined && draft !== undefined && <MaterialRecordDialog draft={draft} result={records.result} pending={busy} t={t}
      error={error === undefined ? undefined : t(error)} onChange={changeDraft} onSave={save} onClose={closeActions} />}
    {deleting !== undefined && <MaterialDeleteDialog record={deleting} pending={busy} t={t}
      error={error === undefined ? undefined : t(error)} onDelete={remove} onClose={closeActions} />}
  </div>
}
