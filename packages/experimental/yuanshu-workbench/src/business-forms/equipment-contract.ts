/** 设备新增字段白名单，依据后台 EquipmentDraft；供宿主和本地表单共用。 */
import { field } from './model.ts'

/** 可写字段及文本上限；日期、整数和状态使用各自约束。 */
export const equipmentCreateFields = {
  code: 50, name: 200, equipment_type: 50, workshop: 50, model: 100, manufacturer: 200,
  serial_no: 100, qr_code: 200, category_code: 64, category_name: 120,
  subcategory_code: 64, subcategory_name: 120, remark: 4000, purchase_date: 10, arrival_date: 10,
  maint_interval_days: 10, lifecycle_status: 20, runtime_status: 20,
} as const

export type EquipmentCreateField = keyof typeof equipmentCreateFields
export type EquipmentContent = Readonly<Partial<Record<EquipmentCreateField, string>>>
export const createFieldKeys = Object.keys(equipmentCreateFields) as EquipmentCreateField[]
export const equipmentLifecycle = ['active', 'inactive', 'scrapped', 'sealed'] as const
export const equipmentRuntime = ['running', 'idle', 'broken', 'maintenance', 'planned_stop'] as const

/** 读取模型提供的候选值。无效值留给用户修正，不注入布局、动作或额外字段。 */
export function parseEquipmentContent(value: unknown): EquipmentContent {
  const result: Partial<Record<EquipmentCreateField, string>> = {}
  for (const key of createFieldKeys) {
    const cell = field(value, key)
    if (typeof cell === 'string' && cell.length <= 8000) result[key] = cell
  }
  return result
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith('0000')) return false
  const date = Date.parse(value)
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value
}

/** 返回待补齐或格式不符的字段；空白可选字段由后台应用默认值。 */
export function invalidEquipmentFields(content: EquipmentContent): EquipmentCreateField[] {
  return createFieldKeys.filter((key) => {
    const value = content[key]?.trim() ?? ''
    if (!value) return key === 'code' || key === 'name'
    if (Array.from(value).length > equipmentCreateFields[key] || value.includes('\0')) return true
    if (key === 'purchase_date' || key === 'arrival_date') return !validDate(value)
    if (key === 'maint_interval_days') return !/^\d+$/u.test(value) || Number(value) > 2_147_483_647
    if (key === 'lifecycle_status') return !equipmentLifecycle.some(item => item === value)
    if (key === 'runtime_status') return !equipmentRuntime.some(item => item === value)
    return false
  })
}

/** 生成经表单确认的接口请求体，省略未填写的可选字段。 */
export function equipmentCreatePayload(content: EquipmentContent): object {
  if (invalidEquipmentFields(content).length > 0) throw new Error('Invalid equipment fields')
  return Object.fromEntries(createFieldKeys.flatMap((key) => {
    const value = content[key]?.trim()
    return value ? [[key, key === 'maint_interval_days' ? Number(value) : value]] : []
  }))
}
