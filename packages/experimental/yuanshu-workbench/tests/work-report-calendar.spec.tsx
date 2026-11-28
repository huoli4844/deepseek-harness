// @vitest-environment jsdom
/** 验证周报日历点击某周后下方显示只读周报详情面板。 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WeeklyReportCalendar } from '../src/client/modules/business-modules/WeeklyReportCalendar.tsx'
import { zh } from '../src/client/core/locales/locales.ts'

const t = (key: string, params?: Readonly<Record<string, unknown>>) => Object.entries(params ?? {}).reduce(
  (label, [name, value]) => label.replaceAll(`{${name}}`, String(value)), zh[key as keyof typeof zh] ?? key,
)

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const weeklyReport = {
  report: {
    id: 1, status: 'submitted', created_by: 9, period_start: '2026-11-23', period_end: '2026-11-29',
    progress_summary: '整体进展正常', submitted_at: '2026-11-27T18:00:00+08:00',
    completed_work: JSON.stringify([{
      project_code: 'EP01', project_name: '测试项目', task_id: 1, task_name: '任务A',
      completion_status: 'completed', work_type: 'direct', description: '完成登录模块',
    }]),
    planned_work: JSON.stringify([{
      project_code: 'EP01', project_name: '测试项目', task_id: 2, task_name: '任务B',
      priority: 'high', description: '联调接口',
    }]),
    issues_and_risks: JSON.stringify([{ description: '依赖未就绪', impact: '延期风险', support: '' }]),
    need_support: '需要环境权限',
  },
  labor: { total_hours: 0, employees: [] },
}

it('点击某周后显示该周只读周报详情', async () => {
  localStorage.setItem('workbench-client-token', 'test-token')
  const fetchMock = vi.fn(async () => Response.json({ data: weeklyReport }))
  vi.stubGlobal('fetch', fetchMock)
  render(<WeeklyReportCalendar t={t} month="2026-11" date="2026-11-25" onMonth={() => undefined} onDate={() => undefined} />)
  // 详情面板：周次标题 + 状态 + 五段正文。
  await screen.findByText('第 48 周（2026-11-23 ~ 2026-11-29）')
  await screen.findByText('整体进展正常')
  await screen.findByText('- 完成登录模块 [测试项目]')
  await screen.findByText('- 联调接口 [测试项目]')
  await screen.findByText('- 依赖未就绪 [延期风险]')
  await screen.findByText('需要环境权限')
  // 「已提交」在图例、日历行标签与详情面板同时出现。
  expect((await screen.findAllByText('已提交')).length).toBeGreaterThan(2)
})
