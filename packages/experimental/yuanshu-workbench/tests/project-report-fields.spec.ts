/** 验证项目周报字段过滤与正文校验，不访问网络或后台数据。 */
import { expect, it } from 'vitest'
import type { DynamicField } from '../src/business-forms/dynamic-record.ts'
import { projectReportContent, projectReportEditable, projectReportFieldsOf } from '../src/business-forms/project-report.ts'

const fields: readonly DynamicField[] = [
  { key: 'progress_summary', label: '本周进展摘要', type: 'string', required: false },
  { key: 'key_metrics', label: '关键指标', type: 'string', required: false, unsupported: true },
  { key: 'period_start', label: '周期开始日期', type: 'string', required: false },
  { key: 'status', label: '状态', type: 'string', required: false },
]

it('只接受人工可编辑字段，系统字段和未支持字段不进入正文', () => {
  expect(projectReportFieldsOf(fields).map(def => def.key)).toEqual(['progress_summary'])
  const managed = fields.find(def => def.key === 'period_start')
  expect(managed === undefined ? true : projectReportEditable(managed)).toBe(false)
  expect(projectReportContent(fields, {
    progress_summary: '完成接口联调', key_metrics: '{}', period_start: '2026-11-24', status: 'submitted',
  })).toEqual({ progress_summary: '完成接口联调' })
})

it('非文本正文被拒绝', () => {
  expect(projectReportContent(fields, { progress_summary: 1 })).toBeUndefined()
})
