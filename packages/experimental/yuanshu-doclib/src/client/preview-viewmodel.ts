/** 预览纯视图函数：渲染方式判定、文本解码截断与图标类型，不依赖请求、React 或组件。 */
import { kindByName, mimeKind, type DoclibMimeKind } from './viewmodel.ts'

/** 预览渲染方式：图片、PDF、文本与 Office（转 PDF 后）可内联展示，其余只能降级为下载说明。 */
export type DoclibPreviewMode = 'image' | 'pdf' | 'text' | 'office' | 'unsupported'

/** 文本预览最多展示的字符数，超出部分提示下载查看，避免整份大文件进 DOM。 */
export const PREVIEW_TEXT_LIMIT = 200_000

/** 图片扩展名：浏览器可直接内联渲染。 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tif', 'tiff'])

/** Office 扩展名：原始字节需宿主 officeKit 转 PDF 后才能内联预览。 */
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

/** 文本扩展名：纯文本、代码、csv/tsv 表格文本与 .url 快捷方式。 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'log', 'csv', 'tsv', 'ini', 'conf', 'toml', 'env', 'url',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs',
  'rb', 'php', 'sh', 'bash', 'zsh', 'sql', 'html', 'htm', 'css', 'scss', 'less', 'vue', 'svelte', 'diff', 'patch',
])

/** 取小写扩展名；无扩展名或隐藏文件返回空串。 */
function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/**
 * 取文件名扩展名，供 Office 转 PDF 请求与本地文件判定复用。
 * @param name - 文件名或标题。
 * @returns 小写扩展名；无扩展名返回空串。
 */
export function previewExtension(name: string): string {
  return extensionOf(name)
}

/** MIME 是否指向可转 PDF 的 Office 文档（OLE2 与 OOXML 两种命名）。 */
function isOfficeMime(mime: string): boolean {
  return mime.includes('msword') || mime.includes('ms-excel') || mime.includes('ms-powerpoint')
    || mime.includes('wordprocessingml') || mime.includes('spreadsheetml') || mime.includes('presentationml')
}

/**
 * 按文件名与 MIME 决定预览渲染方式。
 * 文件名为首选依据（列表响应的 MIME 可能缺失或过于笼统），csv 等表格文本按文本渲染，
 * word/excel/ppt 走宿主 Office 转 PDF。
 * @param name - 文件名或标题。
 * @param mimeType - 接口返回的 MIME，可为空串。
 * @returns 预览渲染方式。
 */
export function previewMode(name: string, mimeType: string): DoclibPreviewMode {
  const extension = extensionOf(name)
  const mime = mimeType.trim().toLowerCase()
  if (extension === 'pdf' || mime.includes('pdf')) return 'pdf'
  if (IMAGE_EXTENSIONS.has(extension) || mime.startsWith('image/')) return 'image'
  // MIME 只认明确的文本 / JSON / XML 家族；Office 的 openxmlformats 不是文本。
  const textualMime = mime.startsWith('text/') || mime === 'application/json'
    || mime.endsWith('+json') || mime === 'application/xml' || mime.endsWith('+xml')
  if (TEXT_EXTENSIONS.has(extension) || textualMime) return 'text'
  if (OFFICE_EXTENSIONS.has(extension) || isOfficeMime(mime)) return 'office'
  return 'unsupported'
}

/**
 * 预览弹窗的文件图标类型：知识库文档用 MIME 判定，本地文件无 MIME 时按扩展名判定。
 * @param name - 文件名或标题。
 * @param mimeType - MIME，可为空串。
 * @returns 图标类型。
 */
export function previewBadgeKind(name: string, mimeType: string): DoclibMimeKind {
  return mimeType.trim() === '' ? kindByName(name) : mimeKind(mimeType)
}

/**
 * 解码文本字节：优先严格 UTF-8；失败时按 GB18030（兼容 GBK/GB2312）读取，再退回宽松 UTF-8。
 * @param buffer - 文件字节。
 * @returns 解码后的文本。
 */
export function decodePreviewText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // 中文企业文档常见 GBK 编码，严格 UTF-8 解码失败后按 GB18030 读取。
  }
  try {
    return new TextDecoder('gb18030').decode(buffer)
  } catch {
    // 运行环境缺少 GB18030 支持时退回宽松 UTF-8，至少保留可读的 ASCII 部分。
    return new TextDecoder('utf-8').decode(buffer)
  }
}

/** 文本截断结果：展示文本与是否被截断。 */
export interface PreviewText {
  readonly text: string
  readonly truncated: boolean
}

/**
 * 截断超长文本，只保留前 limit 个字符。
 * @param text - 原始文本。
 * @param limit - 最大字符数，默认 {@link PREVIEW_TEXT_LIMIT}。
 * @returns 截断后的文本与标记。
 */
export function limitPreviewText(text: string, limit: number = PREVIEW_TEXT_LIMIT): PreviewText {
  return text.length <= limit ? { text, truncated: false } : { text: text.slice(0, limit), truncated: true }
}
