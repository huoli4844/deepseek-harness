/** 设备台账的列定义、状态枚举与查询类型，不依赖界面或网络。 */

/** 设备服务支持展示和排序的字段，顺序与后台排序白名单一致。 */
export const equipmentColumns = [
  { key: 'code', width: 140 }, { key: 'name', width: 200 }, { key: 'equipment_type', width: 130 },
  { key: 'workshop', width: 110 }, { key: 'model', width: 120 }, { key: 'manufacturer', width: 150 },
  { key: 'lifecycle_status', width: 110 }, { key: 'runtime_status', width: 110 },
  { key: 'maint_interval_days', width: 120 }, { key: 'category_name', width: 120 },
  { key: 'subcategory_name', width: 120 }, { key: 'serial_no', width: 150 }, { key: 'qr_code', width: 150 },
  { key: 'purchase_date', width: 120 }, { key: 'arrival_date', width: 120 },
  { key: 'last_maint_date', width: 130 }, { key: 'next_maint_date', width: 130 },
  { key: 'created_at', width: 168 }, { key: 'updated_at', width: 168 },
] as const

/** 可与后台排序参数对应的设备列。 */
export type EquipmentColumn = typeof equipmentColumns[number]['key']

/** 列表行需要保留的字段：表格列加上仅编辑表单使用的编码与备注。 */
export const equipmentFields = [
  ...equipmentColumns.map(column => column.key), 'category_code', 'subcategory_code', 'remark',
] as const

/** 设备记录中可回填到编辑表单的字段。 */
export type EquipmentField = typeof equipmentFields[number]

/** 列表行的稳定标识与后台单元格值。 */
export interface EquipmentRecord {
  readonly id: number
  readonly values: Readonly<Partial<Record<EquipmentField, string | number>>>
}

/** 设备新建与编辑弹窗提交的字段，名称与后台请求体一一对应。 */
export interface EquipmentDraft {
  readonly code: string
  readonly name: string
  readonly equipmentType: string
  readonly workshop: string
  readonly model: string
  readonly manufacturer: string
  readonly purchaseDate: string
  readonly arrivalDate: string
  readonly lifecycleStatus: string
  readonly runtimeStatus: string
  readonly maintIntervalDays: string
  readonly serialNo: string
  readonly qrCode: string
  readonly categoryCode: string
  readonly categoryName: string
  readonly subcategoryCode: string
  readonly subcategoryName: string
  readonly remark: string
}

/** 来自后台的当前页、匹配总数与档案总数。 */
export interface EquipmentPage {
  readonly items: readonly EquipmentRecord[]
  readonly total: number
  readonly archiveTotal: number | undefined
  readonly pageSize: number
}

/** 已应用到后台检索的设备条件。 */
export interface EquipmentFilters {
  readonly keyword: string
}

/** 当前排序字段与方向。 */
export interface EquipmentSort {
  readonly key: EquipmentColumn
  readonly direction: 'asc' | 'desc'
}

/** 后台生命周期状态取值。 */
export const lifecycleStatuses = ['active', 'inactive', 'scrapped', 'sealed'] as const

/** 后台运行状态取值。 */
export const runtimeStatuses = ['running', 'idle', 'broken', 'maintenance', 'planned_stop'] as const
