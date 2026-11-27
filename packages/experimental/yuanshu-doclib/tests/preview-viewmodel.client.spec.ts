/** 验证预览类型判定、文本截断与解码等纯函数。 */
import { expect, it } from 'vitest'
import {
  decodePreviewText, limitPreviewText, previewBadgeKind, previewExtension, previewMode,
} from '../src/client/preview-viewmodel.ts'

it('按扩展名与 MIME 判定可内联渲染的预览方式', () => {
  expect(previewMode('质量手册.pdf', '')).toBe('pdf')
  expect(previewMode('scan', 'application/pdf')).toBe('pdf')
  expect(previewMode('photo.PNG', '')).toBe('image')
  expect(previewMode('a.svg', 'image/svg+xml')).toBe('image')
  expect(previewMode('说明.md', '')).toBe('text')
  expect(previewMode('data.csv', 'text/csv')).toBe('text')
  expect(previewMode('config', 'application/json')).toBe('text')
  expect(previewMode('收藏.url', 'application/octet-stream')).toBe('text')
  expect(previewMode('归档.zip', 'application/zip')).toBe('unsupported')
})

it('word/excel/ppt 由宿主转 PDF 后预览', () => {
  expect(previewMode('计划.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
    .toBe('office')
  expect(previewMode('台账.xlsx', '')).toBe('office')
  expect(previewMode('旧文档.doc', 'application/msword')).toBe('office')
  expect(previewMode('旧台账.xls', 'application/vnd.ms-excel')).toBe('office')
  expect(previewMode('汇报.ppt', '')).toBe('office')
  expect(previewMode('汇报.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'))
    .toBe('office')
})

it('取预览扩展名供 Office 转换请求使用', () => {
  expect(previewExtension('计划.DOCX')).toBe('docx')
  expect(previewExtension('目录/说明.md')).toBe('md')
  expect(previewExtension('无扩展名')).toBe('')
})

it('文件图标类型优先按 MIME 判定，本地文件回退扩展名', () => {
  expect(previewBadgeKind('质量手册', 'application/pdf')).toBe('pdf')
  expect(previewBadgeKind('说明.md', '')).toBe('text')
  expect(previewBadgeKind('photo.png', '')).toBe('image')
  expect(previewBadgeKind('计划.docx', '')).toBe('word')
})

it('超长文本只保留前 limit 个字符并标记截断', () => {
  expect(limitPreviewText('abcdef', 10)).toEqual({ text: 'abcdef', truncated: false })
  expect(limitPreviewText('abcdef', 3)).toEqual({ text: 'abc', truncated: true })
})

it('文本解码优先按 UTF-8 还原中文', () => {
  const bytes = new TextEncoder().encode('中文内容')
  expect(decodePreviewText(bytes.buffer)).toBe('中文内容')
})
