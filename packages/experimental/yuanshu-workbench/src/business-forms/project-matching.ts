/** 根据受控项目主数据解析工作事项中的项目；不依赖网络、React 或宿主状态。 */
import type { WeeklyProject } from './model.ts'

/** 可用于项目解析的对话或工作记录片段。 */
export interface ProjectSourceText {
  readonly source_id: string
  readonly text: string
}

/** 单条记录的项目解析结果；候选不唯一时必须交给用户确认。 */
export interface ProjectResolution {
  readonly source_id: string
  readonly matched_project?: WeeklyProject
  readonly candidates: readonly WeeklyProject[]
  readonly matched_by?: 'code' | 'name'
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s_./-]+/gu, '')
}

/**
 * 只接受项目编码或完整项目名称命中；唯一命中才返回自动匹配结果。
 * @param sources 待解析的会话、工作区和工作记录文本。
 * @param projects 当前租户后台返回的项目主数据。
 * @returns 每条来源的候选项目及唯一命中结果。
 */
export function resolveProjects(sources: readonly ProjectSourceText[], projects: readonly WeeklyProject[]): readonly ProjectResolution[] {
  return sources.map((source) => {
    const text = normalize(source.text)
    const codeMatches = projects.filter(project => project.code !== '' && text.includes(normalize(project.code)))
    const nameMatches = projects.filter(project => project.name !== '' && text.includes(normalize(project.name)))
    const candidates = [...new Map([...codeMatches, ...nameMatches].map(project => [project.id, project])).values()]
    const matchedBy = codeMatches.length === 1 ? 'code' : nameMatches.length === 1 ? 'name' : undefined
    const matched = candidates.length === 1 ? candidates[0] : undefined
    if (matched === undefined || matchedBy === undefined) return { source_id: source.source_id, candidates }
    return {
      source_id: source.source_id,
      matched_project: matched,
      candidates,
      matched_by: matchedBy,
    }
  })
}
