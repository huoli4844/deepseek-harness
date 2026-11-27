/** 供应商管理页面，读取元枢供应商档案并提供受控的增删改操作。 */
import { useEffect, useState } from 'react'
import {
  Button,
  Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import { ArchiveSearchForm } from './ArchiveSearchForm.tsx'
import { SupplierForm } from './SupplierForm.tsx'
import { SupplierStatsPanel } from './SupplierStatsPanel.tsx'
import { SupplierScorePanel } from './SupplierScorePanel.tsx'
import {
  createSupplier,
  deleteSupplier,
  fetchSupplierCategories,
  fetchSupplierPage,
  updateSupplier,
} from './supplier-api.ts'
import css from './business-modules.module.css'
import { SupplierTable } from './SupplierTable.tsx'
import type { SupplierDraft, SupplierRecord } from './supplier-model.ts'
import { errorState } from './supplier-viewmodel.ts'
import { useRecordList } from './use-record-list.ts'
import { useSupplierStats } from './use-supplier-stats.ts'

const emptyDraft: SupplierDraft = {
  code: '', name: '', shortName: '', supplierType: 'material', category: '', contactPerson: '',
  contactPhone: '', contactEmail: '', address: '', admissionStatus: 'pending', status: 1,
}

function draftFromSupplier(supplier: SupplierRecord): SupplierDraft {
  const { id: _id, ...draft } = supplier
  return draft
}

/** 渲染供应商列表和编辑表单。 */
export function SupplierManagementScreen({ t }: { readonly t: WorkbenchT }) {
  const list = useRecordList(fetchSupplierPage)
  const { state, items } = list
  const [revision, setRevision] = useState(0)
  const stats = useSupplierStats(revision)
  const [editing, setEditing] = useState<SupplierRecord | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<SupplierDraft>(emptyDraft)
  const [deleting, setDeleting] = useState<SupplierRecord | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [categories, setCategories] = useState<readonly string[]>()
  const [categoryFailed, setCategoryFailed] = useState(false)
  const [categoryRequest, setCategoryRequest] = useState(0)
  const retryCategories = () => { setCategoryRequest(previous => previous + 1) }
  useEffect(() => {
    const controller = new AbortController()
    void fetchSupplierCategories(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setCategories(result)
      setCategoryFailed(false)
    }).catch((error: unknown) => {
      if (controller.signal.aborted || errorState(error) !== 'failure') return
      setCategoryFailed(true)
    })
    return () => { controller.abort() }
  }, [categoryRequest])

  const openCreate = () => {
    setEditing(undefined)
    setDraft(emptyDraft)
    setFormError(undefined)
    setFormOpen(true)
    setMessage(undefined)
  }
  const openEdit = (supplier: SupplierRecord) => {
    setEditing(supplier)
    setDraft(draftFromSupplier(supplier))
    setFormError(undefined)
    setFormOpen(true)
    setMessage(undefined)
  }
  const closeForm = () => {
    if (busy) return
    setFormOpen(false)
    setEditing(undefined)
    setFormError(undefined)
  }
  const save = () => {
    if (draft.code.trim() === '' || draft.name.trim() === '') {
      setFormError(t('supplier.required'))
      return
    }
    if (busy) return
    setBusy(true)
    const controller = new AbortController()
    const operation = editing === undefined
      ? createSupplier(draft, controller.signal)
      : updateSupplier(editing.id, draft, controller.signal)
    void operation.then(() => {
      setFormOpen(false)
      setEditing(undefined)
      setFormError(undefined)
      setMessage(t('supplier.saved'))
      list.reload(true)
      retryCategories()
      setRevision(value => value + 1)
    }).catch((error: unknown) => {
      setFormError(t(errorState(error) === 'denied' ? 'supplier.denied' : 'supplier.writeFailed'))
    }).finally(() => { setBusy(false) })
  }
  const closeDelete = () => {
    if (busy) return
    setDeleting(undefined)
    setFormError(undefined)
  }
  const remove = () => {
    if (deleting === undefined) return
    if (busy) return
    setBusy(true)
    const controller = new AbortController()
    void deleteSupplier(deleting.id, controller.signal).then(() => {
      setDeleting(undefined)
      setFormError(undefined)
      setMessage(t('supplier.deleted'))
      list.reload(true)
      retryCategories()
      setRevision(value => value + 1)
    }).catch(() => { setFormError(t('supplier.writeFailed')) }).finally(() => { setBusy(false) })
  }
  const setField = <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }))
  }

  return <div className={css.businessModulePage}>
    <SupplierStatsPanel stats={stats.stats} status={stats.status} t={t} />
    <SupplierScorePanel stats={stats.stats} status={stats.status} filter={stats.filter}
      onFilter={stats.setFilter} onRefresh={stats.refresh} t={t} />
    <section className={css.archiveCard}>
      <ArchiveSearchForm resource="supplier" t={t} categories={categories} categoryFailed={categoryFailed}
        retryCategories={retryCategories} ready={state === 'ready'} onCreate={openCreate}
        onSearch={(filters) => { list.search(filters) }} />
      {state === 'loading' && <p role="status">{t('supplier.loading')}</p>}
      {state === 'login' && <p role="alert">{t('supplier.login')} <Button onClick={() => { list.reload(true) }}>{t('supplier.retry')}</Button></p>}
      {state === 'denied' && <p role="alert">{t('supplier.denied')} <Button onClick={() => { list.reload(true) }}>{t('supplier.retry')}</Button></p>}
      {state === 'failure' && <p role="alert">{t('supplier.failure')} <Button onClick={() => { list.reload(true) }}>{t('supplier.retry')}</Button></p>}
      {state === 'ready' && items.length === 0 && <p>{t('supplier.empty')}</p>}
      {(state === 'ready' || state === 'loading') && <div className={css.archiveTableScroll} aria-busy={state === 'loading'}>
        <SupplierTable
          suppliers={items}
          t={t}
          disabled={busy || state === 'loading'}
          sort={list.sort}
          onSort={list.sortBy}
          onEdit={openEdit}
          onDelete={(supplier) => { setDeleting(supplier); setFormError(undefined); setMessage(undefined) }}
        />
      </div>}
      {message !== undefined && <p role="status">{message}</p>}
      <ArchiveListFooter resource="supplier" t={t} archiveTotal={list.archiveTotal} ready={state === 'ready'}
        page={list.page} pageCount={list.pageCount} canGoNext={list.canGoNext} onPage={list.goToPage} />
    </section>
    {formOpen && <Modal
      open
      title={t(editing === undefined ? 'supplier.add' : 'supplier.edit')}
      closeLabel={t('supplier.cancel')}
      onClose={closeForm}
      footer={<div className={css.businessModuleActions}><Button variant="primary" disabled={busy} onClick={save}>{t('supplier.save')}</Button><Button variant="outline" disabled={busy} onClick={closeForm}>{t('supplier.cancel')}</Button></div>}
    >
      <SupplierForm disabled={busy} draft={draft} error={formError} t={t} setField={setField} />
    </Modal>}
    {deleting !== undefined && <Modal
      open
      title={t('supplier.delete')}
      closeLabel={t('supplier.cancel')}
      onClose={closeDelete}
      footer={<div className={css.businessModuleActions}><Button variant="primary" disabled={busy} onClick={remove}>{t('supplier.delete')}</Button><Button variant="outline" disabled={busy} onClick={closeDelete}>{t('supplier.cancel')}</Button></div>}
    >
      <p>{t('supplier.confirmDelete')}</p>
      <p>{deleting.name}</p>
      {formError !== undefined && <p className={css.businessModuleFormError} role="alert">{formError}</p>}
    </Modal>}
  </div>
}
