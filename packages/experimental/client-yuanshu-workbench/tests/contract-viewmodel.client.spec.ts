/** 验证合同列表的金额、类型、状态、项目回退与排序整理。 */
import { expect, it } from 'vitest'
import {
  contractAmount, contractCells, contractStatusLabel, contractTypeLabel, nextContractSort,
} from '../src/client/modules/business-modules/contract-viewmodel.ts'
import { zh } from '../src/client/core/locales/locales.ts'

const t = (key: keyof typeof zh, values?: Readonly<Record<string, unknown>>) => Object.entries(values ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  zh[key],
)

it('合同金额按人民币保留两位小数并添加千分位', () => {
  expect(contractAmount(1234.5)).toBe('¥1,234.50')
  expect(contractAmount('0')).toBe('¥0.00')
  expect(contractAmount(undefined)).toBeUndefined()
  expect(contractAmount('not-a-number')).toBeUndefined()
})

it('已知合同类型和状态使用本地文案，未知取值原样展示', () => {
  expect(contractTypeLabel(t, 'purchase')).toBe('采购合同')
  expect(contractTypeLabel(t, 'custom')).toBe('custom')
  expect(contractTypeLabel(t, undefined)).toBeUndefined()
  expect(contractStatusLabel(t, 'active')).toBe('执行中')
  expect(contractStatusLabel(t, '待确认')).toBe('待确认')
  expect(contractStatusLabel(t, '')).toBeUndefined()
})

it('项目名称缺失时回退展示项目编号，并保留业务日期原值', () => {
  const cells = contractCells({
    id: 1,
    values: {
      code: 'C-1', project_code: 'P-10', signed_date: '2024-01-02', total_amount: 100.5, status: 'active',
    },
  }, t)
  expect(cells.project_name).toBe('P-10')
  expect(cells.signed_date).toBe('2024-01-02')
  expect(cells.total_amount).toBe('¥100.50')
  expect(cells.status).toBe('执行中')
})

it('同一合同表头在升降序之间切换', () => {
  expect(nextContractSort(undefined, 'code')).toEqual({ key: 'code', direction: 'asc' })
  expect(nextContractSort(nextContractSort(undefined, 'code'), 'code')).toEqual({ key: 'code', direction: 'desc' })
  expect(nextContractSort({ key: 'code', direction: 'desc' }, 'status')).toEqual({ key: 'status', direction: 'asc' })
})
