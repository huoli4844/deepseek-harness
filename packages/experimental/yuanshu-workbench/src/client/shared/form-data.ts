/** 读取表单的文本字段，保持空值语义，不依赖界面组件。 */

/** 读取文本控件的值，字段缺失时返回空字符串。 */
export function readFormText(data: FormData, key: string): string {
  const value = data.get(key)
  return typeof value === 'string' ? value : ''
}
