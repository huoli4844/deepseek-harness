/** 浏览器表单模型；仅携带可渲染数据，不依赖 React、网络或宿主凭据。 */
import type { DailyContent, DailyField, DailyForm } from '../../../business-forms/model.ts'
import type { EditTemplate } from '../../../business-forms/templates/index.ts'
/** 受限渲染器得到的字段描述。 */
export interface BusinessFieldView { readonly key: DailyField; readonly label: `daily.${DailyField}` }
/** 日报弹窗在前端的展示模型。 */
export interface DailyFormView {
  readonly form: DailyForm
  readonly fields: readonly BusinessFieldView[]
  readonly content: DailyContent
  readonly template: EditTemplate
}
