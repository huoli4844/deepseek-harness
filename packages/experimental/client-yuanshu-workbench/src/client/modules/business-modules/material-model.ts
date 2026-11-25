/** 物料档案、分类与查询的领域类型，不依赖界面或网络。 */

/** 物料服务支持展示和排序的字段。 */
export const materialColumns = [
  { key: 'code', width: 156 }, { key: 'name', width: 220 }, { key: 'spec', width: 164 },
  { key: 'material_type', width: 124 }, { key: 'critical_level', width: 124 },
  { key: 'category_code', width: 132 }, { key: 'category_code2', width: 132 },
  { key: 'unit', width: 88 }, { key: 'brand', width: 132 }, { key: 'model', width: 132 },
  { key: 'drawing_no', width: 136 }, { key: 'price_suggested', width: 132 },
  { key: 'safety_stock', width: 124 }, { key: 'lead_time_days', width: 132 },
  { key: 'status', width: 96 }, { key: 'remark', width: 176 },
  { key: 'created_by', width: 128 }, { key: 'created_at', width: 168 }, { key: 'updated_at', width: 168 },
] as const

/** 用于前后端共同识别的物料排序字段。 */
export type MaterialColumn = typeof materialColumns[number]['key']

/** 列表行的稳定标识与后台单元格值。 */
export interface MaterialRecord {
  readonly id: number
  readonly values: Readonly<Partial<Record<MaterialColumn, string | number>>>
}

/** 物料档案编辑弹窗提交的可维护业务字段。 */
export interface MaterialDraft {
  readonly code: string
  readonly name: string
  readonly spec: string | null
  readonly materialType: string
  readonly categoryCode: string
  readonly categoryCode2: string
  readonly unit: string
  readonly brand: string
  readonly model: string
  readonly drawingNo: string | null
  readonly priceSuggested: string
  readonly safetyStock: string
  readonly leadTimeDays: string
  readonly criticalLevel: string
  readonly remark: string
  readonly status: string
}

/** 来自后台的当前页、全档案总数与下拉选项。 */
export interface MaterialPage {
  readonly items: readonly MaterialRecord[]
  readonly total: number
  readonly archiveTotal: number
  readonly pageSize: number
  readonly materialTypes: readonly string[]
  readonly criticalLevels: readonly string[]
}

/** 已应用到后台检索的字段。 */
export interface MaterialFilters {
  readonly code: string
  readonly name: string
  readonly materialType: string
  readonly criticalLevel: string
}

/** 当前排序字段与方向。 */
export interface MaterialSort {
  readonly key: MaterialColumn
  readonly direction: 'asc' | 'desc'
}

/** 后台物料分类的树关系和显示字段。 */
export interface MaterialCategory {
  readonly id: number
  readonly parentId: number | undefined
  readonly code: string
  readonly name: string
}

/** 新建分类表单中允许提交的字段。 */
export interface MaterialCategoryDraft {
  readonly code: string
  readonly name: string
  readonly parentId: number | undefined
  readonly description: string
}
