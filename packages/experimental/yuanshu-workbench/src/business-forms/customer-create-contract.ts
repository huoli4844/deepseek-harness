/** 客户登记字段、校验和写入参数，供宿主及表单共用，无网络访问。 */
import type { RecordContent } from './record-create.ts'

/** 客户接口允许填写的字段及长度上限。 */
export const customerCreateMax = {
  code: 50, name: 200, short_name: 100, industry: 100, level: 20,
  contact_person: 100, contact_phone: 50, contact_email: 100, address: 500,
  credit_limit: 17, status: 1,
}

/** 客户登记必须提供编码和名称。 */
export const customerRequired = ['code', 'name'] as const

/** 客户状态使用接口定义的原值。 */
export const customerStatuses = ['0', '1'] as const

/** 客户等级原值来自客户档案字段备注。 */
export const customerLevels = ['important', 'key', 'normal'] as const

const customerLevelLabels = new Map([
  ['重要', 'important'], ['重要客户', 'important'],
  ['重点', 'key'], ['重点客户', 'key'],
  ['普通', 'normal'], ['普通客户', 'normal'],
])

/** 判断输入是否为可提交的客户等级编码。 */
export function isCustomerLevel(value: string): value is typeof customerLevels[number] {
  return customerLevels.some(level => level === value)
}

/** 将明确的中文等级或状态预填为编码，保留未知输入供人工纠正。 */
export function normalizeCustomerOption(key: string, input: string): string {
  const value = input.trim()
  if (key === 'level') return customerLevelLabels.get(value) ?? value
  if (key === 'status') {
    const status = value.normalize('NFKC')
    if (/^(有效|启用|1\s*\(\s*有效\s*\))$/u.test(status)) return '1'
    if (/^(无效|停用|0\s*\(\s*无效\s*\))$/u.test(status)) return '0'
    return status
  }
  return input
}

const decimal = /^(0|[1-9][0-9]{0,13})(\.[0-9]{1,2})?$/u

function validCreditLimit(value: string): boolean {
  if (!decimal.test(value)) return false
  const canonical = value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value
  return String(Number(value)) === canonical
}

/** 校验客户输入，避免额度在转成 JSON 数字时丢失精度。 */
export function invalidCustomerFields(content: RecordContent): readonly string[] {
  return Object.entries(customerCreateMax).flatMap(([key, max]) => {
    const value = content[key]?.trim() ?? ''
    if (!value) return key === 'code' || key === 'name' ? [key] : []
    if (Array.from(value).length > max || value.includes('\0')) return [key]
    if (key === 'status' && !customerStatuses.some(status => status === value)) return [key]
    if (key === 'level' && !isCustomerLevel(value)) return [key]
    if (key === 'credit_limit' && !validCreditLimit(value)) return [key]
    return []
  })
}

/** 只发送已填写的可写字段，空选填值交给服务端处理。 */
export function customerCreatePayload(content: RecordContent): object {
  return Object.fromEntries(Object.keys(customerCreateMax).flatMap((key) => {
    const value = content[key]?.trim()
    return value ? [[key, key === 'status' || key === 'credit_limit' ? Number(value) : value]] : []
  }))
}
