/** 新建业务表单的字段约定，供宿主和客户端共用，无网络访问。 */
import {
  createFieldKeys, equipmentCreateFields, equipmentCreatePayload,
  invalidEquipmentFields, equipmentLifecycle, equipmentRuntime,
} from './equipment-contract.ts'
import { field } from './model.ts'
import { customerCreateMax, customerCreatePayload, customerLevels, customerRequired, customerStatuses, invalidCustomerFields, normalizeCustomerOption } from './customer-create-contract.ts'
import { salesContractFields, salesContractRequired, invalidSalesContract, salesContractPayload } from './sales-contract-create.ts'
import { invalidProjectFields, projectCreateMax, projectCreateOptions, projectCreatePayload } from './project-create.ts'

/** 已注册的业务登记类型。 */
export type RecordKind = 'equipment' | 'onboarding-task' | 'customer' | 'sales-contract' | 'project'
/** 预填和编辑统一使用文本，提交时按业务契约转换。 */
export type RecordContent = Readonly<Record<string, string | undefined>>

interface Definition {
  readonly fields: readonly string[]
  readonly required: readonly string[]
  readonly unique: readonly string[]
  readonly receiptKey: string
  readonly path: string
  readonly options: Readonly<Record<string, readonly string[]>>
  readonly max: Readonly<Record<string, number>>
  readonly invalid: (content: RecordContent) => readonly string[]
  readonly payload: (content: RecordContent) => object
}

const taskFields = ['task_no', 'task_type', 'due_date', 'status'] as const
const taskStates = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'WAIVED'] as const
const taskMax = { task_no: 64, task_type: 64, due_date: 10, status: 32 }

function invalidTask(content: RecordContent) {
  return taskFields.filter((key) => {
    const value = content[key]?.trim() ?? ''
    if (key === 'task_no' || key === 'task_type') return !value || Array.from(value).length > taskMax[key] || value.includes('\0')
    if (key === 'status') return !!value && !taskStates.some(state => state === value)
    if (!value) return false
    const date = Date.parse(value)
    return !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value
  })
}

/** 每个可用动作对应已核对的固定资源及字段。 */
export const recordDefinitions: Readonly<Record<RecordKind, Definition>> = {
  equipment: {
    fields: createFieldKeys, required: ['code', 'name'], unique: ['code', 'serial_no'], receiptKey: 'code', path: 'equipments',
    max: equipmentCreateFields, options: { lifecycle_status: equipmentLifecycle, runtime_status: equipmentRuntime },
    invalid: invalidEquipmentFields, payload: equipmentCreatePayload,
  },
  'onboarding-task': {
    fields: taskFields, required: ['task_no', 'task_type'], unique: ['task_no'], receiptKey: 'task_no', path: 'onboarding-tasks',
    max: taskMax, options: { status: taskStates }, invalid: invalidTask,
    payload: content => Object.fromEntries(taskFields.flatMap((key) => {
      const value = content[key]?.trim()
      return value ? [[key, value]] : []
    })),
  },
  customer: {
    fields: Object.keys(customerCreateMax), required: customerRequired, unique: ['code'], receiptKey: 'code', path: 'customers',
    max: customerCreateMax, options: { level: customerLevels, status: customerStatuses },
    invalid: invalidCustomerFields, payload: customerCreatePayload,
  },
  'sales-contract': {
    fields: Object.keys(salesContractFields), required: salesContractRequired, unique: [], receiptKey: 'code', path: 'contracts',
    max: salesContractFields, options: {}, invalid: invalidSalesContract, payload: salesContractPayload,
  },
  project: {
    fields: Object.keys(projectCreateMax), required: ['code', 'name'], unique: ['code'], receiptKey: 'code', path: 'projects',
    max: projectCreateMax, options: projectCreateOptions, invalid: invalidProjectFields, payload: projectCreatePayload,
  },
}

/** 只接收已注册字段，布局和操作由工作台提供。 */
export function parseRecordContent(kind: RecordKind, value: unknown): RecordContent {
  return Object.fromEntries(recordDefinitions[kind].fields.flatMap((key) => {
    const cell = field(value, key)
    return typeof cell === 'string' && cell.length <= 8000
      ? [[key, kind === 'customer' ? normalizeCustomerOption(key, cell) : cell]]
      : []
  }))
}
