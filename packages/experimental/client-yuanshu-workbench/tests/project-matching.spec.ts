import { expect, it } from 'vitest'
import { resolveProjects } from '../src/business-forms/project-matching.ts'

const projects = [
  { id: 1, code: 'P-100', name: '智慧园区一期' },
  { id: 2, code: 'P-200', name: '智慧园区二期' },
] as const

it('用唯一项目编码或完整名称自动匹配', () => {
  const result = resolveProjects([
    { source_id: 'conversation', text: 'P-100 本周完成联调' },
    { source_id: 'journal', text: '智慧园区二期完成验收' },
  ], projects)
  expect(result).toEqual([
    { source_id: 'conversation', matched_project: projects[0], candidates: [projects[0]], matched_by: 'code' },
    { source_id: 'journal', matched_project: projects[1], candidates: [projects[1]], matched_by: 'name' },
  ])
})

it('多项目候选不自动选择，保留候选供表单人工确认', () => {
  const result = resolveProjects([{ source_id: 'ambiguous', text: '智慧园区项目进度同步' }], projects)
  expect(result).toEqual([{ source_id: 'ambiguous', candidates: [] }])
  const mixed = resolveProjects([{ source_id: 'mixed', text: 'P-100 与 P-200 联合评审' }], projects)
  expect(mixed[0]).toEqual({ source_id: 'mixed', candidates: projects })
})

it('匹配忽略编码中的常见分隔符和大小写差异', () => {
  const result = resolveProjects([{ source_id: 'normalized', text: 'p 100 已完成' }], projects)
  expect(result[0]?.matched_project).toEqual(projects[0])
})
