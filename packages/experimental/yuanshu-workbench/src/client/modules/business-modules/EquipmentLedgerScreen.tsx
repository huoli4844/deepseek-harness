/**
 * 编排设备台账查询与新建、编辑、删除弹窗。
 * 数据请求经设备数据层完成，不直接读取凭据或实现 HTTP 协议。
 */
import { useState } from 'react'
import type { WorkbenchT } from '../../app/page-api.ts'
import { EquipmentDeleteDialog, EquipmentRecordDialog } from './EquipmentRecordDialog.tsx'
import { EquipmentRecords } from './EquipmentRecords.tsx'
import { EquipmentIntake } from './EquipmentIntake.tsx'
import { useEquipmentRecords, useEquipmentWrite } from './use-equipment-ledger.ts'
import css from './equipment-ledger.module.css'

/** 渲染设备台账列表与档案操作弹窗。 */
export function EquipmentLedgerScreen({ t }: { readonly t: WorkbenchT }) {
  const records = useEquipmentRecords()
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<'created' | 'updated' | 'deleted'>()
  const write = useEquipmentWrite((outcome) => {
    setNotice(outcome)
    records.retry()
  })
  const noticeText = notice === undefined
    ? undefined
    : t(notice === 'created' ? 'equipment.created' : notice === 'updated' ? 'equipment.saved' : 'equipment.deleted')
  return <div className={css.screen}>
    <h2 className={css.screenTitle}>{t('equipment.ledger')}</h2>
    {noticeText !== undefined && <p role="status" className={css.recordStatus}>{noticeText}</p>}
    <EquipmentRecords result={records.result} loading={records.loading} error={records.error} page={records.page}
      pageCount={records.pageCount} sort={records.sort} disabled={write.pending || creating} t={t}
      onSearch={records.search} onSort={records.sortBy} onPage={records.goToPage} onRetry={records.retry}
      onCreate={() => { setCreating(true) }} onEdit={write.startEdit} onDelete={write.askDelete} />
    {creating && <EquipmentIntake initial={{}} t={t} onSaved={records.retry} onClose={() => { setCreating(false) }} />}
    {write.editing !== undefined && <EquipmentRecordDialog id={write.editing.id} draft={write.editing.draft}
      error={write.error} pending={write.pending} t={t} onChange={write.change} onSave={write.save} onClose={write.close} />}
    {write.removing !== undefined && <EquipmentDeleteDialog record={write.removing} error={write.error}
      pending={write.pending} t={t} onDelete={write.confirmDelete} onClose={write.cancelDelete} />}
  </div>
}
