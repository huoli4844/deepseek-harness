/** 项目登记的可写字段和校验，依据云端请求定义及项目表约束，不访问网络。 */
import type { RecordContent } from './record-create.ts'

/** 项目登记首屏支持的输入字段。 */
export const projectCreateMax = { code: 50, name: 300, description: 8000, project_type: 30, priority: 20 }

/** 项目编号约束也用于定位新增后的记录。 */
export const projectCodePattern = /^(?:[A-Z]{2,8}[A-Z0-9]{3,}[A-Z0-9-]*|SHAOSHI-[A-Za-z0-9._-]*)$/u

/** 选项原值来自项目表当前字段备注。 */
export const projectCreateOptions = {
  project_type: ['engineering', 'rd', 'contract', 'operation', 'preresearch', 'maintenance', 'new_build', 'retrofit'],
  priority: ['high', 'low', 'normal'],
} as const

/** 拦截缺少必填内容、编码格式错误或不在正式值域中的选项。 */
export function invalidProjectFields(content: RecordContent): readonly string[] {
  return Object.entries(projectCreateMax).flatMap(([key, limit]) => {
    const value = content[key]?.trim() ?? ''
    if (key === 'code' && !projectCodePattern.test(value)) return [key]
    if (key === 'name' && !value) return [key]
    if (Array.from(value).length > limit || value.includes('\0')) return [key]
    const options = key === 'project_type' ? projectCreateOptions.project_type : key === 'priority' ? projectCreateOptions.priority : undefined
    return value && options && !options.some(option => option === value) ? [key] : []
  })
}

/** 只发送获准编辑且已填写的字段，其他字段使用服务端默认值。 */
export function projectCreatePayload(content: RecordContent): object {
  return Object.fromEntries(Object.keys(projectCreateMax).flatMap((key) => {
    const value = content[key]?.trim()
    return value ? [[key, value]] : []
  }))
}
