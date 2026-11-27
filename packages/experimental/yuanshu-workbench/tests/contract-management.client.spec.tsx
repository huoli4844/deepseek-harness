// @vitest-environment jsdom
/** 验证合同管理页从同源代理加载并渲染真实字段。 */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { LocaleKeysOf } from '@deepseek-ai/dsh-client-ui-slots'
import { ContractManagementScreen } from '../src/client/modules/business-modules/ContractManagementScreen.tsx'
import { zh } from '../src/client/core/locales/locales.ts'

// 键域与 TranslateNS<'yuanshu.workbench'> 对齐：命名空间键加上框架 common 词汇。
const t = (key: LocaleKeysOf<'yuanshu.workbench'>, values?: Readonly<Record<string, unknown>>) => Object.entries(values ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
  zh[key as keyof typeof zh],
)

const contract = {
  id: 1, code: 'C-A', contract_type: 'purchase', counterparty_name: '甲公司', project_code: 'P-10',
  project_name: '项目甲', signed_date: '2024-01-02', effective_date: '2024-01-05', expiry_date: null,
  total_amount: 100.5, tax_amount: 10, owed_amount: 20, warranty_amount: 5, status: 'active',
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('加载合同分页并展示编号、项目、金额和状态', async () => {
  localStorage.setItem('workbench-client-token', 'token')
  const paths: URL[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
    if (typeof input !== 'string') throw new Error('预期使用同源代理字符串')
    const path = new URL(input, 'https://workbench.test')
    paths.push(path)
    return Response.json({ data: { items: [contract], total: 1, archive_total: 1, page_size: 20 } })
  }))
  render(<ContractManagementScreen t={t} />)

  await screen.findByText('C-A')
  expect(screen.getByText('采购合同')).toBeDefined()
  expect(screen.getByText('项目甲')).toBeDefined()
  // 统计面板会同时展示合同总金额和「执行中」，与表格单元格文本重复。
  expect(screen.getAllByText('¥100.50').length).toBeGreaterThan(0)
  expect(screen.getAllByText('执行中').length).toBeGreaterThan(0)
  expect(screen.getByText('第 1 页，共 1 页')).toBeDefined()
  expect(paths[0]?.pathname).toBe('/yuanshu-workbench/contracts')
  expect(paths[0]?.searchParams.get('page_size')).toBe('20')
})
