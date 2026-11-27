/** 固定编辑模板的运行时绑定；只接受随工作台发布的版本，不加载模型布局或外部样式。 */
import edit from './edit.v1.json' with { type: 'json' }

/** 工作台编辑模板的本地布局元数据。 */
export interface EditTemplate {
  readonly id: 'edit'
  readonly version: 1
  readonly maxWidth: number
  readonly initialFocus: 'firstEditableField'
  readonly actions: readonly ['cancel', 'save', 'submit']
}

function bindEditTemplate(): EditTemplate {
  if (edit.templateId !== 'edit' || edit.version !== 1 || edit.initialFocus !== 'firstEditableField'
    || edit.layout.scrollRegion !== 'body' || JSON.stringify(edit.layout.footer) !== '["cancel","save","submit?"]'
    || !Number.isSafeInteger(edit.layout.maxWidthCssPx) || edit.layout.maxWidthCssPx <= 0) {
    throw new Error('Unsupported fixed edit template; select a new template version explicitly')
  }
  const template: EditTemplate = { id: 'edit', version: 1, maxWidth: edit.layout.maxWidthCssPx,
    initialFocus: 'firstEditableField', actions: ['cancel', 'save', 'submit'] }
  return Object.freeze(template)
}

/** 日报显式选用 edit.v1；顺序或语义改变时必须新增模板版本。 */
export const EDIT_TEMPLATE = bindEditTemplate()
