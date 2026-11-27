/** 销售合同登记契约。按项目路由写入，字段定义不依赖界面或网络。 */
import type { RecordContent } from './record-create.ts'

/** 工作台字段。合同编号仅供复核，云端请求契约没有自定义编号字段。 */
export const salesContractFields = {
  project_code: 64, requested_code: 50, counterparty_id: 16, counterparty_name: 200,
  total_amount: 17, tax_amount: 17, signed_date: 10, effective_date: 10, expiry_date: 10,
  payment_terms: 8000, delivery_terms: 8000, remark: 8000,
}

/** 定位项目和交易对方所需的资料。 */
export const salesContractRequired = ['project_code', 'counterparty_name'] as const

/** 项目编码采用宿主路由的字符范围。 */
export const contractProjectCode = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u

function validDate(value: string): boolean {
  const date = Date.parse(value)
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value
}

function validAmount(value: string): boolean {
  if (!/^(0|[1-9]\d{0,13})(\.\d{1,2})?$/u.test(value)) return false
  const canonical = value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value
  return String(Number(value)) === canonical
}

/** 本地校验项目、客户及可写字段，保留员工明确指定的合同编号供人工处理。 */
export function invalidSalesContract(content: RecordContent): readonly string[] {
  return Object.entries(salesContractFields).flatMap(([key, max]) => {
    const value = content[key]?.trim() ?? ''
    if (key === 'project_code') return contractProjectCode.test(value) ? [] : [key]
    if (key === 'counterparty_name' && !value) return content.counterparty_id?.trim() ? [] : [key]
    if (key === 'counterparty_id' && !value) return []
    if (key === 'counterparty_id') return /^[1-9]\d*$/u.test(value) && Number.isSafeInteger(Number(value)) ? [] : [key]
    if (!value) return []
    if (key === 'requested_code' || Array.from(value).length > max || value.includes('\0')) return [key]
    if (key.endsWith('_date') && !validDate(value)) return [key]
    if (key.endsWith('_amount') && !validAmount(value)) return [key]
    return []
  })
}

/** 只发送云端合同契约支持的字段。登记的初始状态为草稿。 */
export function salesContractPayload(content: RecordContent): object {
  const fields = Object.keys(salesContractFields).filter(key => key !== 'project_code' && key !== 'requested_code')
  return {
    ...Object.fromEntries(fields.flatMap((key) => {
      const value = content[key]?.trim()
      return value ? [[key, key.endsWith('_amount') || key === 'counterparty_id' ? Number(value) : value]] : []
    })),
    contract_type: 'sales', status: 'draft',
  }
}
