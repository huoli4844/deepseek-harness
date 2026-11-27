/** 白名单组件映射与前端校验；不依赖 React、请求或平台 API。 */
import { DAILY_FIELDS, type DailyContent, type DailyForm } from '../../../business-forms/model.ts'
import { dailySurface, type BusinessSurface } from '../../../business-forms/a2ui.ts'
import type { DailyFormView } from './model.ts'
import { EDIT_TEMPLATE } from '../../../business-forms/templates/index.ts'

/** 只接受由本地受控模板产生的布局与动作，拒绝任意 A2UI 远程组件。 */
export function formView(form: DailyForm, surface: BusinessSurface): DailyFormView {
  const expected = dailySurface(form.id, form.content)
  if (JSON.stringify(surface) !== JSON.stringify(expected)) throw new Error('Unsupported business form surface')
  return { form, template: EDIT_TEMPLATE, content: form.content, fields: DAILY_FIELDS.map(key => ({ key, label: `daily.${key}` })) }
}

/** 提交需要实际工作正文，保存草稿允许尚未填写；与后台规则一致。 */
export function canSubmit(content: DailyContent): boolean {
  return (content.completed_work + content.in_progress_work).trim().length !== 0
    && DAILY_FIELDS.every(key => Array.from(content[key]).length <= 10_000 && !content[key].includes('\0'))
}
