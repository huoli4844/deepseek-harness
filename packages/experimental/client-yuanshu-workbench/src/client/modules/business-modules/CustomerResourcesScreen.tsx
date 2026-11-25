/** 客户资源页面，读取元枢客户档案并提供受控的增删改操作。 */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveListFooter } from './ArchiveListFooter.tsx'
import { ArchiveSearchForm } from './ArchiveSearchForm.tsx'
import { CustomerTable } from './CustomerTable.tsx'
import { CustomerForm } from './CustomerForm.tsx'
import {
  createCustomer,
  deleteCustomer,
  fetchCustomerPage,
  type CustomerDraft,
  type CustomerErrorKind,
  type CustomerRecord,
  updateCustomer,
} from './customer-api.ts'
import css from './business-modules.module.css'
import { useRecordList } from './use-record-list.ts'

const emptyDraft: CustomerDraft = {
  code: '', name: '', shortName: '', industry: '', level: 'normal', contactPerson: '',
  contactPhone: '', contactEmail: '', address: '', creditLimit: 0, status: 1,
}

function draftFromCustomer(customer: CustomerRecord): CustomerDraft {
  const { id: _id, creditUsed: _creditUsed, createdAt: _createdAt, createdBy: _createdBy, ...draft } = customer
  return draft
}

function errorState(error: unknown): CustomerErrorKind {
  const kind = error instanceof Error ? (error as Error & { kind?: CustomerErrorKind }).kind : undefined
  return kind === 'login' || kind === 'denied' ? kind : 'failure'
}

/** 渲染客户档案列表和编辑表单。 */
export function CustomerResourcesScreen({ t }: { readonly t: WorkbenchT }) {
  const list = useRecordList(fetchCustomerPage)
  const { state, items } = list
  const [editing, setEditing] = useState<CustomerRecord | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft)
  const [deleting, setDeleting] = useState<CustomerRecord | undefined>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [formError, setFormError] = useState<string>()

  const openCreate = () => {
    setEditing(undefined)
    setDraft(emptyDraft)
    setFormError(undefined)
    setFormOpen(true)
    setMessage(undefined)
  }
  const openEdit = (customer: CustomerRecord) => {
    setEditing(customer)
    setDraft(draftFromCustomer(customer))
    setFormError(undefined)
    setFormOpen(true)
    setMessage(undefined)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(undefined)
    setFormError(undefined)
  }
  const save = () => {
    if (draft.code.trim() === '' || draft.name.trim() === '') {
      setFormError(t('customer.required'))
      return
    }
    setBusy(true)
    const controller = new AbortController()
    const operation = editing === undefined
      ? createCustomer(draft, controller.signal)
      : updateCustomer(editing.id, draft, controller.signal)
    void operation.then(() => {
      setFormOpen(false)
      setEditing(undefined)
      setFormError(undefined)
      setMessage(t('customer.saved'))
      list.reload(true)
    }).catch((error: unknown) => {
      setFormError(t(errorState(error) === 'denied' ? 'customer.denied' : 'customer.writeFailed'))
    }).finally(() => { setBusy(false) })
  }
  const remove = () => {
    if (deleting === undefined) return
    setBusy(true)
    const controller = new AbortController()
    void deleteCustomer(deleting.id, controller.signal).then(() => {
      setDeleting(undefined)
      setFormError(undefined)
      setMessage(t('customer.deleted'))
      list.reload(true)
    }).catch(() => { setFormError(t('customer.writeFailed')) }).finally(() => { setBusy(false) })
  }
  const setField = <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }))
  }

  return <div className={css.businessModulePage}>
    <section className={css.archiveCard}>
      <ArchiveSearchForm resource="customer" t={t} ready={state === 'ready'} onCreate={openCreate}
        onSearch={(filters) => { list.search(filters) }} />
      {state === 'loading' && <p role="status">{t('customer.loading')}</p>}
      {state === 'login' && <p role="alert">{t('customer.login')} <Button onClick={() => { list.reload(true) }}>{t('customer.retry')}</Button></p>}
      {state === 'denied' && <p role="alert">{t('customer.denied')} <Button onClick={() => { list.reload(true) }}>{t('customer.retry')}</Button></p>}
      {state === 'failure' && <p role="alert">{t('customer.failure')} <Button onClick={() => { list.reload(true) }}>{t('customer.retry')}</Button></p>}
      {state === 'ready' && items.length === 0 && <p>{t('customer.empty')}</p>}
      {(state === 'ready' || state === 'loading') && <div className={css.archiveTableScroll}>
        <CustomerTable customers={items} t={t} sort={list.sort}
          onSort={list.sortBy} disabled={state === 'loading' || busy} onEdit={openEdit}
          onDelete={(customer) => { setDeleting(customer); setFormError(undefined) }} />
      </div>}
      {message !== undefined && <p role="status">{message}</p>}
      <ArchiveListFooter resource="customer" t={t} archiveTotal={list.archiveTotal} ready={state === 'ready'}
        page={list.page} pageCount={list.pageCount} canGoNext={list.canGoNext} onPage={list.goToPage} />
    </section>
    {formOpen && <Modal
      open
      title={t(editing === undefined ? 'customer.add' : 'customer.edit')}
      closeLabel={t('customer.cancel')}
      onClose={closeForm}
      footer={<div className={css.businessModuleActions}><Button variant="primary" disabled={busy} onClick={save}>{t('customer.save')}</Button><Button variant="outline" onClick={closeForm}>{t('customer.cancel')}</Button></div>}
    >
      <CustomerForm draft={draft} error={formError} t={t} setField={setField} />
    </Modal>}
    {deleting !== undefined && <Modal
      open
      title={t('customer.delete')}
      closeLabel={t('customer.cancel')}
      onClose={() => { setDeleting(undefined); setFormError(undefined) }}
      footer={<div className={css.businessModuleActions}><Button variant="primary" disabled={busy} onClick={remove}>{t('customer.delete')}</Button><Button variant="outline" onClick={() => { setDeleting(undefined); setFormError(undefined) }}>{t('customer.cancel')}</Button></div>}
    >
      <p>{t('customer.confirmDelete')}</p>
      <p>{deleting.name}</p>
      {formError !== undefined && <p className={css.businessModuleFormError} role="alert">{formError}</p>}
    </Modal>}
  </div>
}
