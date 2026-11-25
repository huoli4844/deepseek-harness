/** 渲染客户档案字段和行操作，不管理请求状态。 */
import { Button, IconEditOutlineRegular, IconTrashOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkbenchT } from '../../app/page-api.ts'
import { ArchiveTable, type ArchiveSort } from '../../shared/ArchiveTable.tsx'
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import type { CustomerRecord } from './customer-api.ts'
import css from './business-modules.module.css'

const keys = ['code', 'name', 'shortName', 'contactPerson', 'contactPhone', 'status', 'createdAt', 'createdBy'] as const

/** 按列表排序渲染客户档案和编辑删除入口。 */
export function CustomerTable({ customers, t, sort, onSort, onEdit, onDelete, disabled }: {
  readonly customers: readonly CustomerRecord[]
  readonly t: WorkbenchT
  readonly sort: ArchiveSort | undefined
  readonly onSort: (key: string) => void
  readonly onEdit: (item: CustomerRecord) => void
  readonly onDelete: (item: CustomerRecord) => void
  readonly disabled: boolean
}) {
  const byID = new Map<number | string, CustomerRecord>(customers.map(item => [item.id, item]))
  const columns = keys.map(key => ({ key, label: t(`customer.${key}`),
    width: key === 'createdAt' || key === 'name' ? 184 : key === 'code' ? 150 : 120 }))
  const rows = customers.map(item => ({ key: item.id, cells: {
    ...item, createdAt: formatBeijingDateTime(item.createdAt),
    status: item.status === 1 ? t('customer.active') : t('customer.inactive'),
  } }))
  return <ArchiveTable stickyHeader columns={columns} rows={rows} sort={sort} onSort={onSort}
    actionsLabel={t('customer.actions')} renderActions={(key) => {
      const item = byID.get(key)
      if (item === undefined) return null
      return <div className={css.businessModuleActions}>
        <Tooltip label={t('customer.edit')} side="top" portal>
          <Button size="sm" variant="toolbar" className={css.businessModuleIconButton} icon={<IconEditOutlineRegular size={16} />}
            aria-label={t('customer.edit')} disabled={disabled} onClick={() => { onEdit(item) }} />
        </Tooltip>
        <Tooltip label={t('customer.delete')} side="top" portal>
          <Button size="sm" variant="toolbar" className={css.businessModuleIconButton} icon={<IconTrashOutlineRegular size={16} />}
            aria-label={t('customer.delete')} disabled={disabled} onClick={() => { onDelete(item) }} />
        </Tooltip>
      </div>
    }} />
}
