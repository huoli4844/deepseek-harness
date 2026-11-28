/** 验证项目合同搜索分页、财务授权失败降级和毛利率的加权口径。 */
import { expect, it, vi } from 'vitest'
import { contractProjectPage, portfolioFinance } from '../src/contract-projects.ts'
import { loadContractPortfolio } from '../src/contract-catalog.ts'
import { contractListQuery } from '../src/contract-list.ts'

it('卡片按项目分页，匹配相对方后保留项目全部合同，并包含无合同项目', () => {
  const portfolio = [
    { project: { code: 'P1', name: '项目一' }, finance: undefined,
      contracts: [{ id: 1, counterparty_name: '客户甲' }, { id: 2, counterparty_name: '客户乙' }] },
    { project: { code: 'P2', name: '项目二' }, finance: undefined, contracts: [] },
  ]
  const query = contractListQuery(new URLSearchParams('view=cards&keyword=客户甲'))
  if (!query) throw new Error('查询无效')
  expect(contractProjectPage(portfolio, query)).toMatchObject({ projects: [portfolio[0]], total: 1, archive_total: 2 })
  expect(contractProjectPage(portfolio, { ...query, keyword: '', page: 2, pageSize: 1 })).toMatchObject({ projects: [portfolio[1]], total: 2 })
})

it('毛利率按收入加权，财务缺失或收入为零时不伪造百分比', () => {
  const portfolio = [
    { project: {}, contracts: [], finance: { contract_amount: 100, gross_margin: 20 } },
    { project: {}, contracts: [], finance: { contract_amount: 300, gross_margin: 30 } },
  ]
  expect(portfolioFinance(portfolio)).toEqual({ gross_margin: 50, gross_margin_rate: 12.5 })
  expect(portfolioFinance([...portfolio, { project: {}, contracts: [], finance: undefined }])).toEqual({})
  expect(portfolioFinance([{ project: {}, contracts: [], finance: { contract_amount: 0, gross_margin: 0 } }]))
    .toEqual({ gross_margin: 0 })
})

it('财务权限被拒绝不清空已获授权的项目合同，也不输出虚构财务值', async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: [{ code: 'P1', name: '项目一' }] }))
    .mockResolvedValueOnce(Response.json({ data: [{ id: 1, code: 'C1' }] }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
  const rows = await loadContractPortfolio('https://api.test', {}, new AbortController().signal, request)
  expect(rows[0]).toMatchObject({ project: { code: 'P1' }, contracts: [{ id: 1 }], finance: undefined })
  expect(request).toHaveBeenCalledTimes(3)
})
