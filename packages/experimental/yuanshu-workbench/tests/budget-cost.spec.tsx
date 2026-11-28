// @vitest-environment jsdom
/** 验证项目财务报表的只读路由、真实汇总口径及无交易日期的成本。 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BudgetCostScreen } from '../src/client/modules/business-modules/BudgetCostScreen.tsx'
import { projectProxyRoute } from '../src/project-proxy.ts'
import { zh } from '../src/client/core/locales/locales.ts'

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

it('预算与成本的宿主入口只支持项目级读取', () => {
  for (const resource of ['budgets', 'costs']) {
    const path = '/projects/A-1/' + resource
    expect(projectProxyRoute('/yuanshu-workbench' + path)).toEqual({ path: '/api/v1/apps/shaoshi' + path, methods: ['GET'] })
    expect(projectProxyRoute('/yuanshu-workbench' + path + '/1')).toBeUndefined()
  }
})

it('自动加载首个项目，用后台总额算余额，趋势按交易日期归集', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const data = url.endsWith('/budgets') ? { summary: { budget_total: 200, committed_total: 20, forecast_total: 120 }, items: [{}] }
      : url.endsWith('/costs') ? { summary: { total: 110.11 }, items: [
        { amount: '100.01', trans_date: '2025-03-08' }, { amount: '10.10', trans_date: null },
      ] } : { items: [{ id: 1, code: 'A-1', name: '甲项目' }], page: 1, page_size: 20, total: 1 }
    return Response.json({ data })
  }))
  const translate = (key: keyof typeof zh, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce<string>(
    (message, [name, value]) => message.replace('{' + name + '}', String(value)), zh[key])
  render(<BudgetCostScreen t={translate} />)
  expect(await screen.findByText('89.89')).toBeTruthy()
  expect(screen.getByText('110.11')).toBeTruthy()
  expect(screen.getByText('2025-03')).toBeTruthy()
  expect(screen.getByText('100.01')).toBeTruthy()
  expect(screen.getByText(/1 笔成本缺少交易日期，合计 10.10/u)).toBeTruthy()
})
