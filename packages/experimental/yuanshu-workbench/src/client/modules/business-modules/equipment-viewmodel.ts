/** 整理设备台账的展示字段和排序切换，不依赖 React 或请求。 */
import { formatBeijingDateTime } from '../../shared/beijing-time.ts'
import type { WorkbenchT } from '../../app/page-api.ts'
import {
  equipmentColumns, lifecycleStatuses, runtimeStatuses,
  type EquipmentDraft, type EquipmentField, type EquipmentRecord, type EquipmentSort,
} from './equipment-model.ts'

/** 把后台状态取值转换为本地文案，未知取值原样展示。 */
export function lifecycleLabel(t: WorkbenchT, value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const status = lifecycleStatuses.find(item => item === value)
  return status === undefined ? value : t(`equipment.lifecycle.${status}`)
}

/** 把后台运行状态取值转换为本地文案，未知取值原样展示。 */
export function runtimeLabel(t: WorkbenchT, value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const status = runtimeStatuses.find(item => item === value)
  return status === undefined ? value : t(`equipment.runtime.${status}`)
}

/** 转换审计时间与状态文案，保留后端提供的其余字段。 */
export function equipmentCells(record: EquipmentRecord, t: WorkbenchT): Readonly<Record<string, string | number | undefined>> {
  const { created_at: createdAt, updated_at: updatedAt } = record.values
  return {
    ...record.values,
    lifecycle_status: lifecycleLabel(t, record.values.lifecycle_status),
    runtime_status: runtimeLabel(t, record.values.runtime_status),
    created_at: formatBeijingDateTime(typeof createdAt === 'string' ? createdAt : undefined),
    updated_at: formatBeijingDateTime(typeof updatedAt === 'string' ? updatedAt : undefined),
  }
}

/** 把后台记录还原为编辑草稿，缺失字段按空文本处理。 */
export function equipmentDraft(record: EquipmentRecord | undefined): EquipmentDraft {
  const value = (key: EquipmentField): string => {
    const entry = record?.values[key]
    return typeof entry === 'number' ? String(entry) : entry ?? ''
  }
  return {
    code: value('code'), name: value('name'), equipmentType: value('equipment_type'),
    workshop: value('workshop'), model: value('model'), manufacturer: value('manufacturer'),
    purchaseDate: value('purchase_date'), arrivalDate: value('arrival_date'),
    lifecycleStatus: record?.values.lifecycle_status === undefined ? 'active' : value('lifecycle_status'),
    runtimeStatus: record?.values.runtime_status === undefined ? 'idle' : value('runtime_status'),
    maintIntervalDays: record?.values.maint_interval_days === undefined ? '0' : value('maint_interval_days'),
    serialNo: value('serial_no'), qrCode: value('qr_code'),
    categoryCode: value('category_code'), categoryName: value('category_name'),
    subcategoryCode: value('subcategory_code'), subcategoryName: value('subcategory_name'),
    remark: value('remark'),
  }
}

/** 切换后端白名单中的排序项，同一表头按升序、降序切换。 */
export function nextEquipmentSort(current: EquipmentSort | undefined, key: string): EquipmentSort | undefined {
  const column = equipmentColumns.find(column => column.key === key)
  if (column === undefined) return current
  return { key: column.key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' }
}
