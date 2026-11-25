/** 业务表单的 A2UI v0.8 消息子集：仅本地 Column、TextField、Button；不支持脚本、任意 URL 或远程组件。 */
import { DAILY_FIELDS, type DailyContent, type DailyField } from './model.ts'
import { EDIT_TEMPLATE } from './templates/index.ts'

/** 白名单文本绑定。 */
export interface FieldComponent {
  readonly id: DailyField
  readonly component: { readonly TextField: { readonly label: { readonly literalString: string }; readonly text: { readonly path: string }; readonly textFieldType: 'longText' } }
}
/** 白名单动作按钮；name 只能交给本地动作注册表。 */
export interface ActionComponent {
  readonly id: 'cancel' | 'save' | 'submit'
  readonly component: { readonly Button: { readonly child: string; readonly action: { readonly name: `daily-report.${'cancel' | 'save' | 'submit'}` } } }
}
/** 列、文本、输入与按钮的封闭组件目录。 */
export type BusinessComponent = FieldComponent | ActionComponent
  | { readonly id: string; readonly component: { readonly Text: { readonly text: { readonly literalString: string } } } }
  | { readonly id: 'root'; readonly component: { readonly Column: { readonly children: { readonly explicitList: readonly string[] } } } }
/** 受限消息格式；不是完整 A2UI 协议实现，不接受模型自行扩充目录。 */
export interface BusinessSurface {
  readonly surfaceUpdate: { readonly surfaceId: string; readonly components: readonly BusinessComponent[] }
  readonly dataModelUpdate: { readonly surfaceId: string; readonly path: '/'; readonly contents: readonly { readonly key: DailyField; readonly valueString: string }[] }
  readonly beginRendering: { readonly surfaceId: string; readonly root: 'root' }
}

/** 由已授权日报字段生成受限表面；模型只决定 dataModel 中的正文。 */
export function dailySurface(id: string, content: DailyContent): BusinessSurface {
  const fields: readonly FieldComponent[] = DAILY_FIELDS.map(key => ({ id: key,
    component: { TextField: { label: { literalString: `daily.${key}` }, text: { path: `/${key}` }, textFieldType: 'longText' } } }))
  return {
    surfaceUpdate: { surfaceId: id, components: [
      { id: 'root', component: { Column: { children: { explicitList: [...DAILY_FIELDS, ...EDIT_TEMPLATE.actions] } } } }, ...fields,
      ...EDIT_TEMPLATE.actions.map(action => ({ id: `${action}-label`,
        component: { Text: { text: { literalString: `daily.${action}` } } } })),
      ...EDIT_TEMPLATE.actions.map((action): ActionComponent => ({ id: action,
        component: { Button: { child: `${action}-label`, action: { name: `daily-report.${action}` } } } })),
    ] },
    dataModelUpdate: { surfaceId: id, path: '/', contents: DAILY_FIELDS.map(key => ({ key, valueString: content[key] })) },
    beginRendering: { surfaceId: id, root: 'root' },
  }
}
