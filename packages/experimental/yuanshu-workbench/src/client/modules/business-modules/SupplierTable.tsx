/** 展示当前页供应商记录与操作入口，不持有状态或请求后台。 */
import { Button, IconEditOutlineRegular, IconTrashOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import css from './business-modules.module.css'
import type { SupplierRecord } from './supplier-model.ts'

const columns = [
  'code', 'name', 'shortName', 'supplierType', 'category', 'contactPerson', 'contactPhone', 'contactEmail',
  'address', 'bankInfo', 'paymentTerms', 'qualityRating', 'deliveryRating', 'priceRating', 'serviceRating',
  'totalScore', 'admissionStatus', 'ownerUserId', 'remark', 'createdBy', 'createdAt', 'updatedAt',
  'deletedAt', 'sourceBucket', 'sourceObjectKey', 'sourceSheet', 'sourceRowNo', 'ingestionBatchId',
  'evidenceRefId', 'confidence', 'reviewStatus', 'businessTenantId', 'status',
] as const

/** 渲染供应商档案表格及编辑、删除图标按钮。 */
export function SupplierTable({ suppliers, t, onEdit, onDelete, disabled, sort, onSort }: {
  readonly suppliers: readonly SupplierRecord[]
  readonly t: WorkbenchT
  readonly onEdit: (supplier: SupplierRecord) => void
  readonly onDelete: (supplier: SupplierRecord) => void
  readonly disabled: boolean
  readonly sort: ArchiveSort | undefined
  readonly onSort: (key: string) => void
}) {
  const byID = new Map<number | string, SupplierRecord>(suppliers.map(item => [item.id, item]))
  const rows = suppliers.map(item => ({ key: item.id, cells: {
    ...item,
    createdAt: formatBeijingDateTime(item.createdAt),
    updatedAt: formatBeijingDateTime(item.updatedAt),
    deletedAt: formatBeijingDateTime(item.deletedAt),
    status: item.status === 1 ? t('supplier.active') : item.status === 0 ? t('supplier.inactive') : item.status,
  } }))
  return <ArchiveTable stickyHeader columns={columns.map(key => ({
    key, label: t(`supplier.${key}`), width: key === 'name' || key.endsWith('At') ? 184 : 132,
  }))} rows={rows} sort={sort} onSort={onSort} actionsLabel={t('supplier.actions')} renderActions={(key) => {
    const supplier = byID.get(key)
    if (supplier === undefined) return null
    return (
      <div className={css.businessModuleActions}>
        <Tooltip label={t('supplier.edit')} side="top" portal>
          <Button size="sm" variant="toolbar" className={css.businessModuleIconButton}
            icon={<IconEditOutlineRegular size={16} />} aria-label={t('supplier.edit')}
            disabled={disabled} onClick={() => { onEdit(supplier) }} />
        </Tooltip>
        <Tooltip label={t('supplier.delete')} side="top" portal>
          <Button size="sm" variant="toolbar" className={css.businessModuleIconButton}
            icon={<IconTrashOutlineRegular size={16} />} aria-label={t('supplier.delete')}
            disabled={disabled} onClick={() => { onDelete(supplier) }} />
        </Tooltip>
      </div>
    )
  }} />
}
